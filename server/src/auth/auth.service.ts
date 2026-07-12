import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import type { UserEntity } from '../users/user.entity';
import { jwtConfig, type JwtPayload } from './auth.constants';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * AUTH SERVICE  (Stage 2 · ①–③)
 * -----------------------------
 * Verifies credentials, issues tokens, and now ROTATES refresh tokens with
 * reuse detection.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<UserEntity> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('invalid credentials');
    }
    return user;
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.validateUser(email, password);
    return this.issueTokens(user);
  }

  /**
   * REFRESH + ROTATE (Stage 2 ③).
   * 1. Cryptographically verify the refresh token (signature + expiry, refresh secret).
   * 2. Load the user; ensure they have an active stored refresh hash.
   * 3. Compare the presented token's hash to the stored one (constant time).
   *    - MISMATCH but valid signature = an old/rotated token replayed => THEFT.
   *      Revoke all sessions (clear the stored hash) and reject.
   *    - MATCH = legitimate => rotate: issue a NEW pair (which stores the new hash,
   *      so THIS refresh token can never be used again).
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: jwtConfig.refresh.secret,
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }

    // Defense in depth: reject an access token presented at the refresh endpoint.
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('wrong token type');
    }

    const user = await this.users.findById(payload.sub);
    if (!user || !user.hashedRefreshToken) {
      // No active session for this user (never logged in, or already revoked).
      throw new UnauthorizedException('refresh token revoked');
    }

    if (!this.hashesEqual(this.sha256(refreshToken), user.hashedRefreshToken)) {
      // Valid signature but NOT the current token => reuse of a rotated token.
      // Treat as compromise: revoke everything, force a fresh login.
      await this.users.setRefreshTokenHash(user.id, null);
      throw new UnauthorizedException('refresh token reuse detected — all sessions revoked');
    }

    return this.issueTokens(user); // rotates: stores the new hash, old one now dead
  }

  /** Log out = clear the stored refresh hash so no refresh token works anymore. */
  async logout(userId: string): Promise<void> {
    await this.users.setRefreshTokenHash(userId, null);
  }

  /**
   * Sign an access + refresh token, and STORE the hash of the new refresh token.
   * Storing here (on every issue) is what makes login AND rotation persist the
   * current token. Payload holds only id + email — never secrets (it's public).
   */
  private async issueTokens(user: UserEntity): Promise<TokenPair> {
    const base = { sub: user.id, email: user.email };
    const [accessToken, refreshToken] = await Promise.all([
      // type: 'access' -> the JwtStrategy asserts this; a refresh token can't pass.
      this.jwt.signAsync(
        { ...base, type: 'access' },
        { secret: jwtConfig.access.secret, expiresIn: jwtConfig.access.expiresIn },
      ),
      // type: 'refresh' + jti. jti = a random unique id per refresh token; without
      // it, two refreshes in the same second (iat granularity = 1s) would produce
      // IDENTICAL tokens, breaking rotation/reuse-detection.
      this.jwt.signAsync(
        { ...base, type: 'refresh', jti: randomUUID() },
        { secret: jwtConfig.refresh.secret, expiresIn: jwtConfig.refresh.expiresIn },
      ),
    ]);
    // Persist the hash of the CURRENT refresh token (replaces any previous).
    await this.users.setRefreshTokenHash(user.id, this.sha256(refreshToken));
    return { accessToken, refreshToken };
  }

  /**
   * SHA-256 (fast) — correct here, unlike passwords which need bcrypt (slow).
   * WHY the difference? A refresh token is a long, HIGH-ENTROPY random string, so
   * brute-forcing the hash is infeasible regardless of speed; a fast hash is fine
   * and avoids bcrypt's 72-byte input limit (JWTs exceed it). A password is
   * LOW-entropy/guessable, so it needs a deliberately slow hash.
   */
  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Constant-time comparison of two hex hashes (avoids timing leaks). */
  private hashesEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
