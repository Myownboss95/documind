# Auth — Senior Interview Cheat Sheet (flow-ready)

Each item: **what they're testing → strong answer → soundbite.**

## 1. Access vs refresh tokens
- **Testing:** do you understand token lifetimes and blast radius?
- **Answer:** Access token is short-lived (~15m), sent on every request, stateless (verified by signature, no DB). Refresh token is long-lived (~7d), used only to mint new access tokens, and is stateful (server stores a hash so it can be rotated/revoked). Short access TTL limits how long a stolen access token is useful; the refresh token limits how often the long-lived credential travels.
- **Soundbite:** "Access is a stateless short-lived key; refresh is a stateful long-lived key I can rotate and revoke."

## 2. Where to store tokens on the client (THE big one)
- **Testing:** XSS vs CSRF tradeoff awareness.
- **Answer:** Three options: (a) `localStorage` — readable by any JS, so **XSS = instant token theft**; avoid. (b) **httpOnly cookie** — JS can't read it, kills XSS token theft, but cookies are auto-sent so you must defend **CSRF** (SameSite=Lax/Strict + CSRF token for cross-site POST). (c) **in-memory** (JS variable) — safest from persistence theft but lost on refresh, so pair with a refresh cookie. Best practice for a web app: access token in memory or httpOnly cookie, refresh token in httpOnly + Secure + SameSite cookie, never in localStorage.
- **Soundbite:** "localStorage trades CSRF-safety for XSS-exposure — a bad trade. httpOnly+SameSite cookies flip it: no XSS token theft, and CSRF is a solved problem."

## 3. XSS
- **Answer:** Cross-site scripting = attacker runs JS in your page (unsanitized input, risky deps). If tokens live in JS-readable storage, XSS steals them. Mitigate: httpOnly cookies (token unreadable), CSP headers, output encoding, framework escaping, dependency hygiene. XSS is *the* reason not to use localStorage for tokens.

## 4. CSRF
- **Answer:** Cross-site request forgery = another site makes the browser send an authenticated request using your auto-attached cookie. Only relevant for cookie auth. Mitigate: `SameSite=Lax/Strict` cookies (blocks most cross-site sends), anti-CSRF tokens (double-submit or synchronizer) for state-changing requests, check Origin/Referer. Bearer-token-in-header auth is naturally CSRF-immune (attacker can't set your header), which is the one upside of header tokens.

## 5. Token rotation + reuse detection
- **Answer:** Each refresh is single-use: using it issues a new pair and invalidates the old (rotation). If an already-used refresh token appears again, it's a theft signal → revoke the whole token family / all sessions and force re-login. Requires server-side storage (a hash) of the current refresh token, plus a unique jti per token so rotations differ.
- **Soundbite:** "Rotation makes refresh tokens single-use; reuse detection turns a replay into an automatic revoke-all."

## 6. The JWT revocation problem
- **Testing:** the classic stateless-JWT gotcha.
- **Answer:** A stateless JWT can't be un-issued before it expires — no DB check per request. So if you fire an employee, their access token works until `exp`. Mitigations: keep access TTL short (minutes), keep authorization data OUT of the token (look up fresh perms), maintain a denylist/version counter (`tokenVersion` bumped on revoke), or use server sessions when instant revocation matters. Trade statelessness (scale) against revocation (control).
- **Soundbite:** "JWTs are bearer tokens you can't recall — short TTLs and a revocation list are how you claw control back."

## 7. JWT is signed, not encrypted
- **Answer:** The payload is base64, publicly readable. Never put secrets/PII in it. The signature only proves integrity/authenticity, not confidentiality. Use JWE if you truly need an encrypted payload (rare).

## 8. Algorithm attacks (senior signal)
- **Answer:** Two classic bugs: (a) `alg: none` — a token claiming no signature; reject it, pin the expected algorithm. (b) **HS256/RS256 confusion** — if a server verifies with a key based on the token's own `alg` header, an attacker can sign an HS256 token using the public RS256 key as the HMAC secret. Fix: server enforces the algorithm explicitly, never trusts the token's `alg`.

## 9. Password storage
- **Answer:** Slow, salted hash — bcrypt/scrypt/argon2 (argon2id is the modern pick). Per-user salt (baked into the hash) defeats rainbow tables; slowness caps guess rate on a DB leak. Optionally a server-side "pepper" (a secret added before hashing, stored separately). Never fast hashes (md5/sha) for passwords.

## 10. Account enumeration
- **Answer:** Login, signup, and forgot-password must not reveal whether an email exists (same message + similar timing). Otherwise attackers harvest valid accounts for phishing/credential-stuffing.

## 11. Brute force / credential stuffing
- **Answer:** Rate-limit by IP + account, exponential backoff/lockout, CAPTCHA after N failures, breached-password checks (HaveIBeenPwned k-anonymity), and MFA. Credential stuffing (reused leaked passwords) is defeated mainly by MFA + breached-password checks.

## 12. Broken Object-Level Authorization (BOLA/IDOR) — multi-tenant
- **Testing:** authZ, not just authN.
- **Answer:** AuthN says who you are; authZ says what you can touch. `GET /documents/:id` must check the doc belongs to the caller's workspace — otherwise user A reads user B's doc by guessing an id. Scope every query by the owner (`WHERE workspace_id = :current`). This is OWASP API #1.
- **Soundbite:** "Authentication ≠ authorization — every object read/write must be scoped to the caller's tenant, or you've got an IDOR."

## 13. Transport + cookie flags
- **Answer:** TLS everywhere; cookies `Secure` (HTTPS-only), `httpOnly` (no JS), `SameSite`. Never put tokens in URLs (leak via logs, Referer, browser history).

## 14. OAuth2 / OIDC + SPAs
- **Answer:** OAuth2 = delegated authorization; OIDC = identity layer on top (the ID token). For browser/mobile clients use **Authorization Code + PKCE** (never implicit flow, never a client secret in the browser). Don't hand-roll social login — use a provider/library.

## 15. Next.js-specific
- **Answer:** Next.js has a server, so prefer httpOnly cookies read in server components / route handlers / middleware; or a BFF where the Next server holds tokens and proxies to the API so the browser never sees them. Auth.js/NextAuth defaults to httpOnly-cookie sessions. Do route protection in middleware. Don't leak tokens into client bundles or `localStorage`.

## 16. MFA / session hardening (bonus)
- TOTP/WebAuthn; rotate session id on privilege change (prevents session fixation); "log out everywhere" via a token-version bump; device/session list.

---
### 30-second framing to open with
"I separate authentication from authorization. For tokens I default to short-lived access + rotating refresh with reuse detection and server-side refresh hashing. The decision that drives everything is client storage — I avoid localStorage because of XSS, prefer httpOnly+SameSite cookies (or a BFF for a web app), and I keep authZ data out of the JWT so I can revoke by lookup. Then the usual hardening: argon2/bcrypt passwords, rate limiting, no account enumeration, TLS + secure cookie flags, and per-tenant object-level checks to avoid IDOR."
