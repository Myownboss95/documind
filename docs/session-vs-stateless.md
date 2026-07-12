# Session vs Stateless (JWT) Auth — decision guide

## The core difference
- **Stateless (JWT):** the token is self-contained and verified by SIGNATURE. The
  server stores nothing and hits no DB to authenticate. Any replica can verify it.
- **Stateful (session / opaque token):** the client holds only an ID; the real
  state lives in a server-side store (Redis/DB). Every request LOOKS IT UP.

## Trade-offs

| Dimension | Stateless JWT | Stateful session |
|---|---|---|
| Per-request cost | none (verify signature) | a store lookup |
| Horizontal scale | trivial (nothing shared) | needs a shared session store (Redis) |
| Revocation | **hard** — can't un-issue before exp | **trivial** — delete the session row |
| Logout-everywhere | needs token-version/denylist | delete the user's sessions |
| Payload freshness | stale until exp (perms baked in) | always fresh (read on lookup) |
| Size on the wire | larger (whole payload each request) | tiny (an ID) |
| Best fit | mobile, service-to-service, multi-client, scale | first-party web app, need instant revoke |

## The revocation problem (the crux)
A JWT is a bearer token you can't recall: fire an employee and their access token
works until `exp`. Mitigations: short access TTL (minutes), keep authЗ data OUT of
the token (look up fresh), a `tokenVersion`/denylist, or use sessions when instant
revocation matters.

## What WE built = a hybrid (this is the pragmatic real-world answer)
- **Access token = stateless JWT** (short TTL, no DB per request → scales).
- **Refresh token = stateful** (server stores a hash → can rotate, revoke, detect
  reuse).
So we get JWT's scale on the hot path (every API call) AND session-like control on
the cold path (refresh/logout). This hybrid is extremely common and a strong
interview answer.

## When to pick which
- **Pure first-party web app, need instant revoke, one datacenter?** Sessions
  (or Sanctum SPA mode) are simpler and safer.
- **Mobile + web + third-party APIs, many services, must scale out?** JWT access +
  stateful refresh (what we built) / OAuth2 (Passport).
- **Microservices needing to verify identity without calling an auth service every
  hop?** Stateless JWT shines (verify locally by signature).

## Soundbite
"Stateless JWT buys scale but forfeits easy revocation; stateful sessions buy
revocation but need a shared store. I default to a hybrid — stateless short-lived
access tokens for the hot path, a stateful rotating refresh token for control —
unless it's a pure first-party web app, where I'd just use sessions."
