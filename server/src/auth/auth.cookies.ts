import type { Response, CookieOptions } from 'express';

/**
 * REFRESH-TOKEN COOKIE  (Stage 2 · ④)
 * -----------------------------------
 * We put the REFRESH token in a cookie with these flags — each flag is a defense:
 *  - httpOnly: true   -> JavaScript CANNOT read it (document.cookie won't see it).
 *                        This is what defeats XSS token theft: even if an attacker
 *                        runs JS on your page, they can't exfiltrate the token.
 *  - secure           -> only sent over HTTPS (on in prod). Stops network sniffing.
 *  - sameSite: 'lax'  -> browser won't attach it to cross-SITE requests, which is
 *                        the core CSRF defense. 'strict' is tighter but breaks some
 *                        top-level navigations; 'lax' is the common balance.
 *  - path: '/auth'    -> the cookie is ONLY sent to /auth/* routes, not every API
 *                        call. Least exposure: the refresh token isn't flying
 *                        around on requests that don't need it.
 *
 * The ACCESS token deliberately does NOT go in a cookie here — it's returned in
 * the body for the client to hold in memory. (You could also cookie it; the
 * refresh token is the sensitive long-lived one we most want out of JS.)
 */
export const REFRESH_COOKIE = 'refresh_token';

const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches token TTL

const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/auth',
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions, maxAge: REFRESH_MAX_AGE_MS });
}

/** Clear must use the SAME name+path or the browser won't remove the cookie. */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions);
}
