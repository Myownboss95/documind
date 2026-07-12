/**
 * AUTHED USER  (Stage 2 · ②)
 * --------------------------
 * The principal attached to req.user after a token is verified. Deliberately
 * MINIMAL — just an id + email, NOT the token, NOT the password hash, NOT secrets.
 * (Same rule as Stage 1: req is shared and logged; keep only safe identity data.)
 */
export interface AuthedUser {
  userId: string;
  email: string;
}
