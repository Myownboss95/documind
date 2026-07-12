# Interview Prep — Full-Stack (NestJS) + LLM/Agentic/RAG Bootcamp

> **Goal:** Rebuild backend + Next.js fundamentals hands-on using **NestJS**
> (which maps cleanly onto your Laravel mental model), then go deep on the
> differentiator (LLM / agentic / RAG), in ~2 focused days before a full-stack
> interview.
> **Owner:** Daniel · **Interview:** 2026-07-12 · **Plan updated:** 2026-07-10
> **Stack pivot:** Express → **NestJS** (Laravel-like: modules, DI, guards, pipes,
> interceptors, exception filters). The role names general Node.js, so Nest is a
> safe, faster-to-learn choice. Raw-Express "under the hood" notes are woven in
> for interview literacy (Nest uses Express as its default HTTP adapter).

This file is the **single source of truth**. Every session starts by reading the
**Working Protocol** and the **Master Todo**. We never advance a stage until its
**quiz gate** is passed.

---

## 0. How we work (decisions locked)

| Decision | Choice | Consequence |
|---|---|---|
| **Framework** | **NestJS** (was Express) | Opinionated, decorator + DI architecture that mirrors Laravel. Runs on Express under the hood. |
| **Scope / time** | Strict order 1→7, full depth, stop wherever Day 2 ends | May not reach 6g/6h/7. Stage 6 (LLM/RAG) is the differentiator — protect its time. |
| **Build style** | **Walkthrough build** — Claude writes each module live in-session, explaining the *why*; you review + question, then debug a planted bug, then quiz | Hands-on, not blank-page. Agents used only for boilerplate/parallel throughput (esp. Stage 6), never unsupervised on core logic. |
| **Permissions** | **Green light per stage** — you approve installs/file-writes at each stage's start | Every install runs as a **visible foreground command**; nothing lands silently. |
| **Environment** | Node 22 / pnpm 9. **No Docker, no API keys (yet).** | Postgres/pgvector, Redis/BullMQ, LLM calls can't truly run. We use **offline fallbacks** (below) and flip to real infra with one env change. |
| **Express literacy** | Nest-primary + "in raw Express this would be…" call-outs each stage | You can still answer a bare-Express interview question. |

---

## 1. Why NestJS clicks for a Laravel dev (the Rosetta Stone)

| Laravel | NestJS | Where in this plan |
|---|---|---|
| Service Providers / bootstrapping | **Modules** (`@Module`) | Stage 1 |
| Service Container / DI | **Providers + constructor injection** (`@Injectable`) | Stage 1 |
| Controllers | **Controllers** (`@Controller`, `@Get/@Post`) | Stage 1 |
| Route/global middleware | **Middleware** (`NestMiddleware`) | Stage 1 |
| Gates / Policies / `auth` middleware | **Guards** (`CanActivate`, `@UseGuards`) | Stage 1, 2 |
| Form Requests (validation) | **Pipes + DTOs + class-validator** (`ValidationPipe`) | Stage 1 |
| Middleware wrapping / response shaping | **Interceptors** (`NestInterceptor`) | Stage 1 |
| `App\Exceptions\Handler` | **Exception Filters** (`@Catch`, `ExceptionFilter`) | Stage 1 |
| Eloquent models / migrations | **TypeORM entities + migrations** (`@nestjs/typeorm`) | Stage 3 |
| Queues (`ShouldQueue`, jobs) | **BullMQ processors** (`@nestjs/bullmq`) | Stage 4 |
| Broadcasting / websockets | **Gateways** (`@nestjs/websockets`) | Stage 5 |
| Cache (`Cache::remember`) | **CacheModule** (`@nestjs/cache-manager`) | Stage 4 |
| Artisan | **Nest CLI** (`nest g module/controller/service`) | throughout |

