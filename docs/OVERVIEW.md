# DocuMind — Project Overview (read me first)

This is your interview-prep build: **DocuMind**, a *chat-with-your-docs* RAG knowledge
base, built stage-by-stage in **NestJS + Postgres + Redis** with an **LLM/RAG/agent**
layer. It runs **fully offline** (mock LLM + local embeddings + real Postgres/pgvector
+ real Redis) and flips to real Anthropic/OpenAI with one env change.

Start here, then go deep in `STUDY-NOTES.md`. Interview questions are in
`interview-questions.md` + `auth-interview.md`.

---

## What's in the repo

```
interview-prep/
├─ PLAN.md                 ← the master plan + Master Todo (what/why per stage)
├─ docs/
│  ├─ OVERVIEW.md          ← this file
│  ├─ OVERNIGHT-LOG.md     ← chronological log of the autonomous build
│  ├─ STUDY-NOTES.md       ← DEEP notes: file-by-file, concepts, Q&A (Stages 1–6+)
│  ├─ interview-questions.md, auth-interview.md, session-vs-stateless.md
│  ├─ llm-provider-tradeoffs.md, stage-01.md, stage-05.md
│  └─ stage-01-bug.md, stage-02-bug.md   ← planted-bug answer keys
├─ server/                 ← NestJS API (the bulk of the work)
├─ client/                 ← React + Vite (Stage 5)
└─ nextapp/                ← Next.js App Router (Stage 5)
```

## The architecture (what talks to what)

```
 React/Vite client ─┐   HTTP (JWT)      ┌───────────────────────────┐
                    ├──────────────────►│  NestJS API (server/)     │
 Next.js app ───────┘   WebSocket       │  guards·pipes·interceptors│
        ▲  live doc status              │  ·filters                 │
        └───────────────────────────────┤  Auth · Documents · RAG   │
                                         │  · Agent · LLM            │
                                         └───┬───────────┬───────────┘
                                   enqueue   │           │ read/write
                                   ingest    ▼           ▼
                                     ┌──────────┐   ┌─────────────┐
                                     │  Redis   │   │  Postgres   │
                                     │ cache +  │   │ + pgvector  │
                                     │ BullMQ   │   └─────────────┘
                                     └────┬─────┘
                                          ▼
                                 Ingest worker: chunk → embed → store vector
```

## Stage-by-stage (what got built)

| Stage | What | Key endpoints / files |
|---|---|---|
| **1 Nest fundamentals** | Documents module; guard, pipes (zod-like DTOs), interceptor (response envelope), exception filter; request lifecycle | `server/src/documents/*`, `server/src/common/*` |
| **2 Auth** | JWT access+refresh, Passport global `JwtAuthGuard` + `@Public()`, rotation + reuse-detection, httpOnly-cookie storage | `server/src/auth/*` — `POST /auth/login|refresh|logout`, `GET /auth/me` |
| **3 Postgres/TypeORM** | Entities, migrations, repositories, N+1 demo, indexing/EXPLAIN, pgvector | `server/src/documents/*.entity.ts`, `server/src/migrations/*`, `server/src/data-source.ts` |
| **4 Redis** | Cache-aside + TTL, BullMQ ingest queue, retries + DLQ, idempotency | `server/src/redis/*`, `server/src/documents/ingest.processor.ts` |
| **5 Frontend** | React/Vite client + WebSocket live status; Next.js App Router (server vs client components, streaming) | `client/`, `nextapp/`, `server/src/realtime/*` |
| **6 LLM/RAG/Agent** | Provider abstraction + streaming; embeddings→pgvector; hybrid retrieval; reranking; RAG+citations; ReAct agent; multi-provider; evals | `server/src/llm/*`, `server/src/rag/*`, `server/src/agent/*`, `server/src/eval/*` |
| **7 Containerize** | Dockerfiles + docker-compose + GitHub Actions CI | `server/Dockerfile`, `docker-compose.yml`, `.github/workflows/*` |

## API cheat-sheet (offline, `MODE=offline`)

| Method | Path | What |
|---|---|---|
| POST | `/auth/login` | `{email,password}` → access token (+ refresh cookie). Demo user: `ada@example.com` / `password123` |
| POST | `/auth/refresh` | rotate refresh token (cookie) |
| GET | `/auth/me` | current user (needs Bearer token) |
| POST | `/documents` | create doc `{title,sourceUri,mimeType,content?}` (Bearer). Enqueues ingest. |
| GET | `/documents` , `/documents/:id` | list / get (cached) |
| GET | `/rag/search?q=&mode=vector\|keyword\|hybrid&k=` | raw retrieval (public) |
| POST | `/rag/query` | `{query,k}` → RAG answer **with citations** (public) |
| POST | `/agent` | `{question}` → ReAct agent answer + trace (public) |
| POST | `/llm/chat` , GET `/llm/stream?q=` | chat + SSE token stream (public) |

---

## How to run it

**Prereqs (already installed on this machine):** Postgres 16 + pgvector (Homebrew, DB
`documind`), Redis (local, port 6379), Node 22, pnpm 9. Docker is installed for Stage 7.

```bash
# 0. Postgres needs its bin on PATH (keg-only):
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
# (Postgres + Redis should already be running as services.)

# 1. API server
cd interview-prep/server
pnpm install
pnpm migration:run     # apply DB migrations
pnpm start             # http://localhost:4000  (MODE=offline → mock LLM + local embeddings)

# 2. Eval harness (RAG retrieval scores)
pnpm eval

# 3. Client (Stage 5)
cd ../client && pnpm install && pnpm dev

# 4. Next app (Stage 5)
cd ../nextapp && pnpm install && pnpm dev
```

**Go live with real models** (optional): in `server/.env` set `MODE=live` and add
`ANTHROPIC_API_KEY=sk-ant-...` (get one at console.anthropic.com — separate from your
Claude Max subscription; see the note we discussed). For OpenAI: `PROVIDER=openai` +
`OPENAI_API_KEY=...`. For real embeddings, swap `LocalEmbeddingProvider` for a real
embeddings API in `EmbeddingModule` (1 line).

---

## Honest limitations (so you can speak to them)
- **Local embeddings** are a hashed bag-of-words (keyword-ish, not deep semantics) so
  the whole pipeline runs offline with zero cost. The SQL/vector mechanics, hybrid
  fusion, reranking, RAG, and agent flow are all production-correct; real embeddings
  are a one-line swap. (This is why the eval's embedding-similarity numbers are low but
  retrieval hit@k is 100% — keyword+hybrid carry it.)
- **Mock LLM** echoes context offline; real answers need `MODE=live` + a key.
- The **agent** uses a ReAct-aware mock offline to drive the loop deterministically; a
  real model does the reasoning in live mode.

## How to study (2-hour plan)
1. `STUDY-NOTES.md` — read the stage matching each interview topic; it has file-by-file
   walkthroughs, Laravel/Prisma parallels, and per-stage Q&A.
2. `auth-interview.md` — the senior auth cheat-sheet (memorize the 30-sec opener).
3. `llm-provider-tradeoffs.md` + Stage 6 notes — the differentiator; RAG/agent/eval.
4. `interview-questions.md` — do a final out-loud pass, no notes.
