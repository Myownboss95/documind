# Stage 1 — NestJS Fundamentals (DocuMind `Documents` module)

## What we built
The `Documents` feature module (DocuMind's first slice), exercising every core Nest
building block, each mapped to Laravel.

| Nest construct | File | Job | Laravel equivalent |
|---|---|---|---|
| Module | `documents/documents.module.ts` | wire controller + service | Service Provider |
| Controller | `documents/documents.controller.ts` | HTTP layer, decorator routing, DI | Controller |
| Service (provider) | `documents/documents.service.ts` | business logic, injectable | container-resolved service |
| DTO | `documents/dto/create-document.dto.ts` | request body shape + rules | Form Request |
| Middleware | `common/middleware/*.ts` | request-id + logging (runs first) | HTTP kernel middleware |
| Guard | `common/guards/api-key.guard.ts` | "is this allowed?" | auth middleware / Gate / Policy |
| Pipe | `ValidationPipe` (main.ts) + `ParseUUIDPipe` | validate/transform args | Form Request / route constraint |
| Interceptor | `common/interceptors/transform.interceptor.ts` | wrap handler, `{ data, meta }` envelope | "after" middleware / API Resource |
| Exception filter | `common/filters/all-exceptions.filter.ts` | errors → consistent shape, no leaks | `App\Exceptions\Handler` |

## The Nest request lifecycle (memorize)
```
Request
  → Middleware        (request-id, logging)          [runs first; sees every request]
  → Guards            (ApiKeyGuard: allowed?)         [reject 401/403 before work]
  → Interceptors(pre) (start timer)                   [before handler]
  → Pipes             (ValidationPipe, ParseUUIDPipe) [validate/transform args → 400]
  → Controller        → Service (logic)               [the actual work]
  → Interceptors(post)(wrap in { data, meta })        [transform success only]
  → Exception Filter  (on any throw → { error }, log) [errors bypass interceptors]
Response
```
Key ordering facts:
- Middleware is earliest → request-id/logging see everything, even rejected requests.
- Guard runs before pipes → don't validate input from someone not allowed in.
- Interceptor shapes SUCCESS; filter shapes ERRORS (errors bypass the interceptor).

## Guard scope rule
Apply a guard at the **broadest scope where the rule is uniformly true**: route < controller < global. Broadest-uniform = least repetition = fewest chances to forget = fewer auth-bypass bugs. Global needs a `@Public()` opt-out (Reflector + metadata) for login/health.

## How this bites you in prod
- **Auth bypass** (the planted bug): a method-scoped guard left `POST`/`GET :id` unprotected → unauthenticated writes. Guard at the controller/global scope.
- **Info disclosure**: returning raw error messages/stacks leaks internals → generic 5xx to client, full detail to logs only.
- **Mass assignment**: without `whitelist`/`forbidNonWhitelisted`, a client can inject `isAdmin:true` → privilege escalation / data corruption.
- **Lost traceability**: no correlation id → can't debug a failure across services. request-id in middleware + logged in the filter fixes it.
- **Timing attacks**: comparing secrets with `===` leaks the key byte-by-byte → use `timingSafeEqual`.

## Observability note
Logger (pino/Nest) = produces structured JSON in-app; Datadog/CloudWatch = ingests/searches it. Log `requestId` + `durationMs` on every request; correlation id stitches logs+metrics+traces.
