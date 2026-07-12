import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtConfig, type JwtPayload } from '../auth.constants';
import type { AuthedUser } from '../auth.types';

/**
 * JWT STRATEGY  (Stage 2 · ② — the Passport way)
 * ----------------------------------------------
 * PassportStrategy(Strategy) registers a strategy named 'jwt' (the default name).
 * The super() config tells Passport HOW to authenticate:
 *  - jwtFromRequest: where to find the token -> the "Authorization: Bearer <token>"
 *    header. (This is why clients send `Authorization: Bearer eyJ...`.)
 *  - ignoreExpiration: false -> reject expired tokens (Passport checks exp for us).
 *  - secretOrKey: the ACCESS secret -> Passport verifies the signature with it.
 *
 * If the signature/expiry check passes, Passport calls validate() with the decoded
 * payload. WHATEVER validate() RETURNS becomes req.user. Here we map the raw JWT
 * claims to our minimal AuthedUser principal.
 *
 * (In a real app you might re-load the user from the DB here to catch
 * deactivated accounts — trading a lookup for freshness, the tradeoff from ①.)
 *
 * LARAVEL parallel: a custom guard's user resolver / Socialite strategy — the bit
 * that turns a credential into the authenticated user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConfig.access.secret,
    });
  }

  // Passport calls this only AFTER signature + expiry are verified.
  validate(payload: JwtPayload): AuthedUser {
    // Defense in depth: even though the access secret already differs from the
    // refresh secret, reject anything not explicitly typed as an access token.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('wrong token type');
    }
    return { userId: payload.sub, email: payload.email };
  }
}
