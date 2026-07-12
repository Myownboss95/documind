# Stage 2 — Planted Bug (ANSWER KEY — don't open until you've attempted the debug)

**Location:** `server/src/auth/auth.constants.ts` — the JWT secrets.

---

<!-- ================= SPOILER BELOW ================= -->

## The bug
The **refresh secret was changed to equal the access secret** (a classic copy-paste:
`?? 'dev-access-secret-change-me'` on both). Access and refresh tokens are now signed
with the **same key**.

## Why it's dangerous (token confusion)
The `JwtStrategy` verifies the ACCESS token using the ACCESS secret. If refresh
tokens are signed with that same secret, a **refresh token now validates as an access
token**. So an attacker (or buggy client) can send the long-lived refresh token in the
`Authorization: Bearer` header and access protected routes — defeating the whole point
of short-lived access tokens. Worse, the refresh token often has a 7-day life, so a
leaked one is usable for a week on the API.

## The symptom you'd observe
- Normal flows all work (login, refresh, rotation, logout) — nothing looks broken.
- BUT: take the `refreshToken` from login and send it as `Authorization: Bearer <refreshToken>`
  to `GET /auth/me` (or `/documents`) → it returns **200** with the user, when it should
  be **401** (a refresh token is not an access token).

## The tell (how to spot it in code)
Two token types sharing one secret. In review: access and refresh must use
**different secrets**. Also, nothing distinguishes the two token TYPES in the payload.

## The fix (two layers — do both in prod)
1. **Different secrets** — restore the distinct refresh secret:
   ```ts
   refresh: { secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me', ... }
   ```
   Now a refresh token fails signature verification under the access secret → 401.
2. **Token-type claim (defense in depth)** — put `type: 'access' | 'refresh'` in the
   payload and have each verifier assert the type it expects. Even if secrets were ever
   shared or rotated wrongly, a refresh token still can't be used as an access token.

## The lesson
Different token types must be cryptographically separable — distinct secrets and/or a
verified `type` claim. Sharing a signing key across token purposes is a real vuln class
(token confusion / token substitution).
