# DocuMind Study Notes

> Master study guide for the DocuMind build (NestJS + Postgres RAG knowledge base),
> written for a senior engineer coming from Laravel. Each stage below has the same shape:
> **What we built → Files & line-by-line → Key concepts → Laravel & Prisma parallels →
> Interview Q&A → Production concerns**. This file is append-friendly: Stages 4–7 get added
> as new `##` sections later.
>
> Complements the existing docs — don't duplicate them: `stage-01.md` (lifecycle table),
> `stage-01-bug.md` / `stage-02-bug.md` (planted-bug answer keys), `auth-interview.md`
> (16-topic auth cheat sheet), `session-vs-stateless.md` (stateful-vs-JWT decision guide).

---

## Stage 1 — NestJS Fundamentals

### What we built

The `Documents` feature module — DocuMind's first vertical slice: create / list / get
document metadata (upload is still a stub). It's a deliberate tour of **every** core Nest
building block — module, controller, service (DI), DTO + `ValidationPipe`, middleware,
guard, interceptor, exception filter — so each construct is anchored to a real endpoint.
The controller is written as a **seam**: its code never changes when Stage 3 swaps the
in-memory store for a Postgres repository.

### Files & what each does

#### `src/main.ts` — the bootstrap (Laravel's `public/index.php` + kernel)

Where the app is assembled and the **global** cross-cutting pieces are registered.

```ts
const app = await NestFactory.create(AppModule);   // build the DI container from the root module
app.use(cookieParser());                           // raw Express middleware, runs before everything Nest
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
app.useGlobalInterceptors(new TransformInterceptor());
app.useGlobalFilters(new AllExceptionsFilter());
await app.listen(process.env.PORT ?? 3000);
```

- `NestFactory.create(AppModule)` — reads the root module's metadata and **instantiates the
  whole DI graph once** at boot. Nothing is `new`-ed per request; providers are singletons.
- `app.use(cookieParser())` — a *raw Express* middleware at the adapter level (Nest runs on
  Express). Parses the `Cookie` header into `req.cookies`, which the Stage 2 refresh flow reads.
- **The three `ValidationPipe` options each close a hole** (the interview-worthy part):
  - `whitelist: true` → strip any property **not** on the DTO. `{..., isAdmin:true}` →
    `isAdmin` dropped before it can reach an entity. The anti-**mass-assignment** guard.
  - `forbidNonWhitelisted: true` → don't just strip extras, **reject with 400**. Surfaces
    client bugs loudly.
  - `transform: true` → turn parsed JSON into a real DTO **class instance** and coerce
    primitives (route param `"1"` → `number`). Without it, `instanceof CreateDocumentDto` is false.

#### `src/app.module.ts` — the root module + middleware wiring

```ts
@Module({ imports: [...], controllers: [AppController], providers: [AppService] })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, LoggerMiddleware).forRoutes('*');
  }
}
```

- `@Module({...})` is the unit of organization — Laravel's Service Provider equivalent.
- **Middleware is registered only via `configure()`**, not in `@Module` metadata — the one
  place Nest still uses the raw Express middleware model. `consumer.apply(A, B)`: **argument
  order = execution order**, so `RequestIdMiddleware` runs before `LoggerMiddleware` (the
  logger needs the id first). `.forRoutes('*')` = all routes.
- The `ConfigModule.forRoot({ isGlobal: true })` and `TypeOrmModule.forRootAsync` lines here
  are Stage 3 — covered in that section.

#### `src/app.controller.ts` / `src/app.service.ts` — the trivial root route

```ts
@Controller()                        // no prefix → routes at "/"
export class AppController {
  constructor(private readonly appService: AppService) {}  // DI: Nest injects the singleton
  @Public() @Get() getHello(): string { return this.appService.getHello(); }
}
```

- `constructor(private readonly appService: AppService)` — the **entire DI mechanism** in one
  line. `private readonly` is TS shorthand that declares and assigns the field; Nest sees the
  `AppService` **type** and injects the shared instance. You never write `new`.
- `@Public()` (Stage 2) marks the root reachable without a token — the global JWT guard would
  otherwise 401 it.

#### `src/documents/documents.controller.ts` — the HTTP layer

```ts
@Controller('documents')             // route prefix → every method lives under /documents
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}
  @Get()      findAll()                                         { return this.documentsService.findAll(); }
  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string)  { return this.documentsService.findOne(id); }
  @Post()     create(@Body() dto: CreateDocumentDto)           { return this.documentsService.create(dto); }
}
```

- `@Controller('documents')` sets the **prefix**; the method decorators map to
  `GET /documents`, `GET /documents/:id`, `POST /documents`. Nest reads these at **startup**
  and registers the routes — no manual `app.use()`/router like raw Express.
- `@Param('id', ParseUUIDPipe)` — a **parameter-level pipe**. Validates the param IS a UUID
  *before* the handler; malformed id → clean **400**, service never called. A *valid* UUID
  that doesn't exist → **404** thrown by the service. Two distinct failure modes.
- `@Body() dto: CreateDocumentDto` — with the global `ValidationPipe` + `transform` on, `dto`
  arrives as a validated **class instance**.
- `@Post` → **201** by default; `@Get` → **200**.
- The comment about the guard is the thread through the stages: Stage 1 put
  `@UseGuards(ApiKeyGuard)` at class level; the **planted bug** moved it to one method
  (auth bypass); Stage 2 removed it for a **global** JWT guard — "secure by default".

#### `src/documents/documents.service.ts` — business logic provider

- `@Injectable()` marks a class as a **provider** the DI container can construct. In Stage 1
  it held an **in-memory array**; the singleton lifetime let that array persist across
  requests. Stage 3 swapped the guts to a TypeORM repository **without touching the
  controller** — the "seam" payoff. (Repository detail in Stage 3.)

#### `src/documents/documents.module.ts` — wiring

```ts
@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity])],  // Stage 3
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
```

- `controllers` = the HTTP surface this module owns; `providers` = the injectables it
  registers. A provider is **private to its module** unless `exports`-ed. The `imports` line
  is Stage 3.

#### `src/documents/dto/create-document.dto.ts` — the request contract

```ts
export class CreateDocumentDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsString() @IsNotEmpty()                 sourceUri!: string;
  @IsIn(['application/pdf','text/plain','text/markdown']) mimeType!: string;
}
```

- Each decorator is one **class-validator** rule read **at runtime** by `ValidationPipe` — a
  Laravel Form Request's `rules()` as decorators.
- **Why a class, not an interface** — decorators need a real runtime object; interfaces are
  erased at compile time and can't carry validation metadata.
- `title!` — TS's *definite assignment assertion* ("trust me, this gets set"), silencing
  strict mode since the framework populates it.

#### `src/common/middleware/request-id.middleware.ts` — correlation id (runs first)

```ts
use(req, res, next): void {
  const incoming = req.header('x-request-id');
  req.id = incoming && incoming.trim() !== '' ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
```

- A Nest middleware is **just a class with `use(req, res, next)`** — the Express signature,
  wrapped for DI (`@Injectable()`).
- **Production touch**: reuses an upstream `X-Request-Id` if present, else mints a UUID → one
  request keeps **one** id across service hops (distributed tracing).
- `next()` is mandatory — forgetting it **hangs the request** (same as raw Express).

#### `src/common/middleware/logger.middleware.ts` — structured request logging

```ts
req.startTime = performance.now();
this.logger.log(`--> ${req.method} ${req.originalUrl} [${req.id}]`);
res.on('finish', () => {
  const ms = Math.round(performance.now() - req.startTime);
  this.logger.log(`<-- ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms [${req.id}]`);
});
next();
```

- **Why `res.on('finish')`, not a line after `next()`**: status code and duration don't exist
  until the response is fully sent; `next()` returns while async work is still pending.
  `'finish'` fires **exactly once**, at the true end — precisely how `morgan`/`pino-http` work.
- **Why `performance.now()`, not `Date.now()`**: it's a **monotonic** clock that never jumps.
  The wall clock can move backward (NTP/DST) and produce negative durations.

#### `src/common/guards/api-key.guard.ts` — the guard (Stage 1's authZ demo)

