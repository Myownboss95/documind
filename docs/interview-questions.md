# Interview question bank

All out-loud questions collected across stages. Use for the Day 2 PM final sweep.
Answer each without notes; if you hesitate, add the concept to `weak-spots.md`.

## Stage 1 — NestJS fundamentals
1. Walk me through the NestJS request lifecycle, and where you'd hook auth, validation, response shaping, and error handling — and why in that order.
2. Guard vs Pipe vs Interceptor vs Exception Filter — what question does each answer, and give a real use for each.
3. What's dependency injection buying you here, and why is a constructor-injected service better than `new`-ing it? Tie it to testing and swapping the in-memory store for a DB.

(Bonus asked live: why Observables over Promises for LLM tokens; what SSE is; pino vs Datadog.)

## Stage 2 — Auth
1. Walk through your JWT auth end to end (login → protected request → refresh → logout) and say where state lives and why (hybrid: stateless access + stateful refresh).
2. How do you detect + respond to a stolen refresh token? (rotation = single-use, reuse detection = revoke-all, store a hash + jti).
3. Where do you store tokens on the client and why? (httpOnly+SameSite cookie for refresh, memory for access; XSS vs CSRF; BFF for Next.js).
4. Token confusion: why must access and refresh tokens use different secrets and/or a `type` claim?
5. Session vs stateless — when do you pick each? The JWT revocation problem and its mitigations.
See `docs/auth-interview.md` for the full senior cheat sheet (16 topics).

## Stage 3 — Postgres

## Stage 4 — Redis

## Stage 5 — React + Next.js

## Stage 6 — LLM / agentic / RAG

## Stage 7 — Containerize + CI
