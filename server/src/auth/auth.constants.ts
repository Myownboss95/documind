/**
 * JWT CONFIG  (Stage 2)
 * ---------------------
 * Secrets from env with dev-only defaults. In Stage 3+ these move to
 * @nestjs/config and MUST be strong random values in production (a weak/committed
 * secret means anyone can forge tokens). Access and refresh use DIFFERENT secrets
 * so a leak of one doesn't compromise the other.
 */
export const jwtConfig = {
  access: {
    secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    expiresIn: '15m', // short: a stolen access token dies fast
  },
  refresh: {
    // DISTINCT from the access secret — different token types must be
    // cryptographically separable, or a refresh token can be replayed as an
    // access token (token confusion). This was the Stage 2 planted bug.
    secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    expiresIn: '7d', // long: used only to mint new access tokens
  },
} as const;

/** The shape we put INSIDE the JWT. Public (base64-readable) — no secrets here. */
export interface JwtPayload {
  sub: string; // subject = user id (standard JWT claim)
  email: string;
  /** Which token this is. Each verifier asserts the type it expects (defense in
   *  depth against token confusion, even if secrets were ever misconfigured). */
  type: 'access' | 'refresh';
}