```ts
canActivate(context: ExecutionContext): boolean {
  const req = context.switchToHttp().getRequest<Request>();
  const provided = req.header('x-api-key') ?? '';
  if (!this.safeEqual(provided, this.expectedKey)) throw new UnauthorizedException('missing or invalid API key');
  return true;
}
private safeEqual(a, b): boolean {
  const bufA = Buffer.from(a), bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

- A guard answers **one question: "may this request proceed?"** Return `true` → continue;
  `false` → **403**; **throw** → your chosen status (here **401**). Runs **after middleware**
  (so `req.id` exists) and **before** pipes/handler (don't validate input from someone not
  allowed in).
- `ExecutionContext` is a **transport-agnostic** wrapper; `switchToHttp().getRequest()` gets
  the Express `req`. The abstraction is why the same guard could run over WS/gRPC.
- **Production touch — timing-safe compare**: `===` leaks via *timing* (bails on the first
  mismatched byte, returning faster) → an attacker guesses the key byte-by-byte.
  `crypto.timingSafeEqual` compares in **constant time**. The length pre-check is a standard
  accepted trade-off.
- This guard is a teaching artifact; Stage 2 replaced it on real routes with the global JWT
  guard, but it's the cleanest `CanActivate` illustration.

#### `src/common/interceptors/transform.interceptor.ts` — the response envelope

```ts
const start = performance.now();                    // BEFORE the handler runs
return next.handle().pipe(
  map((data) => ({ data, meta: { requestId: req.id, durationMs: Math.round(performance.now() - start), timestamp: new Date().toISOString() } })),
);
```

- An interceptor **wraps** the handler: code before `next.handle()` runs before; `.pipe(map)`
  runs after and transforms the result. That before/after sandwich makes it ideal for
  **timing + response shaping** at once.
- Every success gets `{ data, meta: { requestId, durationMs, timestamp } }` → the frontend
  parses **one** shape; every response carries its `requestId`.
- **RxJS in one line**: `next.handle()` returns the result as an **Observable** (a stream);
  `map()` transforms the emitted value. Nest models responses as streams so the same
  mechanism supports **SSE / streaming** later (streaming LLM tokens in Stage 6).
- **Crucial ordering fact**: interceptors only wrap **success**. A thrown error **skips**
  `map()` and goes to the filter — which is why the *error* shape lives there, not here.

#### `src/common/filters/all-exceptions.filter.ts` — the last line of defense

```ts
@Catch()                       // no args → catch EVERYTHING (HttpException + unexpected errors)
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    // message: pull from getResponse() if HttpException, else generic 'internal server error'
    if (status >= 500) this.logger.error(line, stack);   // full detail SERVER-side only
    else               this.logger.warn(`${line} ${message}`);
    res.status(status).json({ error: { statusCode: status, message, requestId: req.id, timestamp, path } });
  }
}
```

- `@Catch()` with **no arguments** = catch everything that bubbles up — Laravel's
  `App\Exceptions\Handler::render()`. (`@Catch(SomeException)` would scope it to one type.)
- Three production-critical jobs:
  1. **Consistent shape** — every error is `{ error: { statusCode, message, requestId,
     timestamp, path } }`. Fixed the previously un-enveloped 404.
  2. **No leaks** — unexpected 5xx returns a **generic** message; the real error + stack is
     only **logged**. Leaking stacks is info-disclosure. Deliberate `HttpException`s (a 404
     message, validation array) pass their message through safely.
  3. **Correlatable logs** — every error logged **with `req.id`**. 5xx at `error` (with
     stack); 4xx at `warn` (client's fault, less noisy).

#### `src/types/express.d.ts` — typing the request augmentation

```ts
declare global { namespace Express { interface Request { id: string; startTime: number; } } }
```

- Middleware attaches `id`/`startTime` to `req`. Rather than `(req as any).id` everywhere
  (unsafe), we **augment Express's `Request` type once** — now `req.id` is typed app-wide.
- Baked-in security rule: only *non-sensitive* metadata goes on `req` — never tokens/secrets,
  because `req` is shared and frequently logged. Stage 2 keeps this with a minimal principal.

### Key concepts

- **The request lifecycle (ordered pipeline):** `Middleware → Guards → Interceptors(pre) →
  Pipes → Handler → Interceptors(post) → Exception Filter`. The order is *why* things work:
  auth before validation, error shaping separate from success shaping. Memorize this.
- **Dependency Injection & providers:** declare *what* you need by type in a constructor;
  Nest supplies a **singleton**. Buys testability (inject a fake), a **swappable seam**
  (in-memory → DB with no controller change), and shared state.
- **Module encapsulation:** providers are private to their module unless `exports`-ed.
- **Decorator-driven metadata:** `@Controller`, `@Get`, `@Injectable`, `@IsString`,
  `@SetMetadata` attach metadata read at boot (routing/DI) or per request (validation).
  Requires `emitDecoratorMetadata` + `reflect-metadata`.
- **The four cross-cutting constructs and the question each answers:**
  - **Guard** → *"May you proceed?"* (authN/authZ), rejects early.
  - **Pipe** → *"Is this input valid / what type?"* (validate + transform args).
  - **Interceptor** → *"Wrap the call"* (timing, envelope, caching, streaming).
  - **Filter** → *"Something threw — turn it into a response"* (error shaping, logging).
- **Envelope + correlation id:** one success shape (`{data, meta}`), one error shape
  (`{error}`), a `requestId` on both, threaded from middleware through filter.

### Laravel & Prisma parallels

| Nest concept | Laravel equivalent | Prisma / ORM note |
|---|---|---|
| `@Module` | Service Provider | n/a (Prisma is a client, not a module system) |
| Provider + constructor DI (`@Injectable`) | Service Container / type-hinted constructor | inject a `PrismaService` wrapping `PrismaClient` |
| `@Controller` + `@Get/@Post` | Controller + route attributes | n/a |
| Middleware (`configure()`) | HTTP kernel middleware | n/a |
| Guard (`CanActivate`, `@UseGuards`) | `auth` middleware / Gate / Policy | n/a |
| Pipe + DTO + `ValidationPipe` | Form Request `rules()` | Prisma has **no validation layer** — you still need class-validator/zod at the edge |
| `ParseUUIDPipe` on param | `->whereUuid('id')` route constraint | n/a |
| Interceptor (`NestInterceptor`) | "after" middleware / API Resource | n/a |
| Exception Filter (`@Catch`) | `App\Exceptions\Handler::render()` | n/a |
| `whitelist`/`forbidNonWhitelisted` | `$fillable`/`$guarded` + `$request->validated()` | Prisma has no mass-assignment guard; validate first |

**Prisma-vs-TypeORM angle:** Stage 1 is ORM-agnostic — the only DB touch is the service seam.
Carry this forward: **neither Prisma nor TypeORM validates request input**; that's the
DTO/pipe layer, which is why mass-assignment protection lives at the edge in Nest.

### Interview Q&A

**Q1. Walk through the NestJS request lifecycle and where you hook auth, validation, response
shaping, error handling — and why in that order.** `Middleware → Guards → Interceptors(pre) →
Pipes → Handler → Interceptors(post) → Filters`. Auth in a **guard** (early) rejects
unauthorized requests before spending work or validating their input. Validation in a
**pipe** — after the guard, since there's no point validating input from someone not allowed
in. Response shaping in an **interceptor** (post) because it wraps the success return.
Error handling in a **filter**, which catches anything thrown anywhere. The order encodes
"cheapest rejection first; success-shaping separate from error-shaping."

**Q2. Guard vs Pipe vs Interceptor vs Exception Filter — the question each answers + a use.**
Guard = "may you proceed?" (JWT/API-key). Pipe = "is this arg valid and rightly typed?"
(`ValidationPipe`, `ParseUUIDPipe`). Interceptor = "wrap the call" (timing + `{data, meta}`,
caching, streaming). Filter = "something threw — make it an HTTP response" (one error shape,
generic 5xx, logged with requestId). Tell them apart by *when they run*: guards/pipes before
the handler and can reject; interceptors straddle before **and** after; filters run only on a
throw and short-circuit the interceptor's success path.

**Q3. What is DI buying you, and why is a constructor-injected service better than `new`?**
**Testability** (inject a fake without a DB), a **swappable seam** (Stage 3 replaced the
in-memory store with a repository and the controller didn't change — it depends on the type,
not a construction), and **lifecycle control** (singletons share in-memory state and DB
pools). `new` hard-codes the dependency, defeats mocking, loses singleton semantics.

**Q4. Why a DTO + global `ValidationPipe` over handler checks, and what do
`whitelist`/`forbidNonWhitelisted`/`transform` do?** Centralizing means handlers see clean,
typed data — no scattered `typeof` checks, one place to change a rule. `whitelist` strips
undeclared properties (kills mass assignment); `forbidNonWhitelisted` upgrades that to a 400;
`transform` builds a real DTO instance and coerces primitives. Together = Laravel's Form
Request + `$request->validated()`.

**Q5. Why `res.on('finish')` and `performance.now()` in the logger?** `'finish'` because
status/duration only exist once the response is fully sent; logging after `next()` captures
neither. `performance.now()` because it's monotonic — `Date.now()` can move backward (NTP/DST)
and yield negative durations.

**Q6. Why `ExecutionContext`/`ArgumentsHost` instead of raw `req`, and what's
`switchToHttp()`?** They're transport-agnostic wrappers so the same guard/interceptor/filter
runs over HTTP, WS, or gRPC. `switchToHttp()` narrows to HTTP and returns the Express
`req`/`res`.

**Q7. Why RxJS Observables in the interceptor instead of returning a value?** Nest models a
handler's result as an Observable stream, so the pipeline supports one-shot **and** streaming
(SSE — used for streaming LLM tokens in Stage 6). `next.handle()` is the stream; `.pipe(map)`
transforms each emission. A normal endpoint emits once, but the abstraction makes streaming
a drop-in.

**Q8. Where do interceptors sit relative to filters, and why does the error shape live in the
filter?** Interceptors wrap **success**; a thrown error bypasses `map()` and lands in the
filter. So the success envelope belongs in the interceptor and the error envelope in the
filter — mutually exclusive paths. Error shaping in the interceptor would miss everything
that throws.

**Q9. What makes the API-key compare "timing-safe," and why bother?** `===` short-circuits on
the first mismatched byte, so closer guesses return marginally slower — measurable over many
requests to recover the key byte-by-byte. `timingSafeEqual` is constant-time. Same class as
comparing password hashes with `==`; a real, exploited vuln category.

### Production concerns / gotchas

- **Auth bypass via scope (planted bug):** a guard moved from class-level to one method left
  `POST`/`GET :id` unprotected → unauthenticated writes. Apply a guard at the *broadest scope
  where the rule is uniformly true* (route < controller < global). See `stage-01-bug.md`.
- **Mass assignment:** without `whitelist`/`forbidNonWhitelisted`, `isAdmin:true` flows into
  your entity → privilege escalation.
- **Info disclosure:** raw error messages/stacks leak internals → generic 5xx to client, full
  detail in logs only.
- **Lost traceability:** no correlation id → can't stitch a failure across services.
  request-id middleware + logging `req.id` fixes it; reuse an upstream `X-Request-Id`.
- **Timing attacks:** `===` on secrets → `timingSafeEqual`.
- **Hung requests:** forgetting `next()` in middleware hangs the request forever.
- **`@Res` foot-gun (Stage 2):** grabbing the raw `Response` without `{ passthrough: true }`
  makes you own the response and *bypasses* the interceptor envelope.
- **Decorator metadata build gotcha:** routing/DI/validation all ride on
  `emitDecoratorMetadata` + `reflect-metadata`. A loader that drops decorator metadata
  (`ts-node` vs `tsx` mismatch) makes DI/validation silently fail — bites hardest in Stage 3's
  migration CLI.

---

## Stage 2 — Auth

### What we built

JWT auth with a **hybrid** design: a **stateless short-lived access token** (~15m, verified
by signature, no DB) for the hot path, plus a **stateful long-lived refresh token** (~7d,
server stores a hash) for control. Passport's `JwtStrategy` verifies access tokens; a
**global** `JwtAuthGuard` protects every route by default with a `@Public()` opt-out. Refresh
does **rotation** (single-use, `jti`) with **reuse detection** (replay a rotated token →
revoke all sessions). The refresh token lives in an **httpOnly + Secure + SameSite** cookie
scoped to `/auth`; the access token goes in the response body for the client to hold in
memory. The planted bug was **token confusion** (access & refresh sharing a secret).

### Files & what each does

#### `src/auth/auth.constants.ts` — secrets + payload shape

```ts
export const jwtConfig = {
  access:  { secret: process.env.JWT_ACCESS_SECRET  ?? 'dev-access-secret-change-me',  expiresIn: '15m' },
  refresh: { secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me', expiresIn: '7d'  },
} as const;
export interface JwtPayload { sub: string; email: string; type: 'access' | 'refresh'; }
```

- **Access and refresh use DIFFERENT secrets** — the crux of the planted bug. Different token
  types must be cryptographically separable, or a refresh token verifies as an access token
  (**token confusion**). Access TTL is short (a stolen access token dies in 15m); refresh TTL
  is long (only ever used to mint new access tokens).
- `JwtPayload` is what goes **inside** the JWT — it's base64, **publicly readable**, so
  **never** put secrets/PII here. `sub` = subject = user id (standard JWT claim). `type` is
  the defense-in-depth discriminator each verifier asserts.

#### `src/auth/auth.types.ts` — the request principal

```ts
export interface AuthedUser { userId: string; email: string; }
```

- The principal attached to `req.user` after verification — deliberately **minimal**: id +
  email, **not** the token, password hash, or secrets. Same Stage 1 rule: `req` is shared and
  logged, so keep only safe identity data.

#### `src/auth/strategies/jwt.strategy.ts` — Passport verification (the `super()` config)

```ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),  // where the token is
      ignoreExpiration: false,                                   // reject expired tokens
      secretOrKey: jwtConfig.access.secret,                      // verify with the ACCESS secret
    });
  }
  validate(payload: JwtPayload): AuthedUser {
    if (payload.type !== 'access') throw new UnauthorizedException('wrong token type');
    return { userId: payload.sub, email: payload.email };
  }
}
```

- `PassportStrategy(Strategy)` registers a strategy named `'jwt'` (the default). The
  **`super()` config tells Passport HOW to authenticate**:
  - `jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()` → read the token from
    `Authorization: Bearer <token>` (this is why clients send that header).
  - `ignoreExpiration: false` → Passport checks `exp` and rejects expired tokens for you.
  - `secretOrKey: jwtConfig.access.secret` → verify the signature with the **access** secret.
- **Whatever `validate()` returns becomes `req.user`.** Passport calls it **only after** the
  signature + expiry pass. Here we map raw claims to the minimal `AuthedUser`.
- `payload.type !== 'access'` — **defense in depth**: even though the access secret already
  differs from the refresh secret, we still reject anything not explicitly an access token.
- The commented note: a real app might re-load the user from the DB here to catch deactivated
  accounts — trading a per-request lookup for freshness (the stateless-vs-fresh tradeoff).

#### `src/auth/guards/jwt-auth.guard.ts` — the global guard + `@Public()` (Reflector)

```ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) { super(); }
  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isPublic) return true;                 // skip auth for @Public() routes
    return super.canActivate(context);         // otherwise run the JWT check
  }
}
```

- Extends Passport's `AuthGuard('jwt')`, which runs `JwtStrategy` (extract → verify → attach
  `req.user`, or 401). We add one thing: check `@Public()` metadata first.
- `Reflector` reads decorator metadata. `getAllAndOverride(KEY, [handler, class])` checks the
  **handler first, then the controller** — so `@Public()` works at either level (method
  override wins).
- Registered **globally** via `APP_GUARD` (see the module) → **secure by default**. New
  routes are auto-protected — the exact opposite of the Stage 1 bug where a route was left
  open. It's registered through DI (not `app.useGlobalGuards(new ...)`) specifically so it can
  **inject `Reflector`**.

#### `src/auth/decorators/public.decorator.ts` — the opt-out (`SetMetadata`)

```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- A decorator that just **attaches metadata** `{ isPublic: true }`; the guard is what *acts*
  on it. This split (decorator tags, guard reads) is the standard Nest metadata pattern and is
  what makes a global guard practical — login/health must be reachable without a token.

#### `src/auth/decorators/current-user.decorator.ts` — `createParamDecorator`

```ts
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.user as AuthedUser;
  },
);
```

- `createParamDecorator` builds a custom **parameter** decorator that pulls something off the
  request and injects it straight into a handler arg: `me(@CurrentUser() user: AuthedUser)`.
- Passport put the principal on `req.user` (from `validate()`); this just reads it, so
  controllers never touch the raw request. (Laravel: `auth()->user()`.)

#### `src/auth/decorators/refresh-token.decorator.ts` — cookie-or-body extraction

```ts
export const RefreshToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const fromBody   = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    return fromCookie ?? fromBody;
  },
);
```