**The Nest request lifecycle** (memorize this — it's the Express pipeline, but ordered and named):

```
Request
  → Middleware            (global → module)         [Laravel: middleware]
  → Guards                (global → controller → route)  [Laravel: gates/policies]
  → Interceptors (pre)    (before handler)          [Laravel: before-middleware]
  → Pipes                 (validate/transform args) [Laravel: Form Request]
  → Controller handler    → Service (business logic)
  → Interceptors (post)   (map/shape response)      [Laravel: after-middleware]
  → Exception Filters     (if anything threw)       [Laravel: Handler::render]
Response
```

---

## 1.5 The product: **DocuMind** (chat-with-your-docs RAG knowledge base)

One coherent product threads through all 7 stages, so nothing is a throwaway demo and
each stage adds a real slice. **DocuMind** lets a user create a workspace, upload
documents, have them ingested (chunked + embedded) asynchronously, then **search and chat
over them with cited answers**, backed by an agent that can query the user's own docs and
the web.

### Domain model (entities we grow across stages)

| Entity | Purpose | Introduced |
|---|---|---|
| `User` | account / auth principal | Stage 2 |
| `Workspace` | a user's container of documents (multi-tenant boundary) | Stage 1–2 |
| `Document` | uploaded source (title, mime, status: `pending→ingesting→ready→failed`) | Stage 1 |
| `Chunk` | a slice of a document's text | Stage 3/6 |
| `Embedding` | vector for a chunk (`pgvector`) | Stage 3/6 |
| `IngestJob` | async chunk+embed job (BullMQ), idempotent | Stage 4 |
| `ChatSession` / `Message` | a conversation over the docs | Stage 5/6 |
| `Citation` | links an answer span → source chunk | Stage 6 |

### Scalable architecture (design goal, not an afterthought)

```
        ┌─────────────┐        ┌──────────────────────────┐
client / │  Vite React │ HTTPS  │   NestJS API (stateless) │  ← run N replicas behind LB
nextapp  │  Next.js    ├───────►│  controllers/guards/...  │
         └─────┬───────┘  WS    └───┬───────────┬──────────┘
               │  (live job status) │           │ enqueue ingest
               │                    ▼           ▼
        ┌──────┴───────┐    ┌────────────┐  ┌─────────────┐
        │ WS Gateway   │◄───┤  Postgres  │  │   Redis     │
        │ +Redis adapt │    │ +pgvector  │  │ cache+BullMQ│
        └──────────────┘    └────────────┘  └──────┬──────┘
                                                   ▼
                                          ┌──────────────────┐
                                          │ Ingest Worker(s) │ chunk→embed→store
                                          └──────────────────┘
```

**Why this scales horizontally:**
- **Stateless API** (JWT, no server session) → add replicas freely behind a load balancer.
- **All state externalized** → Postgres (+pgvector), Redis (cache + queue). No per-process memory that can't be lost.
- **Heavy work is async** → uploading a doc returns instantly (`202`); chunk+embed runs in a **BullMQ worker** you scale independently of the API.
- **Idempotent, retryable jobs** → safe under retries, restarts, at-least-once delivery.
- **WS Gateway + Redis adapter** → real-time job status fans out across all API replicas, not one.
- **Cache-aside** on hot reads (retrieval results, doc lists) → protects Postgres under load.

### Stage → DocuMind slice

| Stage | Slice delivered |
|---|---|
| 1 Nest fundamentals | `Document` module: create/list/get metadata (upload stub), validated DTOs, filters |
| 2 Auth | `User` + `Workspace`; JWT guard; docs scoped to the owning workspace |
| 3 Postgres | persist documents/chunks; indexes; N+1 on doc→chunks; pgvector column |
| 4 Redis | async **ingest** (chunk+embed) job; retries/DLQ; idempotency; cache doc lists |
| 5 React/Next | upload UI + **live ingest status over WebSocket**; Next.js chat UI w/ streaming |
| 6 LLM/RAG/agent | embed→retrieve→rerank→generate **with citations**; agent tools = *search-my-docs* + *web-search*; evals over a golden Q/A set |
| 7 Containerize | compose the API + worker + Postgres + Redis + web; CI |

---

## 2. Environment reality & offline fallbacks

Every infra-touching stage runs in **two modes** via env (`MODE=offline|live`). Fallbacks
are real implementations of the same interface, not throwaway fakes.

| Concern | Real (when you have it) | Offline fallback (today) |
|---|---|---|
| Postgres + pgvector | **DONE: real local Postgres 16.14 + pgvector 0.8.5** (Homebrew; pgvector compiled from source for @16). DB `documind` on localhost:5432, user `daniel`. No fallback needed. | (PGlite was the fallback; not needed — we have real Postgres) |
| Redis cache | Docker Redis 7 + CacheModule | in-memory cache store (same `get/set/ttl`) |
| BullMQ queue | Redis-backed `@nestjs/bullmq` | in-memory queue shim (same producer/consumer/retry surface) |
| LLM calls | Anthropic / OpenAI SDK | **mock provider** (deterministic completions + shaped streaming) |
| Embeddings | provider embeddings API | local deterministic / `transformers.js` MiniLM vectors |

> **Action for you:** install Docker + drop `ANTHROPIC_API_KEY` before Stage 6 to run for
> real; otherwise we run offline and you lose nothing conceptually.

---

## 3. Multi-agent orchestration strategy

Specialized subagents provide throughput while you + I do the teaching. Contract:

| Agent | Type | Responsibility |
|---|---|---|
| **Scaffolder** | general-purpose | `nest new`, module generation, tsconfig/eslint, `.env.example`, offline-fallback wiring. Runs once + at top of each app. |
| **Stage-Builder** | general-purpose (1/stage) | Builds the stage's Nest module(s) to a working, typechecking state; writes `docs/stage-XX.md`. |
| **Bug-Planter** | general-purpose | After green, plants ONE realistic bug; records tell + fix in `docs/stage-XX-bug.md` (answer key, hidden until you attempt it). |
| **Verifier** | general-purpose | Runs `nest build`/typecheck/`e2e` smoke in offline mode; nothing broken is ever taught. |
| **Quizmaster** | the live session (me) | Runs the 3 questions + oral quiz gate; adapts to your answers. |
| **Reviewer (optional)** | code-review skill | Adversarial review of a stage diff for real prod bugs (races, silent corruption). |

**Pattern per stage:** `Stage-Builder → Verifier → Bug-Planter` → live teach → you debug the
planted bug → reveal fix → 3 questions → **oral quiz gate** → next stage. Independent modules
(esp. Stage 6 chunking/embeddings/eval) are built by parallel Stage-Builders. Never present
unverified code.

---

## 4. Working Protocol (read every session)

1. **Start:** read Master Todo; identify current stage + sub-step.
2. **Build:** Stage-Builder produces code + `docs/stage-XX.md`.
3. **Verify:** Verifier confirms it runs offline. Red → fix before teaching.
4. **Teach:** I walk the code emphasizing *why*, with Laravel parallels + raw-Express notes.
5. **File map:** I list every file added/changed this lesson and explain each, beginner-friendly. *(always)*
6. **Debug drill:** you find + fix the planted bug **before** I reveal `stage-XX-bug.md`.
7. **Questions:** 3 interview-style questions — answered **out loud, no notes** — with the answer key given right after. *(always)*
8. **Quiz gate:** short oral quiz. Pass → next. Fail → re-teach + re-quiz.
9. **Log:** tick Master Todo; note struggles in `docs/weak-spots.md`.

**Cadence rule:** never advance with an open quiz gate. Depth > coverage.

---

## 5. Master Todo (living checklist)

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

### Stage 0 — Foundation (Nest)
- [x] `nest new` server (strict TS) — builds + runs, `GET /` → 200
- [ ] `MODE=offline|live` switch + `.env.example` (`@nestjs/config`) — added when first needed (Stage 1/3)
- [~] Folder convention: `src/common/{middleware,guards,interceptors,pipes,filters,dto}` + feature modules — created as we build Stage 1
- [x] `docs/` skeleton, `weak-spots.md`, `interview-questions.md` (kept from before)

### Stage 1 — NestJS fundamentals  ← *restart here*   ·  vehicle: **`Documents` feature module**
- [x] **Module + Controller + Service + DI** — `Documents` module (create/list/get doc metadata), constructor injection, decorator routing. Builds + runs.
- [ ] Providers & the DI container (why constructor injection, scopes, tokens)
- [x] **Middleware** (`NestMiddleware`) — request-id + logging via `configure()`; order = run order; header reuse for tracing. Verified live.
- [x] **Guards** (`CanActivate`) — ApiKeyGuard (constant-time compare) on `/documents`; runs after middleware, before handler. Verified live.
- [x] **Pipes + DTOs + `ValidationPipe`** — class-validator on CreateDocumentDto; global pipe (whitelist/forbidNonWhitelisted/transform); ParseUUIDPipe on param. Blocks mass-assignment. Verified live.
- [x] **Interceptors** — global TransformInterceptor: `{ data, meta:{requestId,durationMs,timestamp} }` envelope + timing (RxJS map). Verified live.
- [x] **Exception Filters** (`@Catch`) — global AllExceptionsFilter: consistent `{ error }` shape + requestId, generic 5xx, no leaks. Verified live.
- [x] Nest request lifecycle write-up (`docs/stage-01.md`), incl. raw-Express mapping
- [x] Deliberate bug (auth-bypass via method-scoped guard) planted, hunted, fixed → `docs/stage-01-bug.md`
- [~] 3 questions + **quiz gate** (in progress — closing Stage 1)

### Stage 2 — Auth
- [x] `@nestjs/jwt` + bcrypt login issuing access+refresh pair; generic-error (no enumeration)
- [x] Passport `JwtStrategy` + **global JwtAuthGuard** + `@Public()` opt-out; secure-by-default
- [x] `@CurrentUser()` param decorator (minimal principal on req.user; no token/secret)
- [x] **Refresh** flow endpoint; **rotation** (jti, single-use) + **reuse detection** (revoke-all) + logout; stored refresh HASH. Verified live.
- [x] Token storage: **implemented** httpOnly+Secure+SameSite refresh cookie (`@Res({passthrough})`, cookie-parser) + tradeoff write-up (XSS vs CSRF). `docs/auth-interview.md`. Verified live.
- [x] Session vs stateless auth tradeoffs write-up (`docs/session-vs-stateless.md`)
- [x] Deliberate bug (token confusion: shared secret) planted + fixed (distinct secrets + `type` claim) → `docs/stage-02-bug.md`
- [x] 3 questions + **quiz gate** passed. Bonus: `docs/auth-interview.md` senior cheat sheet

### Stage 3 — Postgres
- [x] **Postgres 16 + pgvector installed & running** (local brew, DB `documind`); hand-written cosine query verified
- [x] `@nestjs/typeorm` connected to `documind`; Document + User entities → tables auto-created (synchronize, dev-only). ConfigModule for env. Prisma shown side-by-side.
- [x] **Migrations** set up (DataSource, CLI via ts-node, `synchronize:false`); generated + ran `InitSchema` → tables + `migrations` tracking table. Artisan-equivalent scripts.
- [x] Swap in-memory services → TypeORM **repositories** — real CRUD persisting to Postgres (verified via psql); controller unchanged (seam payoff); demo user seeded
- [ ] Basic CRUD via repositories; migrations
- [x] Indexing basics — `EXPLAIN ANALYZE` on 50k rows: Index Scan (0.44ms) vs Seq Scan reading all rows (2.1ms)
- [x] **N+1** demo — Chunk entity + relation; showed 1+N vs 1 query in real SQL logs; fix (join/relations) + senior nuance (row explosion → IN-query/DataLoader strategy)
- [x] `pgvector` hand-written cosine query verified (identical=0, parallel=0, orthogonal=1). Embedding COLUMN on chunks → deferred to Stage 6 (embeddings).
- [~] Deliberate bug + Q&A → captured in `docs/STUDY-NOTES.md` (doc agent) rather than inline drills (time)

### Stage 4 — Redis  ✅ (local Redis; Docker deferred to Stage 7)
- [x] Cache-aside (ioredis CacheService) + 30s TTL; invalidation on write (del key). Verified (7ms→2ms).
- [x] BullMQ producer (enqueue on create) + consumer (IngestProcessor) — pending→ready + chunks. Verified.
- [x] Retries (attempts:3, exponential backoff) + **dead-letter queue** (ingest-dlq) + status 'failed'. Verified.
- [x] **Idempotency**: stable jobId dedupe + processor guard (skip ready, delete-then-insert chunks). Payments/webhooks tie-in.
- [x] Bug hit live: BullMQ jobId can't contain ':' → fixed. Q&A → STUDY-NOTES.md (doc agent).

### Stage 5 — React + Next.js  ✅
- [ ] Vite React client ↔ Nest API (typed fetch, error/loading states)
- [ ] **WebSocket** live job-queue status via Nest **Gateway** (`@nestjs/websockets`)
- [ ] Rebuild feature in Next.js App Router
- [ ] Server vs client components (the "why"); server actions vs API routes
- [ ] Server-side vs client-side fetching guide; **streaming responses** (LLM relevance)
- [ ] Next.js vs SPA-on-Nest architecture write-up
- [ ] Deliberate bug + 3 questions + **quiz gate**

### Stage 6 — LLM / agentic / RAG  *(differentiator — go deep; build as Nest modules/providers)*
- [x] **6a** Provider abstraction (LLM_PROVIDER) + real Anthropic SDK (gated, opus-4-8) + MockProvider (offline) + SSE streaming. Verified offline. (Front-loads 6g.)
- [x] **6b** Embeddings + retrieval: local embedder → pgvector (`<=>` cosine, HNSW) + Postgres FTS (GIN) → **hybrid (RRF)**. `GET /rag/search`. Verified.
- [x] **6c** Chunking: `ChunkingService` fixed-size (overlap) + semantic; fixed used in ingest.
- [x] **6d** Reranking: `LexicalReranker` (offline) behind interface; retrieve-wide-rerank-narrow. Verified.
- [x] **6e** RAG pipeline: hybrid→rerank→generate with **citations**. `POST /rag/query`. Grounding prompt. Verified.
- [x] **6f** ReAct agent: reason→act→observe loop, 2 tools (search_documents + web_search), step cap + error handling. `POST /agent`. Verified.
- [x] **6g** Multi-provider: `OpenAIProvider` behind same interface; factory by MODE/PROVIDER/keys; tradeoffs doc. Verified.
- [x] **6h** Eval: golden corpus + 12 Q/A + `pnpm eval` scorer (hit@k / phrase / embed-sim; LLM-judge for live). **12/12 hit@3.**
- [~] Deliberate bugs/quiz per sub-step → captured in STUDY-NOTES.md (doc agent) rather than inline (autonomous run).

### Stage 7 — Containerize + CI  ✅
- [ ] Dockerfiles: Nest server, client, nextapp (multi-stage, non-root)
- [ ] docker-compose local dev (Postgres + Redis + all services)
- [ ] GitHub Actions CI: lint / test / build on push
- [ ] Deliberate bug + 3 questions + **quiz gate**

---

## 6. Production-concern threads (woven through every stage)

- **Idempotency** — Stage 4 (retried jobs), 6f (retried tool calls), webhooks/payments.
- **Silent data corruption** — Stage 3 (bad index, unparameterized), 6b (embedding dim mismatch).
- **Race conditions** — Stage 4 (cache stampede, double-processing), Stage 5 (WS reconnect state).
- **Provider outages** — Stage 6g (failover), timeouts, retries, circuit breaking.
- **Secrets hygiene** — Stage 2 (never attach token/secret to the request principal), Stage 7 (env, not baked into images).

Each stage doc ends with a "**How this bites you in prod**" section.

---

## 7. Definition of done (per stage)

1. Working, typechecking Nest code, runnable offline.
2. `docs/stage-XX.md` — walkthrough + "why" + Laravel/Express mapping + "how this bites you in prod".
3. `docs/stage-XX-bug.md` — planted bug, the tell, the fix (revealed post-attempt).
4. File map given in-session; 3 questions answered out loud + answer key; **quiz gate passed**.
5. Master Todo ticked; weak spots logged.

---

## 8. Repo layout (Nest)

```
interview-prep/
├─ PLAN.md
├─ package.json                 ← pnpm workspace root
├─ docs/                        ← stage walkthroughs, bug answer-keys, weak-spots, question bank
├─ server/                      ← NestJS app
│  └─ src/
│     ├─ main.ts                ← bootstrap (Laravel: public/index.php + kernel)
│     ├─ app.module.ts          ← root module
│     ├─ common/                ← cross-cutting
│     │  ├─ middleware/  guards/  interceptors/  pipes/  filters/  dto/
│     ├─ users/                 ← feature module (controller, service, dto, entity)
│     ├─ auth/                  ← Stage 2
│     ├─ db/                    ← Stage 3 (TypeORM config, entities, migrations)
│     ├─ cache/  queues/        ← Stage 4
│     └─ llm/                   ← Stage 6 (rag, agent, providers, eval)
├─ client/                      ← React + TS + Vite   (Stage 5)
└─ nextapp/                     ← Next.js + TS App Router (Stage 5)
```

*(Note: Nest organizes by **feature module**, not by the flat `routing/middleware/...`
folders the original Express plan used. Cross-cutting concerns live in `common/`.)*

---

## 9. Day plan

| Block | Target |
|---|---|
| Day 1 AM | Stage 0 + Stage 1 (Nest fundamentals) + Stage 2 (Auth) |
| Day 1 PM | Stage 3 (Postgres/pgvector) + Stage 4 (Redis/BullMQ) |
| Day 2 AM | Stage 5 (React/Next) + **Stage 6a–6c** |
| Day 2 PM | **Stage 6d–6f** (protect this), 6g/6h/7 if time |
| Buffer | Final quiz sweep from `docs/interview-questions.md` |

> Behind by Day 2 AM? Cut Stage 5's Next depth and Stage 7 **before** cutting Stage 6d–6f.

---

*Next action: wipe the old Express `/server`, scaffold Stage 0 in NestJS, then Stage 1.*
