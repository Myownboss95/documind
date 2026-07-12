# DocuMind

A **chat-with-your-docs RAG knowledge base** — full-stack **NestJS + PostgreSQL/pgvector +
Redis**, with an **LLM / RAG / agentic** layer. Built as a hands-on study of production
backend + AI-app patterns. Runs **fully offline** (mock LLM + local embeddings + real
Postgres/pgvector/Redis) and flips to real **Anthropic/OpenAI** with one env change.

## What it does
Upload documents → they're **chunked + embedded asynchronously** (BullMQ worker) → then
**search and chat over them with cited answers**, backed by a **ReAct agent** that can
query your docs and the web.

## Stack
- **API:** NestJS (guards · pipes · interceptors · exception filters · DI), JWT auth
  (access+refresh, rotation, reuse-detection), TypeORM + migrations.
- **Data:** PostgreSQL + **pgvector** (HNSW cosine) + full-text search; Redis (cache-aside)
  + **BullMQ** (retries, dead-letter queue, idempotency).
- **AI:** provider abstraction (Anthropic / OpenAI / mock), streaming (SSE), embeddings →
  pgvector, **hybrid retrieval** (vector + keyword, RRF), reranking, **RAG with citations**,
  **ReAct agent** (tools + error handling), eval harness (golden Q/A).
- **Front:** React + Vite SPA (WebSocket live status) **and** Next.js App Router (server
  components, server actions, streaming) — both on the same API.
- **Ops:** Docker multi-stage builds + docker-compose + GitHub Actions CI.

## Architecture
```
 React SPA / Next.js ──HTTP(JWT)+WS──► NestJS API ──► Postgres+pgvector
                                          │           Redis (cache + BullMQ)
                                          └─ Ingest worker: chunk → embed → store vector
 RAG: embed → hybrid retrieve → rerank → generate (grounded, cited)
 Agent: reason → act(tool) → observe → repeat
```

## Run it
```bash
cd server && pnpm install && pnpm migration:run && pnpm start   # API on :4000 (offline)
pnpm eval                                                       # RAG retrieval scores
cd ../client && pnpm install && pnpm dev                        # SPA
cd ../nextapp && pnpm install && pnpm dev                       # Next app
# or: docker compose up --build   (full stack: pg + redis + api + client + nextapp)
```
Go live: set `MODE=live` + `ANTHROPIC_API_KEY` (or `PROVIDER=openai` + `OPENAI_API_KEY`).

## Docs
- **[docs/OVERVIEW.md](docs/OVERVIEW.md)** — start here (map, endpoints, how to run, limitations)
- **[docs/STUDY-NOTES.md](docs/STUDY-NOTES.md)** — deep file-by-file notes + interview Q&A
- `docs/auth-interview.md`, `docs/llm-provider-tradeoffs.md`, `docs/stage-05.md`

> Built stage-by-stage (Nest → Auth → Postgres → Redis → Frontend → RAG/Agent →
> Containerize). See `PLAN.md`.