- Pulls the refresh token from the httpOnly **cookie first** (web app), falling back to the
  request **body** (mobile / non-browser clients that can't use cookies). One decorator serves
  both client types; returns `undefined` if neither is present (handler then 401s).
- `req.cookies` is populated by `cookie-parser` (wired in `main.ts`).

#### `src/auth/auth.cookies.ts` — the refresh cookie flags (each flag is a defense)

```ts
const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/auth',
};
export function setRefreshCookie(res, token)  { res.cookie(REFRESH_COOKIE, token, { ...baseOptions, maxAge: REFRESH_MAX_AGE_MS }); }
export function clearRefreshCookie(res)        { res.clearCookie(REFRESH_COOKIE, baseOptions); }
```

- `httpOnly: true` → JS **cannot** read it (`document.cookie` won't see it). **This defeats
  XSS token theft**: even with JS running on your page, the token can't be exfiltrated.
- `secure` → only sent over HTTPS (on in prod). Stops network sniffing.
- `sameSite: 'lax'` → not attached to cross-**site** requests → the core **CSRF** defense.
  `'strict'` is tighter but breaks top-level navigations; `'lax'` is the common balance.
- `path: '/auth'` → the cookie is only sent to `/auth/*`, not every API call → least exposure.
- `clearCookie` **must use the same name + path** or the browser won't remove it (a real
  gotcha).

#### `src/auth/auth.service.ts` — credentials, issue, rotation, reuse detection

```ts
async validateUser(email, password) {
  const user = await this.users.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    throw new UnauthorizedException('invalid credentials');   // SAME message either way
  return user;
}
```
- **Generic error** whether the email is unknown or the password is wrong → no **account
  enumeration**. `bcrypt.compare` is the slow, salted verification.

```ts
async refresh(refreshToken) {
  const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, { secret: jwtConfig.refresh.secret });  // 1. verify sig+exp w/ REFRESH secret
  if (payload.type !== 'refresh') throw new UnauthorizedException('wrong token type');                          // defense in depth
  const user = await this.users.findById(payload.sub);
  if (!user || !user.hashedRefreshToken) throw new UnauthorizedException('refresh token revoked');              // 2. must have an active session
  if (!this.hashesEqual(this.sha256(refreshToken), user.hashedRefreshToken)) {                                  // 3. presented != stored
    await this.users.setRefreshTokenHash(user.id, null);                                                        //    => REUSE: revoke ALL sessions
    throw new UnauthorizedException('refresh token reuse detected — all sessions revoked');
  }
  return this.issueTokens(user);                                                                                //    MATCH => rotate (new hash stored)
}
```
- **Rotation + reuse detection, step by step:** (1) cryptographically verify the token with
  the **refresh** secret; (2) load the user and confirm they have a stored refresh hash (an
  active session); (3) constant-time compare the presented token's SHA-256 to the stored hash.
  A **mismatch with a valid signature** means an **old, already-rotated token was replayed** —
  a theft signal → wipe the stored hash (revoke everything) and reject. A **match** → rotate:
  `issueTokens` stores a *new* hash, so this refresh token can never be used again.

```ts
private async issueTokens(user) {
  const base = { sub: user.id, email: user.email };
  const [accessToken, refreshToken] = await Promise.all([
    this.jwt.signAsync({ ...base, type: 'access' },                 { secret: jwtConfig.access.secret,  expiresIn: jwtConfig.access.expiresIn }),
    this.jwt.signAsync({ ...base, type: 'refresh', jti: randomUUID() }, { secret: jwtConfig.refresh.secret, expiresIn: jwtConfig.refresh.expiresIn }),
  ]);
  await this.users.setRefreshTokenHash(user.id, this.sha256(refreshToken));  // persist the CURRENT refresh hash
  return { accessToken, refreshToken };
}
```
- Both tokens carry `type`; the refresh token also gets a **`jti`** (random unique id).
  **Why `jti` matters**: `iat` has 1-second granularity, so two refreshes in the same second
  would otherwise produce **identical** tokens — breaking rotation/reuse detection. `jti`
  guarantees uniqueness.
- Storing the hash **on every issue** (login *and* rotation) is what makes both flows persist
  the current token, so the previous one is instantly dead.

```ts
private sha256(value) { return createHash('sha256').update(value).digest('hex'); }
```
- **SHA-256 (fast) is correct for the refresh token, unlike passwords (bcrypt, slow).** A
  refresh token is a long, **high-entropy** random string, so brute-forcing its hash is
  infeasible regardless of speed — a fast hash is fine and avoids bcrypt's 72-byte input limit
  (JWTs exceed it). A password is **low-entropy/guessable**, so it needs a deliberately slow
  hash. `hashesEqual` uses `timingSafeEqual` again.

#### `src/auth/auth.controller.ts` — the endpoints + the `@Res({ passthrough })` gotcha

```ts
@Public() @Post('login') @HttpCode(HttpStatus.OK)
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const tokens = await this.authService.login(dto.email, dto.password);
  setRefreshCookie(res, tokens.refreshToken);   // refresh -> httpOnly cookie
  return { accessToken: tokens.accessToken };    // access  -> body (client memory)
}
```

- `@Res({ passthrough: true })` — gives you the Express `Response` to set/clear cookies **but
  keeps Nest in charge of the returned value**, so the `{data, meta}` interceptor envelope
  still works. **Without `passthrough`** you take over the response entirely and must
  `res.json()` yourself — a very common gotcha that silently drops the envelope.
- `@Public()` on `login`/`refresh` because the global guard would otherwise 401 them (you
  can't have a token yet). `@HttpCode(HttpStatus.OK)` overrides `@Post`'s default 201.
- `logout` calls `authService.logout(user.userId)` (clears the stored hash → server-side
  revoke) **and** `clearRefreshCookie(res)` (removes it from the browser). `me` just returns
  `@CurrentUser()`.

#### `src/auth/auth.module.ts` — Passport + the global guard via `APP_GUARD`

```ts
@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AuthModule {}
```

- `imports`: `UsersModule` (for `UsersService`, which it **exports**), `PassportModule`
  (Passport infra), `JwtModule.register({})` (empty — secret/expiry are supplied **per-token**
  in `AuthService`, since access and refresh differ).
- `{ provide: APP_GUARD, useClass: JwtAuthGuard }` — the **DI-based global guard
  registration**. Because it's provided through the container (not `app.useGlobalGuards`), the
  guard can **inject `Reflector`** for the `@Public()` check. Every route is now protected
  unless tagged `@Public()`.

#### `src/users/*` (Stage 2 role) — the user store the auth flow depends on

- `users.service.ts`: `findByEmail` / `findById` for login and refresh; `setRefreshTokenHash`
  is the single method that both **rotation** and **logout/revoke** call (write the new hash,
  or `null` to revoke). (Entity + repository + seeding detail lives in Stage 3.)
- `users.module.ts`: **exports `UsersService`** — the encapsulation gotcha. A provider is
  private to its module; without `exports`, `AuthModule` importing `UsersModule` still
  couldn't inject `UsersService` ("Nest can't resolve dependency").

### Key concepts

- **Access vs refresh (the hybrid):** access = stateless, short-lived, verified by signature,
  no DB on the hot path (scales). Refresh = stateful, long-lived, server stores a hash so it
  can be **rotated, revoked, and reuse-detected** (control). Best of both.
- **Rotation + reuse detection:** each refresh is single-use; using it issues a new pair and
  kills the old. A replayed (already-rotated) token is a theft signal → revoke the whole
  family. Needs a stored hash + a unique `jti`.
- **Where state lives:** nothing for access (signature only); a per-user refresh **hash** in
  Postgres for refresh. Logout = null the hash.
- **Token storage on the client (the big one):** `localStorage` = XSS-readable (avoid);
  httpOnly cookie = XSS-safe but needs CSRF defense (SameSite + path); in-memory = safest from
  persistence theft but lost on reload. We use httpOnly+Secure+SameSite for refresh, memory
  for access.
- **Secure by default:** global guard + `@Public()` opt-out beats per-route guards — new
  routes are protected automatically.
- **Defense in depth against token confusion:** *distinct secrets* AND a verified `type`
  claim. Either alone would help; both means a refresh token can never act as an access token
  even if a secret were ever misconfigured.
- **Hashing choice by entropy:** slow hash (bcrypt/argon2) for low-entropy passwords; fast
  hash (SHA-256) for high-entropy tokens.
- **No account enumeration:** identical error + timing for unknown-email vs wrong-password.

### Laravel & Prisma parallels

| Nest / auth concept | Laravel equivalent | Prisma / ORM note |
|---|---|---|
| `JwtStrategy` + `PassportModule` | Sanctum / Passport guard + user resolver | n/a (auth is app-layer, ORM-agnostic) |
| Global `JwtAuthGuard` via `APP_GUARD` | `auth:api` middleware on a route group | n/a |
| `@Public()` (`SetMetadata` + `Reflector`) | excluding a route / `->withoutMiddleware` | n/a |
| `@CurrentUser()` (`createParamDecorator`) | `auth()->user()` / `$request->user()` | n/a |
| `LoginDto` + `ValidationPipe` | `LoginRequest` Form Request | validate at edge; ORM doesn't |
| `bcrypt.compare` | `Hash::check` / bcrypt driver | n/a |
| refresh hash in a column | Sanctum's `personal_access_tokens` (hashed) | `hashedRefreshToken` column via TypeORM update / Prisma `update` |
| httpOnly+SameSite cookie | `cookie()->httpOnly()`, `SameSite` config | n/a |
| `@nestjs/jwt` `signAsync`/`verifyAsync` | `tymon/jwt-auth` / Passport tokens | n/a |
| `setRefreshTokenHash` = `repo.update(...)` | `$user->update([...])` | Prisma: `prisma.user.update({ where, data })` |

**Prisma-vs-TypeORM angle:** the auth logic is ORM-agnostic; only `UsersService` touches the
DB. In TypeORM it's `this.users.update({ id }, { hashedRefreshToken })`; in Prisma the same is
`prisma.user.update({ where: { id }, data: { hashedRefreshToken } })`. Neither ORM changes the
security design — hashing, rotation, and cookie flags are all app-layer decisions.

### Interview Q&A

**Q1. Walk through your JWT auth end to end and say where state lives and why.** Login:
verify credentials with bcrypt, issue an **access** token (15m, signed with the access
secret) returned in the body, and a **refresh** token (7d, refresh secret, unique `jti`) set
as an httpOnly cookie; store the SHA-256 of the refresh token on the user row. Protected
request: client sends `Authorization: Bearer <access>`; the global guard runs `JwtStrategy`,
which verifies signature + expiry with the access secret and asserts `type: 'access'`, putting
a minimal principal on `req.user`. Refresh: the cookie's token is verified with the refresh
secret, its hash compared to the stored one, then rotated. Logout: null the stored hash and
clear the cookie. **State:** none for access (pure signature check → scales horizontally); a
per-user refresh hash in Postgres (→ revocation + rotation). That hybrid is the whole point.

**Q2. How do you detect and respond to a stolen refresh token?** Rotation makes every refresh
single-use: using one issues a new pair and invalidates the old by overwriting the stored
hash. If a token with a **valid signature** but a **hash that doesn't match** the stored one
shows up, it's an already-rotated token being replayed — the legitimate user and the thief now
hold different tokens, so one of them presents a stale one. That's the theft signal → I
**revoke the entire family** (null the hash, forcing re-login everywhere). Requires storing
the current refresh hash + a `jti` so rotations always differ.

**Q3. Where do you store tokens on the client and why?** Refresh token in an
**httpOnly + Secure + SameSite** cookie so JS can't read it (kills XSS token theft) and it's
not sent cross-site (CSRF defense); I scope its `path` to `/auth` so it's not attached to
every request. Access token in **memory** (a JS variable), re-fetched via refresh on reload —
never `localStorage`, which any XSS can read. For a Next.js app I'd lean on httpOnly cookies
read server-side, or a BFF that holds tokens so the browser never sees them.

**Q4. Why must access and refresh use different secrets and/or a `type` claim (token
confusion)?** If they share a secret, a refresh token validates under the access secret — so
an attacker sends the long-lived (7-day) refresh token as `Authorization: Bearer` and hits
protected routes, defeating short access TTLs entirely. Fix in two layers: **distinct
secrets** (a refresh token fails signature verification under the access secret) **and** a
verified **`type` claim** each verifier asserts (belt-and-suspenders even if secrets were ever
misconfigured or rotated wrongly). This was the Stage 2 planted bug.

**Q5. Why hash the refresh token with SHA-256 but the password with bcrypt?** Entropy. A
refresh token is a long, high-entropy random string — brute-forcing its hash is infeasible no
matter how fast the hash, and a fast hash sidesteps bcrypt's 72-byte input cap (JWTs exceed
it). A password is low-entropy and guessable, so it needs a deliberately slow, salted hash to
cap the guess rate if the DB leaks. Right tool per input.

**Q6. Session vs stateless — when do you pick each, and what's the JWT revocation problem?** A
stateless JWT can't be un-issued before `exp` — fire an employee and their access token works
until it expires. Mitigations: short access TTL, keep authЗ data OUT of the token (look up
fresh perms), a `tokenVersion`/denylist, or use sessions when instant revocation matters.
Pick sessions for a pure first-party web app needing instant revoke in one datacenter; pick
JWT access + stateful refresh for mobile/web/third-party + horizontal scale — which is exactly
the hybrid we built. (See `session-vs-stateless.md`.)

**Q7. What does the global guard + `@Public()` buy you over per-route guards, and why register
it through `APP_GUARD`?** "Secure by default": every route — including ones added next month —
is protected unless it explicitly opts out with `@Public()`. Per-route guards invert that: you
must remember to add one every time, and the one you forget is often a mutating route (the
Stage 1 bug). Registering via `APP_GUARD` (DI) rather than `app.useGlobalGuards(new ...)` lets
the guard **inject `Reflector`** so it can read the `@Public()` metadata.

**Q8. Whatever `validate()` returns becomes `req.user` — what do you put there and what do you
deliberately leave out?** Only a minimal principal — `userId` + `email`. Never the token, the
password hash, or any secret, because `req` is shared across the pipeline and frequently
logged, so anything on it can leak. If I need fresh authorization data I look it up per request
rather than baking it into the token (and could re-load the user in `validate()` to catch
deactivated accounts, trading a lookup for freshness).

**Q9. XSS vs CSRF — which does each storage choice expose you to, and how do the cookie flags
map?** `localStorage` → XSS steals the token (any injected JS reads it), and it's naturally
CSRF-immune (attacker can't set your header). httpOnly cookies flip it: JS can't read the
token (XSS-safe) but the browser auto-sends cookies, so you must defend CSRF — `SameSite=lax`
blocks cross-site sends, `path=/auth` limits exposure, `Secure` forces HTTPS. The good trade
for a web app is httpOnly+SameSite, because XSS token theft is the worse failure and CSRF is a
solved problem.

**Q10. Why `@Res({ passthrough: true })` and not a bare `@Res()`?** A bare `@Res()` hands you
the raw Express response and makes you fully responsible for sending it — which **bypasses**
Nest's interceptor, so the `{data, meta}` envelope silently disappears and you must `res.json`
yourself. `passthrough: true` lets me set cookies on the response object while still returning
a value that Nest sends through the normal interceptor pipeline. Best of both.

### Production concerns / gotchas

- **Token confusion (planted bug):** access & refresh sharing a secret → a refresh token acts
  as an access token. Fix: distinct secrets **and** a `type` claim. See `stage-02-bug.md`.
- **Account enumeration:** different error/timing for unknown-email vs wrong-password lets
  attackers harvest valid accounts. Use one generic message.
- **Refresh-token theft:** without rotation + reuse detection a leaked refresh token is usable
  for its full 7-day life. Rotation + revoke-all-on-reuse contains it.
- **XSS token theft:** tokens in `localStorage` are readable by any injected JS → httpOnly
  cookies.
- **CSRF:** cookie auth is auto-sent → `SameSite` + path scoping (+ CSRF token for cross-site
  state-changing requests).
- **The revocation gap:** a stateless access token can't be recalled before `exp` → short TTL
  + keep authЗ data out of the token + denylist/`tokenVersion` when instant revoke matters.
- **`jti` omission:** without a unique id, two refreshes in the same second are identical →
  rotation/reuse detection breaks.
- **`clearCookie` name/path mismatch:** clearing with a different path leaves the cookie in the
  browser.
- **Secrets hygiene:** weak/committed JWT secrets = anyone forges tokens. Strong random values
  from env in prod; the dev defaults are dev-only.
- **`@Res` without passthrough:** silently drops the response envelope.

---

## Stage 3 — Postgres / TypeORM

### What we built

Persisted DocuMind to a real local **Postgres 16 + pgvector**. `Document`, `User`, and
`Chunk` **entities** map to tables; the in-memory services were swapped for **TypeORM
repositories** with the controller unchanged (the Stage 1 seam paying off). Schema is managed
by **migrations** (`synchronize: false`) via a separate CLI `DataSource`. A `Chunk`
`@ManyToOne` `Document` relation sets up the classic **N+1** demo (1+N queries vs one join)
with real SQL logs.

### Files & what each does

#### `src/documents/document.entity.ts` — entity mapping, index, relation

```ts
@Entity({ name: 'documents' })
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 200 })         title!: string;
  @Column({ name: 'source_uri' })  sourceUri!: string;
  @Column({ name: 'mime_type' })   mimeType!: string;
  @Index() @Column({ type: 'varchar', default: 'pending' }) status!: DocumentStatus;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @OneToMany(() => ChunkEntity, (chunk) => chunk.document) chunks!: ChunkEntity[];
}
```

- `@Entity({ name: 'documents' })` maps the class to a table; each `@Column` to a column.
  TypeORM reads these decorators to create/query the table. (Laravel = Eloquent model + its
  migration, *combined*.)
- `@PrimaryGeneratedColumn('uuid')` → Postgres generates a **UUID** PK (`uuid_generate_v4()`).
- `@Column({ name: 'source_uri' })` → **snake_case column, camelCase property** — the common
  convention (snake in DB, camel in code).
- `@Index()` on `status` → a B-tree index because we filter documents by status a lot.
- `@CreateDateColumn` → auto-set to `now()` on insert (Laravel `$table->timestamps()`).
- `@OneToMany(() => ChunkEntity, ...)` → the **inverse** side of the relation. **Crucially,
  it's NOT a column** — it's a virtual relation TypeORM populates **only when you ask**
  (`relations`/join). By default `chunks` is `undefined` — which is **exactly how N+1 sneaks
  in**: you load docs, then query chunks per doc. The `() => ChunkEntity` thunk avoids
  circular-import problems.
- The `!` on every field is TS's **definite assignment assertion** — TypeORM sets these at
  load time, so strict mode won't complain they're uninitialized.

#### `src/documents/chunk.entity.ts` — the owning side (`@ManyToOne` + `@JoinColumn`)

```ts
@Entity({ name: 'chunks' })
export class ChunkEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'int' })  index!: number;
  @Column({ type: 'text' }) content!: string;
  @Index() @Column({ name: 'document_id' }) documentId!: string;
  @ManyToOne(() => DocumentEntity, (doc) => doc.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: DocumentEntity;
}
```

- `@ManyToOne` = "many chunks belong to one document" — the **owning** side (the one holding
  the FK). `@JoinColumn({ name: 'document_id' })` names the FK column.
- `@Index()` on `document_id` because we constantly query `chunks WHERE document_id = ?` —
  without it those are **sequential scans**. (FKs are **not** auto-indexed in Postgres — a
  classic performance trap.)
- `onDelete: 'CASCADE'` → deleting a document deletes its chunks (enforced by the DB FK, per
  the migration).
- Note both a scalar `documentId` **and** a relation `document` — the scalar lets you set/read
  the FK without loading the parent; the relation loads the parent object on demand.

#### `src/data-source.ts` — the CLI DataSource (separate from the app connection)

```ts
import 'dotenv/config';
export default new DataSource({
  type: 'postgres', host: ..., port: ..., username: ..., password: ..., database: ...,
  entities: [DocumentEntity, ChunkEntity, UserEntity],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
```

- The TypeORM **CLI** (`migration:generate/run/revert`) needs its own `DataSource` — it runs
  **outside Nest**, so it can't use `app.module`'s `forRootAsync`. That's why it loads env
  itself via `import 'dotenv/config'` and points at `src/migrations/*.ts` (TS source), while
  the app at runtime uses `dist/migrations/*.js` (compiled).
- `synchronize: false` here **and** in `app.module` — from now on schema changes go through
  migration files, never auto-sync. **The production rule.**

#### `src/migrations/1783806287271-InitSchema.ts` — the first migration

```ts
export class InitSchema1783806287271 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`CREATE TABLE "documents" (... "id" uuid ... DEFAULT uuid_generate_v4() ..., "status" ... DEFAULT 'pending', "created_at" TIMESTAMP ... DEFAULT now(), PRIMARY KEY ("id"))`);
    await qr.query(`CREATE INDEX "IDX_..." ON "documents" ("status")`);
    await qr.query(`CREATE TABLE "users" (... "email" ... , CONSTRAINT "UQ_..." UNIQUE ("email"), PRIMARY KEY ("id"))`);
  }
  async down(qr: QueryRunner) { /* DROP in reverse order */ }
}
```

- A migration is a **versioned, reviewable pair of `up`/`down`** — the timestamp prefix
  orders them; TypeORM records applied ones in a `migrations` tracking table so each runs once.
  (Laravel: `artisan make:migration` → `up()`/`down()` + the `migrations` table.)
- `up` was **generated** by diffing entities against the DB, so the exact `CREATE TABLE`
  (including the `status` index and the `email` UNIQUE constraint from the entity decorators)
  is captured as real SQL you can review before it runs — the whole point of migrations over
  `synchronize`.
- `down` drops in reverse dependency order so a rollback is clean.

#### `src/migrations/1783813313081-AddChunks.ts` — incremental schema change

```ts
async up(qr) {
  await qr.query(`CREATE TABLE "chunks" (... "document_id" uuid NOT NULL ..., PRIMARY KEY ("id"))`);
  await qr.query(`CREATE INDEX "IDX_..." ON "chunks" ("document_id")`);
  await qr.query(`ALTER TABLE "chunks" ADD CONSTRAINT "FK_..." FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
}
```

- A **second** migration, added when the `Chunk` entity arrived — schema evolves in ordered
  increments, each independently reversible. The `document_id` index and the `ON DELETE
  CASCADE` FK come straight from the entity's `@Index()` and `onDelete: 'CASCADE'`.

#### `src/documents/documents.service.ts` — repository CRUD (the seam realized)

```ts
constructor(@InjectRepository(DocumentEntity) private readonly documents: Repository<DocumentEntity>) {}

create(dto) {
  const doc = this.documents.create({ title: dto.title, sourceUri: dto.sourceUri, mimeType: dto.mimeType, status: 'pending' });
  return this.documents.save(doc);                        // create() builds; save() runs INSERT
}
findAll()      { return this.documents.find({ order: { createdAt: 'DESC' } }); }
async findOne(id) {
  const doc = await this.documents.findOne({ where: { id } });
  if (!doc) throw new NotFoundException(`document ${id} not found`);
  return doc;
}
```

- `@InjectRepository(DocumentEntity)` injects a TypeORM `Repository<DocumentEntity>` — the
  data-access object for the `documents` table. **This is the Stage 1 seam**: the controller
  never changed, only the service's guts (in-memory array → real DB).
- **Repository methods ↔ Eloquent:** `repo.create(obj)` = `new Model(obj)` (builds in memory,
  no DB); `repo.save(entity)` = `$model->save()` (INSERT/UPDATE); `repo.find(options)` =
  `Model::all()/where()->get()`; `repo.findOne({where})` = `Model::where(...)->first()`.
  Everything is **async** (returns a Promise) because it hits the DB.
- `findOne` throwing `NotFoundException` is the 404 path that pairs with the controller's
  `ParseUUIDPipe` 400 path.

#### `src/users/*` (Stage 3 role) — repository + boot-time seeding

```ts
@Injectable()
export class UsersService implements OnModuleInit {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}
  async onModuleInit() { /* seed ada@example.com if the users table is empty */ }
  findByEmail(email) { return this.users.findOne({ where: { email } }); }
  async setRefreshTokenHash(userId, hash) { await this.users.update({ id: userId }, { hashedRefreshToken: hash }); }
}
```

- `OnModuleInit` → Nest calls `onModuleInit()` **once** after the module is set up; used here
  to **seed** the demo user so login works on a fresh DB. Teaching convenience — real apps
  seed via a dedicated seeder/migration, not on boot (Laravel: `artisan db:seed`).
- `repo.update({ id }, { ... })` = `UPDATE users SET ... WHERE id = ?` — the targeted write
  rotation/logout use (no full-row load needed).
- `user.entity.ts`: `@Column({ unique: true })` on `email` → a UNIQUE index (no dupes + fast
  lookup); `@Column({ nullable: true })` on `hashed_refresh_token` → the column allows NULL
  (logged out / no active token). Returns `UserEntity | null` — TypeORM returns **null**, not
  undefined, when not found.

#### `src/demo-n1.ts` — the N+1 demonstration (with a counting SQL logger)

```ts
// NAIVE (the N+1 bug):
const docs = await docRepo.find();                       // 1 query for the parent list
for (const doc of docs) {
  await chunkRepo.find({ where: { documentId: doc.id } }); // +1 query PER doc  => 1 + N
}
// FIXED (load chunks WITH docs):
const docsWith = await docRepo.find({ relations: { chunks: true } });  // ONE join query
```

- A standalone script that seeds 3 docs × 3 chunks and runs the same logical read two ways,
  with a `TypeOrmLogger` that **counts and prints each SQL statement** so you *see* the N+1.
- **Naive** = `1 + N` queries (1 for the docs, then one per doc for its chunks) — "with 1000
  docs this is 1001 round-trips."
- **Fixed** = one query using `relations: { chunks: true }`, which TypeORM turns into a JOIN;
  constant query count regardless of doc count.
- **Senior nuance (from the plan):** a single JOIN can cause **row explosion** (parent columns
  duplicated across every child row). At large fan-out the better fix is often a **second
  batched `IN` query** (`WHERE document_id IN (...)`) or a **DataLoader** — two queries total,
  no duplication. "Fix N+1" isn't always "just JOIN."

#### `src/app.module.ts` (Stage 3 wiring) — `forRootAsync` + `forFeature`

```ts
ConfigModule.forRoot({ isGlobal: true }),
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres', host: config.get('DATABASE_HOST'), /* ...env... */
    entities: [DocumentEntity, ChunkEntity, UserEntity],
    synchronize: false,                       // schema managed by migrations
    migrations: ['dist/migrations/*.js'],     // compiled migrations the app can run
    logging: ['error', 'warn'],
  }),
}),
```

- `ConfigModule.forRoot({ isGlobal: true })` loads `.env` into a global `ConfigService`
  (Laravel `config()` + `.env`); `isGlobal` means you don't re-import it everywhere.
- `TypeOrmModule.forRootAsync` builds the connection **async** so it can read env via the
  injected `ConfigService` first (`useFactory` returns the options). `synchronize: false` is
  the prod rule; the app runs **compiled** migrations from `dist`.
- `TypeOrmModule.forFeature([Entity])` in each feature module (Documents, Users) registers a
  **repository** in that module's DI scope so its service can `@InjectRepository` it. (Laravel
  doesn't need this — the Eloquent model *is* the repository. TypeORM separates entity from
  repository, so you declare which repos a module may use.)

### Key concepts

- **Entity = model + migration combined (in decorators).** One class describes both the TS
  object and the table shape TypeORM reads to generate migrations.
- **`synchronize` vs migrations.** `synchronize: true` auto-reshapes tables from entities —
  great in dev, **dangerous in prod** (can drop/alter columns → data loss). Migrations are
  versioned, reviewable, reversible SQL and the only prod-safe path.
- **Repository pattern.** The `Repository<T>` is the data-access seam; injecting it keeps the
  controller ignorant of the store. `create` builds, `save` persists, `find`/`findOne` read.
- **Relations are lazy metadata, not columns.** `@OneToMany`/`@ManyToOne` populate only when
  you request them (`relations`) — the default `undefined` is the N+1 trap.
- **N+1 and its fixes.** Loop-of-queries = `1 + N`. Fix with an eager JOIN (`relations`), or —
  at large fan-out — a batched `IN` query / DataLoader to avoid **row explosion**.
- **Indexing.** FKs and hot filter columns need explicit indexes (Postgres doesn't auto-index
  FKs); `unique: true` gives a UNIQUE index that also enforces integrity.
- **UUID vs auto-increment PKs.** UUIDs don't leak row counts, don't collide across
  shards/services, and can be client-generated; costs: 16 bytes vs 4, and random UUIDv4 hurts
  index locality (UUIDv7/ULID fix ordering). Auto-increment is smaller and naturally ordered
  but enumerable and merge-hostile.
- **Two DataSources.** The Nest runtime connection (`forRootAsync`, compiled) is separate from
  the CLI `DataSource` (`data-source.ts`, TS source) migrations run through.

### Laravel & Prisma parallels

| TypeORM concept | Laravel (Eloquent/artisan) | Prisma equivalent |
|---|---|---|
| `@Entity` + `@Column` | Eloquent model + migration (combined) | `model` block in `schema.prisma` |
| `@PrimaryGeneratedColumn('uuid')` | `$table->uuid('id')` | `id String @id @default(uuid())` |
| `@Column({ name: 'source_uri' })` | `$table->string('source_uri')` + `$casts` | `sourceUri String @map("source_uri")` |
| `@Index()` | `$table->index('status')` | `@@index([status])` |
| `@Column({ unique: true })` | `$table->unique('email')` | `@unique` |
| `@OneToMany` / `@ManyToOne` + `@JoinColumn` | `hasMany` / `belongsTo` + `foreignId` | relation fields + `@relation` |
| `onDelete: 'CASCADE'` | `->cascadeOnDelete()` | `onDelete: Cascade` |
| `Repository<T>` + `@InjectRepository` | the Eloquent model *is* the repo | `PrismaService` methods (`prisma.document.*`) |
| `repo.create` + `repo.save` | `new Model` + `->save()` | `prisma.document.create({ data })` |
| `repo.find({ relations: { chunks: true } })` | `Document::with('chunks')->get()` (eager) | `prisma.document.findMany({ include: { chunks: true } })` |
| migrations (`migration:generate/run`) | `artisan make:migration` / `migrate` | `prisma migrate dev` / `deploy` |
| `synchronize: true` (dev only) | auto-running migrations on boot (never in prod) | `prisma db push` (dev only) |
| `OnModuleInit` seeding | `artisan db:seed` / seeders | `prisma db seed` |
| CLI `DataSource` | `config/database.php` connection | `datasource` block + `DATABASE_URL` |

**Prisma-vs-TypeORM verdict (for your evaluation):** Prisma's migrations are **schema-first**
(edit `schema.prisma`, it diffs and generates SQL) and its client is fully typed from that
schema with no decorators — simpler DX, and `include` makes eager loading (N+1 avoidance)
explicit and hard to forget. TypeORM is **code-first** with decorators (closer to your
Eloquent instinct — the class is model + schema), gives you a richer QueryBuilder and true
repository/ActiveRecord flexibility, but its lazy relations make N+1 easy to trip into and its
`synchronize`/metadata story has more foot-guns. Rough take: **Prisma for safety and DX**,
**TypeORM for control and Laravel-familiarity** — and both still need a separate validation
layer (class-validator/zod) at the edge.

### Interview Q&A

**Q1. Explain N+1 and how you'd fix it — including where a naive fix backfires.** N+1 = you
run one query to load N parents, then one query **per parent** to load its children (1 + N
round-trips) — here loading documents then querying chunks per document. The straightforward
fix is an eager JOIN (`relations: { chunks: true }` → `Document::with('chunks')` → Prisma
`include`), collapsing it to one query. But a single JOIN duplicates every parent column across
its child rows — **row explosion** — which at large fan-out ships huge result sets. Then the
better fix is a **second batched query**: load the parents, collect their ids, and
`SELECT ... WHERE document_id IN (...)` (or a DataLoader) — two queries total, no duplication.
So "fix N+1" is "eager-load, but JOIN vs batched-IN depending on fan-out."

**Q2. `synchronize: true` vs migrations — why is `synchronize` banned in prod?** `synchronize`
auto-reshapes tables to match entities on boot. In prod that can **drop or alter columns and
lose data** with no review, no history, and no rollback — a rename looks like drop-old +
add-new. Migrations are versioned, human-reviewable SQL, applied once (tracked in a
`migrations` table), and reversible via `down`. Dev convenience vs prod safety: `synchronize`
in dev, migrations everywhere real. (Prisma's analog: `db push` for dev, `migrate deploy` for
prod.)

**Q3. UUID vs auto-increment primary keys — tradeoffs?** UUIDs: don't leak row counts or allow
enumeration (`/documents/1,2,3...`), collision-free across shards/services, client-generatable
before insert — but 16 bytes vs 4, and random UUIDv4 scatters index inserts (poor B-tree
locality, page splits). Auto-increment: compact, naturally time-ordered (great index
locality), but **enumerable** (an IDOR/enumeration risk on public ids) and painful to merge
across databases. The modern middle ground is **UUIDv7/ULID** — UUID uniqueness with
time-ordered locality. DocuMind uses UUIDs so ids are non-enumerable across the multi-tenant
API.

**Q4. What is the repository pattern buying you here, and how does it relate to the Stage 1
seam?** The `Repository<T>` is a swappable data-access abstraction injected into the service.
Because the controller depends on `DocumentsService` (not on any storage), swapping the
in-memory array for a real repository changed **zero** controller code — the promised seam. It
also isolates DB concerns for testing (mock the repository) and centralizes query logic. In
Laravel the Eloquent model already *is* this repository; TypeORM separates entity from
repository, which is why each module registers its repos via `forFeature`.

**Q5. Why aren't relations loaded by default, and how is that both good and a trap?** TypeORM
treats `@OneToMany`/`@ManyToOne` as **virtual metadata**, not columns — they're populated only
when you pass `relations` (or use the QueryBuilder). Good: you don't drag every association
into memory on every read; you pay only for what you ask. Trap: the default `undefined` invites
the N+1 loop — you iterate parents and lazily fetch children one at a time. The discipline is
to declare eager loading at the query, and Prisma's explicit `include` makes that harder to
forget.

**Q6. Do you need to index foreign keys in Postgres, and why?** Yes — Postgres does **not**
auto-index FK columns (it auto-indexes primary keys and unique constraints, but not the
referencing side of an FK). We query `chunks WHERE document_id = ?` constantly, so without the
`@Index()` on `document_id` those are sequential scans, and cascading deletes also scan. It's
one of the most common real-world performance misses. Add indexes on FKs and on hot filter
columns (like `status` here); verify with `EXPLAIN ANALYZE`.

**Q7. Why does the migration CLI use a separate `DataSource` from the Nest app connection?**
The CLI runs **outside** the Nest runtime, so it can't use `AppModule`'s `forRootAsync`/DI. It
needs its own `DataSource` that loads env itself (`import 'dotenv/config'`) and knows where
entities and migration files live. There's a subtlety: the CLI points at `src/migrations/*.ts`
(TS source, run through ts-node) while the app runs `dist/migrations/*.js` (compiled) — same
migrations, different entry points for tooling vs runtime.

**Q8. `repo.create()` then `repo.save()` — why two calls, and how does it map to Eloquent?**
`create()` **builds** an entity instance in memory (applies defaults, no DB touch);
`save()` **persists** it (INSERT for a new entity, UPDATE if it has a PK). It's exactly
`$doc = new Document([...])` then `$doc->save()`. Splitting them lets you build, tweak, or
validate the instance before hitting the DB. For a targeted field write (like rotating a
refresh hash) `repo.update({ id }, { ... })` issues a direct `UPDATE ... WHERE` without loading
the row first.

**Q9. How does a decorator like `@Column({ name: 'source_uri' })` end up as real SQL, and what
build requirement does that imply?** TypeORM reads the decorator **metadata** at runtime
(field name, type, index, uniqueness) to build the schema model, then the migration generator
diffs that model against the live DB to emit `CREATE/ALTER` SQL. That entire chain depends on
`emitDecoratorMetadata` + `experimentalDecorators` + `reflect-metadata`. If you run the CLI or
app through a loader that **drops decorator metadata** (a `ts-node` vs `tsx` config mismatch),
entities look empty and migrations generate wrong or nothing — the same metadata dependency
that underpins Nest's DI and validation.

### Production concerns / gotchas

- **`synchronize: true` data loss:** auto-sync in prod can silently drop/alter columns. Keep
  it `false` everywhere real; ship migrations.
- **N+1 row-explosion:** the naive per-parent loop is `1 + N` round-trips; the naive JOIN fix
  duplicates parent rows across children. Choose eager JOIN vs batched `IN`/DataLoader by
  fan-out.
- **Unindexed foreign keys:** Postgres doesn't auto-index FKs → `WHERE document_id = ?` and
  cascading deletes become seq scans. Index FKs and hot filter columns; confirm with
  `EXPLAIN ANALYZE`.
- **Enumerable PKs:** auto-increment ids leak counts and enable enumeration/IDOR on public
  routes → prefer UUID (or UUIDv7/ULID for locality).
- **Lazy-relation surprises:** a relation left `undefined` isn't "no children," it's "not
  loaded" — code that assumes it's populated silently misbehaves.
- **Boot-time seeding:** `onModuleInit` seeding is a teaching shortcut; in prod seed via
  migrations/seeders so N replicas don't race to seed the same rows.
- **Two-DataSource drift:** the CLI `DataSource` and the app connection must list the same
  entities/migrations or generated migrations won't match runtime.
- **Decorator-metadata build breakage (`ts-node` vs `tsx`):** a loader that drops decorator
  metadata makes entities/DI/validation silently fail — the migration CLI is where this bites.

---

## Stage 4 — Redis (Cache-aside + BullMQ Queue)

### What we built

DocuMind's **async ingestion pipeline** plus a **read cache**. `POST /documents` no longer does
the heavy work inline: it saves the doc as `pending` and returns **instantly**, then a **BullMQ
worker** picks the job up off Redis and does the slow "chunk + embed" work in the background,
flipping the doc to `ready` (or `failed`). This is the **producer/consumer** split — the API
thread is freed the moment the job is enqueued. On the read side, `GET /documents` is served
**cache-aside** from Redis: hit the cache first, on a miss load from Postgres and populate the
key with a 30s TTL; any write **invalidates** the key. Two Redis concerns, one server: a raw
`ioredis` client for the cache, and BullMQ's own connection for the queue. The through-line of
the whole stage is **idempotency** — a job can run more than once, so the handler is written to
produce the same result whether it runs once or five times (skip-if-ready + delete-then-insert),
the same discipline that keeps payment and webhook systems correct.

### Files & what each does

#### `src/redis/redis.constants.ts` — the DI token for the raw client

```ts
export const REDIS = 'REDIS_CLIENT';
```

- A **string injection token**. `CacheService` needs a raw `ioredis` client, but `Redis` is a
  concrete class from a library, not a Nest provider — so we register it under a token and
  inject it with `@Inject(REDIS)`. Same pattern as any "value/factory provider that isn't a
  class you own."

#### `src/redis/cache.service.ts` — the cache-aside primitives (get / set+TTL / del)

```ts
@Injectable()
export class CacheService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;      // MISS -> null, caller loads from DB
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    // 'EX' sets an expiry -> the cache self-heals; even if we forget to invalidate,
    // stale data lives at most ttlSeconds. TTL is your safety net.
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> { await this.redis.del(key); }
}
```

- A **thin JSON wrapper** over Redis — Redis stores strings, so everything is `JSON.stringify`
  on the way in and `JSON.parse` on the way out. `getJson` returning `null` is the **miss
  signal** the service branches on.
- **`'EX', ttlSeconds` is the interview-worthy line.** The TTL is a *safety net*, not the
  primary correctness mechanism: even if an invalidation is missed (a bug, a crash between DB
  write and `del`), the stale value expires on its own within the TTL. Correctness comes from
  invalidate-on-write; the TTL bounds the blast radius when invalidation fails.
- The doc-comment names the Laravel parallel directly: `Cache::remember($key, $ttl, fn)` +
  `Cache::forget($key)`.

#### `src/redis/redis.module.ts` — the `@Global` module: BullMQ connection + raw client

```ts
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        connection: {
          host: c.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(c.get('REDIS_PORT') ?? 6379),
        },
      }),
    }),
  ],
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        new Redis({
          host: c.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(c.get('REDIS_PORT') ?? 6379),
          maxRetriesPerRequest: null,          // required by BullMQ-style blocking clients
        }),
    },
    CacheService,
  ],
  exports: [REDIS, CacheService, BullModule],
})
export class RedisModule {}
```

- **Two connections, one Redis.** `BullModule.forRootAsync` sets the **default queue
  connection** (every `registerQueue()` elsewhere reuses it); the `REDIS` factory builds a
  **separate** `ioredis` client for the cache. They're kept distinct because BullMQ's worker
  holds a *blocking* connection (`BRPOPLPUSH`/`BLMOVE`) that can't be shared with normal GET/SET
  traffic.
- **`@Global()`** — declare once, inject anywhere without re-importing `RedisModule` in every
  feature module (the same convenience `ConfigModule.forRoot({ isGlobal: true })` gives). The
  `exports: [..., BullModule]` re-exports BullMQ so importing modules can `registerQueue`.
- **`maxRetriesPerRequest: null`** — the gotcha ioredis + BullMQ requires on the client used for
  blocking commands. The default (a finite retry count) makes ioredis throw on a command that's
  legitimately parked waiting for a job; `null` means "wait indefinitely," which is exactly what
  a blocking queue read needs. Newer BullMQ will refuse to start without it.
- `forRootAsync` (not `forRoot`) so the factory can read `REDIS_HOST`/`REDIS_PORT` from
  `ConfigService` — the same async-config reason as the TypeORM connection in Stage 3.

#### `src/documents/ingest.constants.ts` — queue names + cache key

```ts
export const INGEST_QUEUE = 'ingest';
export const INGEST_DLQ = 'ingest-dlq';   // dead-letter: jobs that exhausted retries
export const DOCS_CACHE_KEY = 'documents:all';
```

- Names are centralized so the **producer** (`DocumentsService`), the **consumer**
  (`IngestProcessor`), and the **module wiring** all reference the exact same strings — a typo
  in a queue name silently means "producer and worker never meet."
- `DOCS_CACHE_KEY = 'documents:all'` — note the `:` is fine in a **cache key** (Redis convention
  for namespacing). It is **not** fine in a BullMQ **jobId** (see the producer) — the stage's
  real planted bug.

#### `src/documents/ingest.processor.ts` — the CONSUMER (`WorkerHost.process` + `@OnWorkerEvent`)

```ts
@Processor(INGEST_QUEUE)
export class IngestProcessor extends WorkerHost {
  constructor(
    @InjectRepository(DocumentEntity) private readonly docs: Repository<DocumentEntity>,
    @InjectRepository(ChunkEntity)    private readonly chunks: Repository<ChunkEntity>,
    @InjectQueue(INGEST_DLQ)          private readonly dlq: Queue,
    private readonly cache: CacheService,
  ) { super(); }

  async process(job: Job<IngestJob>): Promise<void> {
    const { documentId } = job.data;
    const doc = await this.docs.findOne({ where: { id: documentId } });
    if (!doc) return;                                  // deleted meanwhile — nothing to do

    if (doc.status === 'ready') {                      // IDEMPOTENCY guard: retry no-ops
      this.logger.log(`skip ${documentId} — already ready`);
      return;
    }
    if (doc.title.includes('FAIL')) throw new Error('simulated ingest failure'); // demo hook

    await this.docs.update({ id: documentId }, { status: 'ingesting' });

    await this.chunks.delete({ documentId });          // delete-then-insert = idempotent
    for (let i = 0; i < 3; i++) {
      await this.chunks.save(
        this.chunks.create({ index: i, content: `chunk ${i} of "${doc.title}"`, documentId }),
      );
    }

    await this.docs.update({ id: documentId }, { status: 'ready' });
    await this.cache.del(DOCS_CACHE_KEY);               // invalidate stale doc list
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<IngestJob>, err: Error): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {                // retries exhausted -> DEAD-LETTER
      await this.dlq.add('dead', { documentId: job.data.documentId, reason: err.message, attempts: job.attemptsMade });
      await this.docs.update({ id: job.data.documentId }, { status: 'failed' });
    }
  }
}
```

- `@Processor(INGEST_QUEUE)` + `extends WorkerHost` is how `@nestjs/bullmq` declares a **worker**.
  You implement one method, `process(job)`; BullMQ calls it **once per job** pulled off the
  queue. The worker gets **full DI** — repositories, the DLQ queue, `CacheService` — like any
  provider.
- **The two idempotency guards are the heart of the file:**
  - **skip-if-ready** — a duplicate or retried job for an already-ingested doc returns
    immediately. The stable jobId (producer side) prevents most duplicates; this guard is the
    belt-and-suspenders that makes a *re-delivery* harmless.
  - **delete-then-insert** — `chunks.delete({ documentId })` before the insert loop. If a
    previous attempt crashed **after** inserting some chunks but **before** marking `ready`, a
    retry would otherwise **double** the chunks. Deleting first makes the effect the same no
    matter how many times the job runs. This is the general rule: a retryable side effect must be
    written so N runs == 1 run.
- The `FAIL`-in-title hook deliberately throws to **exercise the retry + DLQ path** in a demo.
- **`@OnWorkerEvent('failed')`** fires on every failed attempt; the `attemptsMade >= attempts`
  check means we only **dead-letter on the LAST attempt**. The DLQ entry keeps the payload +
  reason + attempt count so a human/operator can inspect and replay it, and the doc is marked
  `failed` so the API surfaces the state. A failed job does **not** silently vanish.

#### `src/documents/documents.service.ts` — the PRODUCER (`queue.add`) + cache-aside `findAll`

```ts
async create(dto: CreateDocumentDto): Promise<DocumentEntity> {
  const doc = await this.documents.save(
    this.documents.create({ title: dto.title, sourceUri: dto.sourceUri, mimeType: dto.mimeType, status: 'pending' }),
  );

  await this.cache.del(DOCS_CACHE_KEY);           // write invalidates the cached list

  await this.ingestQueue.add(
    'ingest',
    { documentId: doc.id },
    {
      jobId: `ingest-${doc.id}`,                  // STABLE id -> BullMQ dedupes (forbids ':')
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: 1000,
      removeOnFail: false,
    },
  );
  return doc;                                      // returns NOW; ingestion runs async
}

async findAll(): Promise<DocumentEntity[]> {
  const cached = await this.cache.getJson<DocumentEntity[]>(DOCS_CACHE_KEY);   // 1. try cache
  if (cached) return cached;                                                   //    HIT
  const docs = await this.documents.find({ order: { createdAt: 'DESC' } });    // 2. MISS -> DB
  await this.cache.setJson(DOCS_CACHE_KEY, docs, 30);                          // 3. populate, 30s TTL
  return docs;
}
```

- **The producer** just saves the row (`pending`) and calls `ingestQueue.add(name, data, opts)`.
  Everything expensive is deferred to the worker, so `create` is fast and the HTTP response is
  immediate. The heavy chunk+embed never blocks the request thread.
- **`jobId: \`ingest-${doc.id}\``** — a **stable, deterministic** job id. BullMQ **dedupes on
  jobId**, so the same document can never be queued twice (idempotency at the *enqueue*
  boundary, complementing the worker's idempotency at the *process* boundary). It's built with a
  `-` and **not** a `:` on purpose — see gotchas; that was the real bug.
- **`attempts: 3` + `backoff: exponential, delay: 500`** — automatic retries for transient
  failures (DB blip, embed API timeout), waiting ~500ms, ~1s, ~2s between tries so we don't
  hammer a struggling dependency.
- **`removeOnComplete: 1000`** keeps the last 1000 completed jobs (bounded history, not infinite
  growth); **`removeOnFail: false`** keeps failed jobs around for inspection/replay.
- **Cache-aside `findAll`** is the textbook three steps: try cache → on miss read DB → populate
  with a TTL. Combined with the `cache.del` on every write (here and in the worker), reads are
  served from Redis and never go stale by more than the TTL.

#### `src/documents/documents.module.ts` — `registerQueue` (producer + DLQ) + the worker

```ts
@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, ChunkEntity]),
    BullModule.registerQueue({ name: INGEST_QUEUE }, { name: INGEST_DLQ }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, IngestProcessor],
})
export class DocumentsModule {}
```

- `BullModule.registerQueue(...)` declares the queues this module owns and makes them injectable
  via `@InjectQueue(name)` — the **`ingest`** queue (producer + worker) and the **`ingest-dlq`**
  dead-letter queue. They reuse the default connection set by `RedisModule`'s `forRootAsync`.
- `IngestProcessor` is listed as a normal **provider** — that's what registers the worker. In
  this demo the worker runs **in the same process** as the API; in prod you'd typically run the
  processor in a **separate worker deployment** so API and workers scale independently.

#### `src/app.module.ts` / `.env` — wiring the global Redis module + connection config

```ts
imports: [ ConfigModule.forRoot({ isGlobal: true }), TypeOrmModule.forRootAsync({ ... }),
           RedisModule, DocumentsModule, AuthModule ],
```
```
# .env — Redis (local server on 6379) — cache-aside + BullMQ queue
REDIS_HOST=localhost
REDIS_PORT=6379
```

- `RedisModule` is imported **once** at the root; because it's `@Global`, `CacheService` and the
  queue connection are available everywhere. Connection host/port come from `.env` via
  `ConfigService`, same config discipline as the DB.

### Key concepts

- **Cache-aside (lazy-loading) pattern:** the application owns the cache. Read = look in cache,
  on **miss** load from the source of truth and **populate**; write = update the DB then
  **invalidate** the key. The cache only ever holds data that was actually requested. TTL is the
  safety net that bounds staleness if an invalidation is missed.
- **Cache invalidation strategies (know the three):**
  - **Write-invalidate (delete on write)** — what we do: simplest and correct-by-default; next
    read repopulates. Momentary miss after a write is the cost.
  - **Write-through** — write cache and DB together on every write; reads are always warm, but
    writes are slower and you cache data that may never be read.
  - **TTL-only expiry** — never explicitly invalidate, just let keys expire. Cheapest, but serves
    stale data for up to the TTL. We use write-invalidate **plus** a TTL as backstop.
- **Producer/consumer queues:** the producer (`queue.add`) and consumer (`WorkerHost.process`)
  are decoupled through Redis. The API produces and returns; workers consume asynchronously.
  This absorbs bursts (the queue buffers), isolates slow work from request latency, and lets you
  scale the two sides independently.
- **Retries + exponential backoff:** transient failures are retried automatically, with the
  delay **growing** each attempt (500ms → 1s → 2s). Backoff prevents a retry storm from
  hammering a dependency that's already struggling; **jitter** (randomizing the delay) further
  prevents synchronized retries across many jobs.
- **Dead-letter queue (DLQ):** when a job **exhausts** its retries it's moved to a separate
  queue instead of vanishing. The DLQ preserves the payload + failure reason so you can alert,
  inspect, fix the root cause, and **replay**. A poison message can't silently disappear or block
  the main queue forever.
- **Idempotency (the stage's spine):** a handler is idempotent when running it N times has the
  same effect as running it once. **Why jobs run more than once:** queues give **at-least-once**
  delivery — a job can be redelivered after a worker crashes *after* doing the work but *before*
  acking, on a retry, or on a duplicate enqueue. You make handlers idempotent with a **stable
  key** (dedupe / skip-if-already-done) and **overwrite-style side effects** (delete-then-insert,
  upsert) rather than blind appends/increments.
- **Why this matters for payments/webhooks:** the exact same problem. A payment provider retries
  a webhook until you 200; without idempotency you'd **charge twice** or credit an account twice.
  The fix is an **idempotency key** (the provider's event id, or one you generate per intent):
  record it, and if you've seen it, return the previous result instead of re-doing the effect.
  DocuMind's `jobId` + skip-if-ready is a toy version of the same pattern.

### Laravel & Prisma parallels

| Nest / Stage 4 concept | Laravel equivalent | Prisma / ORM note |
|---|---|---|
| BullMQ queue (`@nestjs/bullmq`) | Queues (`ShouldQueue` job classes, drivers) | ORM-agnostic — BullMQ/ioredis sit beside Prisma or TypeORM |
| `IngestProcessor.process()` | a Job's `handle()` method | n/a |
| worker (`WorkerHost` / separate process) | queue worker (`php artisan queue:work`) / **Horizon** | n/a |
| `queue.add(name, data, opts)` (producer) | `dispatch(new Job(...))` | n/a |
| `attempts: 3` + `backoff` | `$tries` + `$backoff` / `retryUntil()` | n/a |
| DLQ (`ingest-dlq`) | `failed_jobs` table + `queue:retry` | n/a |
| `jobId` dedupe | `ShouldBeUnique` / `WithoutOverlapping` | n/a |
| cache-aside (`getJson`/`setJson`/`del`) | `Cache::remember()` + `Cache::forget()` | n/a — caching is app-layer |
| `CacheService` over `ioredis` | `Cache` facade (redis driver) / `Redis::` | n/a |
| `@OnWorkerEvent('failed')` | `failed()` hook on the job / queue events | n/a |

**Prisma-vs-TypeORM angle:** unlike Stages 3, there is **no ORM queue equivalent** — neither
Prisma nor TypeORM has a job system. **BullMQ and ioredis are entirely ORM-agnostic**: they talk
to Redis, and the worker just happens to use TypeORM repositories to touch Postgres. Swap TypeORM
for Prisma and the queue/cache code is unchanged; only the `this.docs.update(...)` calls inside
`process()` become `prisma.document.update({ where, data })`. Laravel is the closer parallel here
because its Queues + Horizon + `Cache` facade cover exactly this surface out of the box.

### Interview Q&A

**Q1. Explain cache-aside vs write-through vs write-behind, and which you chose.** **Cache-aside**
(what we use): the app checks the cache, loads from the DB on a miss and populates it, and
invalidates the key on writes — the cache holds only what's been requested, and a write just
deletes the key so the next read repopulates. **Write-through**: every write goes to cache *and*
DB synchronously, so reads are always warm but writes are slower and you cache data nobody may
read. **Write-behind (write-back)**: writes hit the cache and are flushed to the DB
asynchronously — fastest writes, but you risk data loss if the cache dies before the flush and it's
much harder to keep consistent. Cache-aside is the default for a read-heavy list endpoint like
`GET /documents`: simple, correct-by-default, and the DB stays the source of truth.

**Q2. "There are only two hard things in CS…" — how do you handle cache invalidation?** Right,
cache invalidation and naming. My rule: the **write path owns invalidation** — every mutation
that changes the cached set deletes the key (`create` and the worker's `status -> ready` both
call `cache.del`). But invalidation *will* be missed sometimes (a crash between the DB write and
the `del`, a code path you forgot), so I always pair it with a **TTL as a safety net** — stale
data can live at most the TTL (30s here). For finer control you use targeted keys or key
namespacing/versioning so one write doesn't nuke the whole cache. Invalidate-on-write for
correctness, TTL to bound the failure mode.

**Q3. What's a cache stampede / thundering herd and how do you mitigate it?** When a hot key
expires (or is invalidated), many concurrent requests all miss at once and **stampede the DB**
with the same expensive query. Mitigations: (1) a **lock / single-flight** — the first miss takes
a mutex and recomputes while the others wait or serve stale; (2) **jittered TTLs** so keys don't
all expire on the same tick; (3) **stale-while-revalidate** — serve the slightly-stale value and
refresh in the background; (4) proactive/early recomputation before expiry. Our 30s TTL on a
single global key is stampede-prone by design; in prod I'd add single-flight and jitter.

**Q4. Why does idempotency matter and how do you implement it?** Because queues (and webhooks,
and network retries) are **at-least-once** — the same job can run more than once after a crash,
a retry, or a duplicate enqueue. If the handler isn't idempotent you double-charge, double-insert,
or double-send. Implementation: pick a **stable key** for the unit of work (here the doc id, baked
into the `jobId` so BullMQ dedupes), and write side effects so repeats are harmless —
**delete-then-insert** for the chunks, `skip-if-already-ready` as a guard, `upsert` instead of
`insert`, "record the key and short-circuit if seen" for payments. The goal is N runs == 1 run.

**Q5. How do idempotency keys work in a payment or webhook system?** The client (or provider)
attaches a unique **idempotency key** to the operation — for a payment it's a key you generate per
checkout intent; for an inbound webhook it's the provider's event id. On the server you **record
the key with the result** (a unique constraint on the key column enforces it). When a retry
arrives with a key you've already processed, you **return the stored result instead of re-running
the effect**. That turns "charge the card" into an operation you can safely retry over a flaky
network — the provider can hammer your endpoint until it gets a 200 and the customer is charged
exactly once.

**Q6. At-least-once vs exactly-once delivery — which do queues give you and what does that
force?** Practical distributed queues (including BullMQ) give **at-least-once**: a message is
delivered one or more times, never zero. **Exactly-once delivery** is effectively impossible
across a network — you can't atomically do work *and* ack in the presence of crashes. What you
actually get is **exactly-once *processing***, and you get it by making consumers **idempotent**
so redelivery is harmless. So the guarantee I design around is "at-least-once delivery +
idempotent handler = effectively-once effect."

**Q7. Walk through retries, backoff, and jitter — what could go wrong without each?** Retries
absorb **transient** failures (a momentary DB or upstream blip) automatically instead of failing
the job. **Exponential backoff** spaces the retries out (500ms → 1s → 2s) so you don't hammer a
dependency that's already down — fixed fast retries turn one outage into a self-inflicted DDoS.
**Jitter** randomizes the delay so that thousands of jobs that failed at the same instant don't
all retry on the same tick and re-synchronize the storm. And you must **cap** attempts (3 here) or
a genuinely-broken job retries forever — after the cap it goes to the DLQ.

**Q8. What's the DLQ for, and what would you do with what lands there?** The dead-letter queue
catches jobs that **exhausted their retries** so they don't vanish or clog the main queue. We push
the payload + failure reason + attempt count and mark the document `failed`. Operationally: I'd
**alert** on DLQ depth, inspect the entries to find the root cause (a poison message? a persistent
bug? a dead dependency?), fix it, and **replay** the jobs back onto the main queue — or discard
them deliberately. The point is that failures are **visible and recoverable**, not silent.

**Q9. How would you scale the workers separately from the API?** Run the BullMQ processor as its
**own deployment/process**, not in-process with the API (the demo runs it in-process for
simplicity). Then the API and the workers are independent units: the API scales on **request
traffic**, the workers scale on **queue depth** (add worker replicas or bump per-worker
concurrency when the backlog grows). They share only Redis. This also isolates blast radius — a
runaway ingest job can't starve HTTP request handling — and lets you give workers different
resource profiles (more CPU/memory for embedding).

**Q10. How do you get visibility/observability into your queues?** Track **queue depth**
(waiting/active/delayed/failed counts), **throughput**, **job latency** (enqueue-to-complete), and
**DLQ size**, and alert on backlog growth or DLQ spikes. BullMQ exposes these counts, and a
dashboard like **Bull Board / Taskforce / Horizon** (Laravel) gives per-job inspection, retries,
and replay. Because every job carries its payload, I can correlate a failed ingest back to a
document id and its `requestId` from the API log — the Stage 1 correlation-id thread extends into
the async world.

### Production concerns / gotchas

- **BullMQ jobId can't contain `:` (the real bug hit):** BullMQ uses `:` as its internal Redis
  key delimiter, so a custom `jobId` with a colon (e.g. `ingest:<uuid>`) corrupts the key and the
  job never dedupes/runs correctly. The fix was `ingest-${doc.id}` with a **dash**. (Confusingly,
  `:` is the *right* separator for a **cache key** like `documents:all` — the rule only applies to
  jobIds.)
- **In-process worker vs a separate worker process:** we run the processor inside the API process
  for the demo, which means heavy ingestion competes with request handling and they scale
  together. In prod, run workers as an **independent deployment** so they scale on queue depth and
  can't starve the API.
- **Cache stampede:** a single hot key (`documents:all`) with a short TTL means a burst of misses
  can stampede Postgres on expiry. Mitigate with single-flight locks, TTL jitter, or
  stale-while-revalidate before it matters.
- **Poison messages:** a job that always throws (bad payload, permanent downstream failure) will
  retry to exhaustion and, without a DLQ, either vanish or wedge the queue. The DLQ + attempt cap
  contain it; alert on DLQ depth so poison doesn't accumulate unnoticed.
- **`maxRetriesPerRequest: null` on blocking clients:** BullMQ's blocking connection **requires**
  this on the ioredis client; the default finite retry count makes ioredis throw on a command
  that's legitimately parked waiting for work, and modern BullMQ refuses to start without it.
- **Double-processing / non-idempotent side effects:** at-least-once delivery means any handler
  that blindly appends, increments, or re-sends will double its effect on a retry. Every side
  effect must be idempotent — delete-then-insert, upsert, or a dedupe key — which is the whole
  reason the worker deletes chunks before re-inserting and skips already-`ready` docs.
- **Cache/DB write ordering:** invalidate **after** the DB commit, not before — deleting the key
  first opens a window where a concurrent read repopulates the cache with the *old* row. Even so,
  the TTL bounds any inconsistency that slips through.

---

## Stage 6 — LLM / RAG / Agentic Layer

### What we built

DocuMind's **RAG + agent layer** — the differentiator stage, built as sub-stages **6a–6h**:

- **6a — LLM provider abstraction + streaming.** An `LLMProvider` interface (`generate` +
  `stream`), a real `AnthropicProvider` (the `@anthropic-ai/sdk`), a `MockProvider`, and an
  SSE endpoint that streams tokens as they arrive.
- **6b — Embeddings → pgvector + hybrid retrieval.** An `EmbeddingProvider` abstraction with a
  deterministic local embedder; a migration adding `chunks.embedding vector(256)` + an HNSW
  cosine index + a GIN full-text index; a `RetrievalService` with **vector**, **keyword**, and
  **hybrid (RRF)** search.
- **6c — Chunking.** `ChunkingService.fixedSize` (windows + overlap) and `.semantic` (sentence
  boundaries), so retrieval quality can be compared.
- **6d — Reranking.** A `Reranker` interface + `LexicalReranker` — "retrieve wide, rerank narrow."
- **6e — RAG with citations.** `RagService.answer()` = hybrid retrieve → rerank → grounded
  generate → `{ answer, citations[] }` with a hallucination-curbing system prompt.
- **6f — ReAct agent.** A reason→act→observe loop with two tools (`search_documents`,
  `web_search`), a step cap, and three tool-error branches.
- **6g — Multi-provider.** An `OpenAIProvider` behind the same interface; a factory selects by
  `MODE`/`PROVIDER`/keys. Tradeoffs written up in `docs/llm-provider-tradeoffs.md`.
- **6h — Evals.** A golden corpus + 12 Q/A and a scorer (`pnpm eval`): retrieval hit@k,
  key-phrase match, embedding cosine sim; LLM-as-judge noted for live mode.

**The whole stage runs offline.** Mock LLM + local embedder + **real pgvector** means the entire
pipeline (embed → store → cosine/FTS → hybrid → rerank → RAG → agent → eval) is build-verified with
no API key and no spend. Flipping to real APIs is a config flip — `MODE=live` (+ `PROVIDER`/key) for
the LLM, and a one-line swap of the embedder class — because everything upstream depends on the
**interfaces**, not the concrete classes. The SQL and vector mechanics are production-correct; only
the *quality* of the local hash-embedder is a stand-in (see gotchas).

### Files & what each does

#### `src/llm/provider.interface.ts` — the LLM seam + DI token

```ts
export interface GenerateOptions { system?: string; messages: ChatMessage[]; maxTokens?: number; }
export interface LLMProvider {
  readonly name: string;
  generate(opts: GenerateOptions): Promise<string>;      // wait for the whole completion
  stream(opts: GenerateOptions): AsyncIterable<string>;   // yield text chunks as they arrive
}
export const LLM_PROVIDER = 'LLM_PROVIDER';               // DI token, not a class
```

- The **entire abstraction** in ~10 lines. `system` is a **separate field**, not a message — a
  deliberate choice that maps cleanly to Anthropic's top-level `system` and normalizes onto
  OpenAI's `{role:'system'}` message. RAG (6e) and the agent (6f) depend only on this interface.
- `stream()` returns an **`AsyncIterable<string>`** — the transport-neutral contract that the SSE
  controller and future WebSocket paths both consume.
- `LLM_PROVIDER` is a **string DI token** because you can't inject an *interface* in TypeScript
  (interfaces are erased at runtime). The module's factory binds this token to whichever concrete
  provider is active — this is the "swap is invisible downstream" seam.

#### `src/llm/mock.provider.ts` — the offline default (and ReAct-aware)

```ts
if (opts.system?.includes('ReAct agent')) {
  const convo = opts.messages.map((m) => m.content).join('\n');
  if (convo.includes('Observation:')) return `Final Answer: ... (mock): ${obs}`;
  return `Thought: ...\nAction: search_documents\nAction Input: ${q}`;
}
async *stream(opts) { const text = await this.generate(opts);
  for (const word of text.split(' ')) { yield word + ' '; await sleep(15); } }
```

- Deterministic, no key, no network — lets the whole pipeline be built and **build-verified**
  offline. Same interface as the real provider, so nothing downstream changes on the swap.
- **The clever bit:** the mock is *ReAct-aware*. When it sees the agent's system prompt it emits a
  **valid ReAct step** — an `Action` first, then a `Final Answer` once an `Observation:` appears in
  the transcript. This lets the agent **control flow** (parsing, tool dispatch, the loop, error
  branches) be exercised end-to-end without a real model doing the reasoning.
- `stream()` chunks the reply word-by-word with a 15ms delay to *simulate* token streaming so the
  SSE plumbing is real even offline.

#### `src/llm/anthropic.provider.ts` — the real SDK (used at `MODE=live` + key)

```ts
const MODEL = 'claude-opus-4-8';
private readonly client = new Anthropic();          // reads ANTHROPIC_API_KEY from env
const res = await this.client.messages.create({
  model: MODEL, max_tokens: opts.maxTokens ?? 1024,
  system: opts.system,                              // TOP-LEVEL field, not a message
  messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
});
return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
```

- `new Anthropic()` reads `ANTHROPIC_API_KEY` from the environment automatically — no key in code.
- **Two senior points baked in as comments:** (1) on current models the classic sampling knobs —
  `temperature`/`top_p`/`top_k` — are **removed and 400 if sent**, so this provider deliberately
  passes **no temperature**; you steer via prompting / effort, not a temperature dial. (2)
  `max_tokens` is **required** and is a hard ceiling on output — set too low and answers **truncate
  mid-sentence**.
- The response `content` is a **list of blocks**; you filter the `text` blocks and concatenate.
  (This block model is also why the agent tool-call format differs from OpenAI's — see 6g.)
- `stream()` consumes the SDK's event stream and yields `event.delta.text` on
  `content_block_delta` / `text_delta` events — the real token deltas.

#### `src/llm/openai.provider.ts` — the second vendor, same interface (6g)

```ts
private toMessages(opts) {                          // normalize the system-prompt placement
  const msgs = [];
  if (opts.system) msgs.push({ role: 'system', content: opts.system });   // folded INTO messages
  for (const m of opts.messages) msgs.push({ role: m.role, content: m.content });
  return msgs;
}
const res = await fetch('https://api.openai.com/v1/chat/completions', { ... body: JSON.stringify({
  model: this.model, max_tokens, messages: this.toMessages(opts) }) });
return json.choices?.[0]?.message?.content ?? '';
```

- Raw `fetch` against Chat Completions — **no extra SDK** — precisely to prove the point: adding a
  whole second vendor is **one class + one factory branch**, zero upstream changes.
- `toMessages()` is where the adapter earns its keep: OpenAI **folds the system prompt into the
  messages array** (`{role:'system'}`); Anthropic has a **top-level** `system` field. The adapter
  hides that difference so RAG/agent code never branches on vendor.
- The comment flags the deeper gap a full agent abstraction must close: **tool-call format**
  (OpenAI `tools`/`tool_calls` JSON vs Anthropic `tool_use`/`tool_result` blocks) and sampling
  (OpenAI still accepts `temperature`).

#### `src/llm/llm.module.ts` — the provider-selection factory

```ts
{
  provide: LLM_PROVIDER,
  inject: [ConfigService, MockProvider, AnthropicProvider, OpenAIProvider],
  useFactory: (config, mock, anthropic, openai) => {
    const live = config.get('MODE') === 'live';
    const which = (config.get('PROVIDER') ?? 'anthropic').toLowerCase();
    if (live && which === 'openai' && process.env.OPENAI_API_KEY) return openai;
    if (live && process.env.ANTHROPIC_API_KEY) return anthropic;
    return mock;                                    // offline default — safe fallback
  },
}
```

- A **`useFactory` provider bound to the `LLM_PROVIDER` token** — the DI-token pattern from
  Stage 1/2 (`APP_GUARD` etc.) applied to picking an implementation at **boot**. All three concrete
  providers are registered so the factory can pick between the already-constructed singletons.
- The **fallback ordering is a safety feature**: without `MODE=live` **and** a key present, it
  returns the mock — you can never accidentally spend money or hard-fail on a missing key.
- `exports: [LLM_PROVIDER]` so RAG (6e) and the agent (6f) can inject it.

#### `src/llm/llm.controller.ts` — `POST /llm/chat` (unary) + `@Sse('stream')` (streaming)

```ts
@Sse('stream')
stream(@Query('q') q: string): Observable<MessageEvent> {
  return new Observable<MessageEvent>((subscriber) => { (async () => {
    try {
      for await (const chunk of this.llm.stream({ messages: [{ role: 'user', content: question }] }))
        subscriber.next({ data: chunk });           // one SSE `data:` frame per token chunk
      subscriber.next({ data: '[DONE]' });
      subscriber.complete();
    } catch (err) { subscriber.error(err); }
  })(); });
}
```

- `@Sse('stream')` tells Nest to turn a returned **`Observable<MessageEvent>`** into a
  **Server-Sent Events** stream — the same RxJS abstraction the Stage 1 interceptor hinted at, now
  paying off. This is the exact pattern for pushing LLM tokens to a browser `EventSource`.
- The bridge is **async-iterable → Observable**: we `for await` the provider's `stream()` and call
  `subscriber.next({ data: chunk })` per chunk, then emit a sentinel `[DONE]` and `complete()`. An
  error routes to `subscriber.error(err)`.
- `@Inject(LLM_PROVIDER)` in the constructor — the controller holds the *interface*, never a
  concrete class. `@Public()` here is for easy offline testing; in prod you'd require a token.

#### `src/llm/embeddings/embedding.provider.ts` — the embedding seam + local embedder

```ts
export const EMBEDDING_DIM = 256;                    // MUST match the pgvector column: vector(256)
export interface EmbeddingProvider {
  readonly name: string; readonly dim: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
// LocalEmbeddingProvider: hashed bag-of-words → L2-normalized 256-dim vector
for (const tok of tokens) { v[hash(tok) % dim] += 1; v[hash(tok + '#') % dim] += 0.5; }
const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
return v.map((x) => x / norm);                       // unit vector so cosine behaves
```

- Mirrors the LLM abstraction: same interface, swappable implementation. In live mode you swap in a
  real embeddings API (OpenAI `text-embedding-3`, Voyage, Cohere) — **one line** in the module.
- **The local embedder is honest about what it is:** a hashed bag-of-words, so cosine ≈ **token
  overlap**, not deep semantics. It's enough to prove the *plumbing* (embed → pgvector → cosine →
  hybrid → rerank → RAG); real semantic quality needs real embeddings.
- **`EMBEDDING_DIM = 256` must equal the pgvector column** `vector(256)` — a mismatch is a runtime
  insert error (or, worse, silent truncation), and real APIs return 1536/3072-dim vectors, so
  swapping the embedder means **migrating the column dimension too**.
- `toVectorLiteral()` formats a JS `number[]` as pgvector's `'[0.1,0.2,...]'` literal — the glue
  between JS and the raw SQL, since pgvector isn't a native TypeORM type.

#### `src/llm/embeddings/embedding.module.ts` — `@Global` so ingest and retrieval share it

- `@Global()` + `exports: [EMBEDDING_PROVIDER]` so **both** the ingest worker (Stage 4, writes
  vectors) and the retrieval service (reads them) inject the **same** embedder. Query-time and
  index-time embeddings *must* come from the same model or the vectors aren't comparable — making it
  a single global provider enforces that.

#### `src/rag/retrieval.service.ts` — vector / keyword / hybrid over `chunks`

```ts
// VECTOR — cosine distance on pgvector (<=> is the cosine-distance operator)
`SELECT id, document_id, content, 1 - (embedding <=> $1::vector) AS score
   FROM chunks WHERE embedding IS NOT NULL
   ORDER BY embedding <=> $1::vector LIMIT $2`
// KEYWORD — Postgres full-text search
`SELECT id, document_id, content,
        ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS score
   FROM chunks WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
   ORDER BY score DESC LIMIT $2`
```

- **Raw SQL, on purpose:** pgvector's `vector` type isn't a native TypeORM column type, so vectors
  go through `db.query(...)` with parameterized `$1::vector` casts. `1 - (embedding <=> $1)` turns
  cosine **distance** (0 = identical) into a **similarity** score (1 = identical); the `ORDER BY
  embedding <=> $1` is what the **HNSW index** accelerates.
- Keyword search is pure Postgres: `to_tsvector` normalizes content into lexemes, `plainto_tsquery`
  parses the query, `@@` matches, `ts_rank` scores — backed by the **GIN** index. This nails exact
  terms, names, IDs, and rare tokens that embeddings blur.
- **Hybrid = Reciprocal Rank Fusion (RRF):**

```ts
const [vec, kw] = await Promise.all([vectorSearch(query, k*2), keywordSearch(query, k*2)]);
const C = 60;                                        // common RRF constant
const fuse = (list) => list.forEach((c, i) => {
  const add = 1 / (C + i + 1);                       // score by RANK, not raw score
  fused.has(c.chunkId) ? (fused.get(c.chunkId).rrf += add) : fused.set(c.chunkId, {..., rrf: add});
});
```

- RRF fuses the two rankings using **rank position** (`1/(C+rank)`), **not** the raw scores — which
  is the whole point: cosine similarity and `ts_rank` are on incomparable scales, so you can't just
  add them. Ranks are always comparable. `C=60` dampens the top-rank dominance; a chunk appearing in
  **both** lists accumulates from both and floats up. Each retriever over-fetches `k*2` before fusion.

#### `src/rag/reranker.ts` — "retrieve wide, rerank narrow" (6d)

```ts
export interface Reranker {
  rerank(query: string, chunks: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]>;
}
// LexicalReranker: term-overlap, length-normalized so long chunks don't win on size
const overlap = cTerms.reduce((n, t) => n + (qTerms.has(t) ? 1 : 0), 0);
const score = overlap / Math.sqrt(cTerms.length || 1);
```

- **Why rerank at all:** top-k vector search is a **coarse first pass** — ANN is fast but
  *approximate*, and one embedding can't capture exactly how well a chunk answers *this* query. So
  you **over-retrieve** (12) with the cheap retriever, then **re-score** with a more precise (slower)
  signal and keep the best few. This consistently beats top-k vector alone on precision.
- Offline default is a lexical term-overlap reranker, **length-normalized by `sqrt(len)`** so long
  chunks don't win purely on size. Live mode swaps in a **cross-encoder** (Cohere/BGE) or
  **LLM-as-reranker** (ask the model to score each chunk 0–10) — same interface, bound via the
  `RERANKER` token.

#### `src/rag/rag.service.ts` — the grounded pipeline + citations (6e)

```ts
const candidates = await this.retrieval.hybridSearch(query, k * 3);   // retrieve WIDE
const top = await this.reranker.rerank(query, candidates, k);          // rerank NARROW
const context = top.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
const system =
  'Answer ONLY using the provided context. Cite sources with bracketed numbers like [1], [2]. ' +
  "If the answer is not in the context, say you don't know — do not invent facts.";
const answer = await this.llm.generate({ system, messages: [{ role: 'user', content:
  `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer (with [n] citations):` }], maxTokens: 512 });
const citations = top.map((c, i) => ({ marker: i + 1, chunkId: c.chunkId,
  documentId: c.documentId, snippet: c.content.replace(/\s+/g, ' ').slice(0, 140) }));
```

- One method wires the whole flow: **embed (inside retrieval) → retrieve (hybrid, over-fetched
  `k*3`) → rerank (down to `k`) → generate (grounded) → return `{answer, citations}`**.
- **The grounding system prompt is the hallucination control:** "answer ONLY from context, cite
  `[n]`, otherwise say you don't know." The numbered context blocks (`[1] …`, `[2] …`) and the
  **citations array mapping each marker back to its `chunkId`/`documentId`** make the answer
  **auditable** — the UI can show sources, and a claim with no citation is a red flag.
- The result also returns `provider` and `reranker` names so the response is self-describing (useful
  for evals/debugging which components produced it).

#### `src/agent/agent.service.ts` — the ReAct loop + the three error branches (6f)

```ts
for (let step = 1; step <= this.maxSteps; step++) {          // step cap = infinite-loop guard
  const out = await this.llm.generate({ system, messages });
  const finalMatch = out.match(/Final Answer:\s*([\s\S]*)/);
  if (finalMatch) return { answer: finalMatch[1].trim(), steps: step, trace };
  const action = out.match(/Action:\s*([\w-]+)/)?.[1];
  const input  = out.match(/Action Input:\s*(.*)/)?.[1]?.trim() ?? '';

  let observation;
  if (!action)                observation = 'Error: could not parse an Action or Final Answer...';  // (c) malformed
  else if (!(tool = find(action))) observation = `Error: no tool named "${action}"...`;             // (a) unknown tool
  else { try { observation = await tool.run(input); }                                               // (b) tool threw
         catch (err) { observation = `Error running ${action}: ${err.message}`; } }

  messages.push({ role: 'assistant', content: out });
  messages.push({ role: 'user', content: `Observation: ${observation}` });
}
return { answer: '(stopped: max steps reached...)', steps: this.maxSteps, trace };
```

- **ReAct = reason → act → observe.** Each turn the LLM emits either an **Action** (tool call) or a
  **Final Answer**; we run the tool, feed the result back as an **`Observation:`** message, and loop.
  The transcript (`messages`) *is* the agent's memory. Two real tools: `search_documents` (calls RAG
  hybrid retrieval — the "DB query" tool) and `web_search` (offline stub).
- **The robustness is the interview substance** — the loop must survive the model misbehaving, so
  every failure becomes a *recoverable* `Observation`, never a crash: **(a)** unknown tool name →
  list valid tools; **(b)** a tool that **throws** → caught, error fed back; **(c)** malformed output
  with no parseable `Action`/`Final Answer` → tell it to use the format. The model reads the error
  and self-corrects on the next turn.
- **`maxSteps = 5` is the infinite-loop / runaway-cost guard.** If the model never converges, the
  loop exits with an explicit "stopped: max steps" answer instead of looping (and billing) forever.
- Every turn is recorded in `trace[]` (llm output, action, input, observation) → a **full auditable
  trace** returned to the caller, which is essential for debugging agent behavior.

#### `src/documents/chunking.service.ts` — fixed vs semantic (6c)

```ts
fixedSize(text, size = 300, overlap = 50) {          // char windows, step = size - overlap
  const step = Math.max(1, size - overlap);
  for (let i = 0; i < clean.length; i += step) { out.push(clean.slice(i, i + size)); ... }
}
semantic(text, maxSize = 400) {                       // split on sentence/para boundaries, greedily pack
  const sentences = text.split(/(?<=[.!?])\s+|\n{2,}/)...;
  for (const s of sentences) { if ((cur+' '+s).length > maxSize && cur) { out.push(cur); cur = s; } ... }
}
```

- **`fixedSize`** is simple and predictable but **blindly cuts mid-sentence** — a chunk can start/end
  mid-idea, hurting embedding quality. **Overlap** exists so a fact straddling a boundary stays
  retrievable from at least one chunk; tradeoff = duplicated text → more chunks/storage/embeddings.
- **`semantic`** splits on sentence/paragraph breaks and greedily packs to a size budget, so chunks
  stay **coherent whole thoughts** — usually better retrieval. Ingest uses `fixedSize(body, 300, 50)`;
  `semantic` is there for the quality comparison.

#### `src/documents/ingest.processor.ts` — where embeddings get written (6b wiring)

```ts
const pieces = body?.length ? this.chunker.fixedSize(body, 300, 50) : [`${doc.title} — ${doc.sourceUri}`];
await this.chunks.delete({ documentId });             // idempotent: retry doesn't double chunks
for (let i = 0; i < pieces.length; i++) {
  const saved = await this.chunks.save(this.chunks.create({ index: i, content: pieces[i], documentId }));
  const emb = await this.embedder.embed(pieces[i]);
  await this.db.query(`UPDATE chunks SET embedding = $1::vector WHERE id = $2`, [toVectorLiteral(emb), saved.id]);
}
```

- The Stage 4 BullMQ worker now **chunks the doc body and embeds each chunk into pgvector**. The
  vector goes in via a **raw `UPDATE ... $1::vector`** (again: pgvector isn't a native TypeORM
  type), keeping the Stage 4 idempotency discipline (delete-before-insert so a retry can't double
  the chunks — and thus the embeddings).

#### `src/migrations/1783820000000-AddChunkEmbedding.ts` — the pgvector schema

```ts
await qr.query(`CREATE EXTENSION IF NOT EXISTS vector`);
await qr.query(`ALTER TABLE "documents" ADD COLUMN "content" text`);        // body we chunk+embed
await qr.query(`ALTER TABLE "chunks" ADD COLUMN "embedding" vector(256)`);
await qr.query(`CREATE INDEX "..._hnsw" ON "chunks" USING hnsw ("embedding" vector_cosine_ops)`);
await qr.query(`CREATE INDEX "..._fts"  ON "chunks" USING gin (to_tsvector('english', "content"))`);
```

- Hand-written raw SQL (the standard pgvector + TypeORM pattern). The **`vector_cosine_ops`** opclass
  ties the HNSW index to the **cosine** operator (`<=>`) the retrieval query uses — index and query
  must agree on the distance metric or the index won't be used. The **GIN** index backs the keyword
  FTS path. Two indexes, two retrieval modes, one migration.

#### `src/eval/golden.ts` + `src/eval/run-eval.ts` — the regression harness (6h)

```ts
// golden.ts: 5-doc CORPUS + 12 GOLDEN Q/A, each with an expected source doc + a key phrase
{ q: 'How does semantic search rank results?', expectDoc: 'rag', expect: 'cosine' }
// run-eval.ts: seed corpus -> for each Q, hybridSearch(q, 3), then three scorers:
const isHit = results.some((r) => r.documentId === idMap.get(g.expectDoc));           // retrieval hit@3
const phraseFound = results.some((r) => r.content.toLowerCase().includes(g.expect));  // key-phrase (exact-ish)
const sim = cosine(await embedder.embed(g.expect), await embedder.embed(top));        // embedding cosine sim
```

- The eval **re-seeds a fixed corpus, runs hybrid retrieval for each golden question, and scores**:
  **(1) retrieval hit@k** (did the right *document* appear in top-3), **(2) key-phrase presence**
  (an exact-match-ish check the answer text contains the expected phrase), **(3) embedding cosine
  similarity** between the expected phrase and the top chunk. Result at build: **12/12 hit@3, 12/12
  phrase.**
- The point is stated in the file: change chunking, the embedder, retrieval, or a prompt, **re-run,
  and watch the scores** — a drop means you broke retrieval **before** it ships. Live mode adds
  **LLM-as-judge** (grade the generated answer vs the golden 0–5). Extend with **hard negatives +
  CI thresholds** that fail the build on a regression.

### Key concepts

- **Embeddings & cosine distance.** An embedding maps text to a vector where *nearby = similar
  meaning*. Similarity is **cosine** (the angle between vectors) — it measures **direction, not
  magnitude**, so it's insensitive to text length. With L2-normalized (unit) vectors, cosine
  similarity is just the dot product, and pgvector's `<=>` returns cosine *distance* (`1 - sim`).
- **Vector vs keyword vs hybrid.** Vector search finds semantically-related text even with different
  words (synonyms, paraphrase) but **blurs exact terms** — names, IDs, error codes, rare tokens.
  Keyword (FTS) nails those exact tokens but **misses paraphrase**. Each catches what the other
  misses → **hybrid** fuses both. **RRF** fuses by *rank* so the incomparable score scales don't
  matter.
- **ANN indexes: HNSW vs IVFFlat.** Exact nearest-neighbour is O(n) — too slow at scale — so you use
  **approximate** NN. **HNSW** (hierarchical navigable small-world graph): excellent recall + query
  speed, but slower/heavier to **build** and more memory. **IVFFlat** (inverted lists of clusters):
  cheaper to build and smaller, but recall depends on tuning `lists`/`probes` and it needs training
  data. Rule of thumb: HNSW for read-heavy quality, IVFFlat when build cost/memory dominates.
- **Chunking.** **Fixed-size** (char/token windows + overlap) is simple/predictable but cuts
  mid-thought; **semantic** (sentence/paragraph boundaries) keeps ideas whole and usually retrieves
  better. **Overlap** preserves facts that straddle a boundary. Chunk **too big** → diluted
  embeddings + wasted context; **too small** → lost surrounding context. It's the highest-leverage
  RAG-quality knob.
- **Why rerank ("retrieve wide, rerank narrow").** Top-k vector alone isn't enough: ANN is
  approximate and a single embedding is a lossy summary. Over-fetch cheaply, then re-score the
  candidates with a stronger signal (cross-encoder / LLM-as-reranker) and keep the best few — a
  reliable precision win.
- **RAG grounding, citations, hallucination control.** RAG = give the model the *retrieved facts* and
  make it answer **only** from them, **cite** sources, and **say "I don't know"** otherwise.
  Citations map each claim back to a chunk → **auditable**, and dramatically cut hallucination
  because the model isn't answering from parametric memory.
- **ReAct.** Interleave **Reasoning** and **Acting**: the model thinks, calls a **tool**, reads the
  **observation**, and repeats until it can answer. The transcript is its working memory. Needs a
  **step cap** and **per-tool error handling** to be safe.
- **Streaming (SSE).** Stream tokens as they're generated to slash **time-to-first-token** (perceived
  latency) — the user sees output in ~100s of ms instead of waiting for the full completion.
  Server-Sent Events is a one-way `text/event-stream` of `data:` frames over plain HTTP (simpler than
  WebSockets for server→client). Modeling the response as an **Observable/async-iterable** also makes
  **cancellation** natural — unsubscribe/abort stops generation and stops the spend.
- **Provider abstraction & failover.** One interface, many vendors: enables **failover** (primary
  down/rate-limited → secondary), **cost/latency routing** (cheap model for easy tasks), **no
  lock-in**, and **offline testing** (mock). The adapter hides system-prompt placement, tool-call
  format, and sampling differences.
- **Eval methods.** **Retrieval hit@k** (is the right source in the top-k), **semantic similarity**
  (cosine of answer vs reference), **exact/phrase match** (does the answer contain required facts),
  and **LLM-as-judge** (a model grades answer vs reference on a rubric). A golden set + these scorers
  = a **regression gate** you run in CI.

### Laravel & Prisma parallels

This stage is **the least Laravel-mappable** — RAG/agents/embeddings have no Eloquent analogue. The
parallels that *do* hold are the framework mechanics, not the AI:

| Stage 6 concept | Laravel equivalent | Prisma / ORM note |
|---|---|---|
| `LLM_PROVIDER` / `EMBEDDING_PROVIDER` / `RERANKER` DI tokens + `useFactory` | Service Container binding an interface to an implementation (`$this->app->bind(Interface::class, ...)`) | n/a — DI, not ORM |
| Queue-driven ingest embeds chunks (Stage 4 worker) | Laravel **Job** dispatched to a queue worker | n/a |
| `@Sse` streaming Observable | Laravel **streamed response** / SSE via `response()->stream()` | n/a |
| Raw `db.query('... $1::vector ...')` for pgvector | `DB::select(...)` raw SQL (no Eloquent cast for `vector`) | Prisma: `$queryRaw` — pgvector needs `Unsupported("vector")` + raw SQL; not a native Prisma type either |
| `to_tsvector`/`plainto_tsquery` FTS | `whereFullText()` / raw tsvector SQL | Prisma: raw SQL or `fullTextSearch` preview |
| Migration `CREATE EXTENSION vector` + HNSW/GIN indexes | `artisan` migration with `DB::statement(...)` | Prisma migration with raw SQL for the extension/index |

**The honest takeaway:** the *NestJS* concepts (DI tokens, factory providers, Observables/SSE, queue
workers, migrations) map to Laravel/Prisma; the *RAG/agent* concepts don't — and that's the point of
the stage. pgvector in particular is **raw SQL in every ORM** (TypeORM and Prisma alike), so this
isn't a TypeORM-specific limitation.

### Interview Q&A

**Q1. What is RAG and why use it over just prompting the model?** Retrieval-Augmented Generation
retrieves relevant chunks from your own corpus and puts them **in the prompt as grounding**, then
has the model answer **only** from that context with **citations**. Why: it grounds the model in
**current, private, authoritative** data it was never trained on; it **cuts hallucination** because
the model isn't answering from fuzzy parametric memory; it makes answers **auditable** (each claim
cites a source); and it's **cheaper/faster to update** than fine-tuning — you re-index documents
instead of re-training. Fine-tuning changes *style/behavior*; RAG changes *what facts are
available*.

**Q2. Explain embeddings and cosine similarity — why cosine and not Euclidean?** An embedding maps
text to a vector positioned so semantically similar text is nearby. We compare by **cosine** — the
angle between vectors — because meaning is encoded in **direction, not magnitude**; cosine is
insensitive to length, so a short query and a long passage about the same topic still score high.
With unit-normalized vectors cosine is just the dot product (cheap), and pgvector's `<=>` gives
cosine *distance*, which the HNSW index orders by. Euclidean distance conflates magnitude with
direction, which is usually not what you want for text similarity.

**Q3. Why hybrid retrieval instead of pure vector search?** Because vector and keyword search fail on
**opposite** inputs. Embeddings capture paraphrase and synonyms but **blur exact tokens** — product
names, IDs, error codes, rare terms — where a near-match in vector space isn't the *right* match.
Keyword/FTS nails those exact tokens but **misses paraphrase**. Fusing them recovers both. I fuse
with **Reciprocal Rank Fusion**, which combines the two result lists by **rank position**
(`1/(C+rank)`), not raw scores — critical because cosine similarity and `ts_rank` live on
incomparable scales, and a chunk that ranks well in *both* lists rises to the top.

**Q4. Why rerank, and why isn't top-k vector search enough?** Top-k vector is a **coarse** first
pass: ANN is *approximate* (it trades recall for speed), and a single embedding is a **lossy
summary** that can't capture exactly how well a chunk answers *this specific* query. So I
**over-retrieve** cheaply (say top-12), then **re-score** those candidates with a stronger, slower
signal — a **cross-encoder** that reads query+chunk together, or an **LLM-as-reranker** scoring each
0–10 — and keep the best few. "Retrieve wide, rerank narrow" reliably improves precision, which is
what the generator actually needs since it only sees the final few chunks.

**Q5. Walk me through your chunking strategy and the tradeoffs.** Two strategies behind one service.
**Fixed-size** (char/token windows with **overlap**) is simple and predictable but cuts
mid-sentence, which hurts embedding quality. **Semantic** chunking splits on sentence/paragraph
boundaries and packs to a size budget, keeping whole thoughts together — usually better retrieval.
**Overlap** exists so a fact spanning a boundary stays retrievable, at the cost of duplicated text
and more embeddings. The size is the key knob: **too large** dilutes the embedding and wastes
context window; **too small** strips surrounding context. I'd pick semantic for prose, tune size to
the content, and let the eval harness confirm the choice rather than guessing.

**Q6. How do citations and grounding prevent hallucination?** The system prompt forces the model to
answer **only from the provided context**, **cite** each fact with `[n]`, and **say it doesn't
know** if the answer isn't there — so it can't fall back on parametric memory. I number the context
blocks and return a **citations array** mapping each marker to its `chunkId`/`documentId`, so every
claim is traceable to a source and the UI can show it. A sentence with **no citation** is an
immediate red flag for review. It doesn't make hallucination impossible, but it makes it **rare and
detectable**.

**Q7. Explain your ReAct loop, how you handle tool errors, and how you prevent infinite loops.**
ReAct interleaves reasoning and acting: each turn the model emits either an **Action** (tool + input)
or a **Final Answer**; I run the tool, append the result as an **Observation**, and loop — the
message transcript is the agent's memory. Three failure modes are all turned into **recoverable
error Observations** instead of crashes: **(a)** an unknown tool name → I return the valid tool list;
**(b)** a tool that **throws** → I catch it and feed the message back; **(c)** **malformed** output
with no parseable Action/Final → I tell it to use the required format. The model reads the error and
self-corrects. A **`maxSteps` cap** guarantees termination — no convergence within the cap exits with
an explicit "stopped" answer — which is the guard against **infinite loops and runaway tool/token
cost**.

**Q8. How do you stream LLM output, and why does it matter?** The provider exposes an
**`AsyncIterable<string>`** of token chunks; the controller uses `@Sse` to bridge that into an
RxJS **`Observable<MessageEvent>`**, emitting one `data:` frame per chunk and a `[DONE]` sentinel.
Server-Sent Events is the right transport — one-way server→client over plain HTTP, simpler than
WebSockets. Why it matters: **time-to-first-token**. Users see output in hundreds of milliseconds
instead of waiting seconds for the whole completion — the same total time *feels* far faster.
Modeling it as a stream also makes **cancellation** clean: unsubscribe/abort stops generation and
**stops the spend** mid-answer.

**Q9. You support Anthropic and OpenAI behind one interface — what actually differs, and how does the
adapter hide it?** Three real differences. **System-prompt placement:** Anthropic has a **top-level
`system`** field; OpenAI **folds it into `messages`** as `{role:'system'}` — my `toMessages()`
normalizes that. **Tool-call format:** Anthropic uses `tool_use`/`tool_result` **content blocks**;
OpenAI uses `tools` + `tool_calls` **JSON** on the message — the biggest gap, which a full agent
abstraction must normalize. **Sampling:** OpenAI still accepts `temperature`; current Anthropic
models **removed it** (a 400 if sent), so I steer via prompting/effort instead. Upstream RAG/agent
code depends only on `LLMProvider`, so none of this leaks — adding a vendor is one class + one
factory branch.

**Q10. How do you do failover across providers?** Wrap the call: try the primary, and on a retryable
error (rate limit, 5xx, timeout) route to a secondary **through the same interface**. Add a
**timeout** and a **circuit breaker** so a slow provider doesn't stall every request, plus jittered
backoff on retries. Because both providers implement `LLMProvider`, the failover logic sits *above*
them and the rest of the app is oblivious. My factory already picks a provider by config; failover
is the runtime extension of that same seam. (Same-vendor server-side fallbacks exist too, but
cross-vendor failover you wire yourself.)

**Q11. How would you evaluate a RAG system and catch regressions before shipping?** A **golden set**
— fixed corpus + questions each tagged with the expected source and a required key fact — plus
layered scorers: **retrieval hit@k** (right document in top-k — isolates retrieval from generation),
**key-phrase / exact match** (answer contains the required fact), **embedding cosine similarity**
(answer vs reference), and in live mode **LLM-as-judge** (grade 0–5 on a rubric). I run it on every
change to chunking, the embedder, retrieval, or prompts, and wire **CI thresholds that fail the
build** when a score drops. I'd add **hard negatives** (questions whose answer is *not* in the
corpus, to test the "I don't know" path) so the system isn't rewarded for confident wrong answers.

**Q12. What's the embedding-dimension-mismatch trap, and how is it silent data corruption?** The
embedder's output dimension **must** equal the pgvector column (`vector(256)` here). If you swap in a
real model that returns 1536-dim vectors without migrating the column, inserts fail — or worse, a
mismatch can slip through and you end up with vectors that are meaningless relative to the others,
and **queries silently return garbage rankings with no error**. Query-time and index-time embeddings
must also come from the **same model** or they're not comparable. That's why the embedder is a single
`@Global` provider and the dimension is a shared constant — and why changing embedders is a
**migration**, not just a code swap.

**Q13. How do you manage cost, latency, and the context window in a RAG/agent system?** **Context:**
retrieve wide but **rerank down to a few** chunks so the prompt stays small — more context is slower,
pricier, and can *hurt* quality ("lost in the middle"). **Cost/latency:** route easy tasks to a cheap
model and hard ones to a frontier model; cache embeddings (they're deterministic per model) and
consider caching answers for repeated queries; cap `max_tokens`. **Agents** are the cost risk — a
loop can fan out tool calls indefinitely — so the **step cap**, per-tool timeouts, and early-exit on
Final Answer bound the spend. **Streaming** improves *perceived* latency without changing cost.

**Q14. Why did you build the whole stage to run offline, and what's the honest limitation?** So the
entire pipeline — embed, store in **real pgvector**, cosine + FTS, hybrid, rerank, RAG, agent, eval —
is **build-verified with no API key and no spend**, and CI can run it. The mock LLM and local
embedder implement the same interfaces as the real ones, so going live is `MODE=live` + a key for the
LLM and a **one-line** embedder swap. The **honest limitation:** the local embedder is a hashed
bag-of-words, so cosine ≈ **token overlap, not deep semantics** — great for proving the SQL/vector
*mechanics* and control flow, but real semantic quality needs real embeddings. The plumbing is
production-correct; only the embedding *quality* is a stand-in.

### Production concerns / gotchas

- **Offline mock vs real (the honest limitation).** The local hash-embedder is keyword-ish, not
  semantic; the mock LLM is deterministic canned text. The **pipeline, SQL, and vector mechanics are
  production-correct**, and real embeddings/LLM are a config/1-line swap — but don't mistake the
  offline eval scores for production quality. Real embeddings are where semantic recall actually
  comes from.
- **Embedding dimension must match the pgvector column.** `EMBEDDING_DIM` (256) ↔ `vector(256)`. Real
  APIs return 1536/3072-dim vectors, so swapping the embedder is a **schema migration**, not just a
  code change. Query-time and index-time embeddings must come from the **same model** or the vectors
  aren't comparable — a mismatch silently corrupts rankings with no error.
- **HNSW build/recall/memory tradeoffs.** HNSW gives great recall and query speed but is **slower to
  build** and **memory-hungry**; recall/latency are tunable (`m`, `ef_construction`, `ef_search`).
  IVFFlat builds cheaper and smaller but needs `lists`/`probes` tuning and training data. Pick per
  workload; the index opclass (`vector_cosine_ops`) **must match** the query's distance metric.
- **Prompt injection into RAG context.** Retrieved chunks are **untrusted input** — a document can
  contain "ignore previous instructions and…". Treat context as data, not instructions: keep the
  system prompt authoritative, don't let retrieved text grant tools/permissions, and sanitize/scope
  what the model can act on. Especially dangerous when an **agent** can take actions off retrieved
  content.
- **Agent infinite loops / runaway tool calls / cost.** Without a **step cap**, a non-converging
  agent loops (and bills) forever; a buggy tool can be called repeatedly. Cap steps, add per-tool
  **timeouts**, make tool errors recoverable observations (not crashes), and log a **full trace** so
  runaway behavior is visible and debuggable.
- **Provider outages & failover.** A single vendor is a single point of failure. Put failover behind
  the `LLMProvider` interface (primary → secondary on rate-limit/5xx/timeout), with a **circuit
  breaker + timeouts** so a slow provider doesn't stall every request. Never hard-fail on a missing
  key — the factory falls back to mock.
- **BullMQ `jobId` cannot contain a colon (hit during this build).** BullMQ uses `:` as its internal
  Redis key delimiter, so a `jobId` like `ingest:<uuid>` corrupts the key and breaks dedupe/run. Fix
  was `ingest-${id}` with a **dash**. (Confusingly `:` is the *correct* separator for a **cache
  key**; the rule only applies to jobIds.) This is what wires the embeddings into the ingest queue.
- **pgvector is not a native TypeORM type (raw-SQL pattern).** There's no TypeORM column type for
  `vector`, so **every** vector read/write goes through raw `db.query(... $1::vector ...)` and the
  migration is hand-written SQL (`CREATE EXTENSION vector`, HNSW/GIN indexes). This is true of Prisma
  too — it's a pgvector reality, not a TypeORM quirk. Always **parameterize** the `$1::vector` cast;
  never string-concatenate vectors into SQL.
