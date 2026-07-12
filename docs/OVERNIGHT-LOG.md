# Overnight Build Log

Running autonomously while you sleep (started ~2026-07-12 early AM). Each entry = a
completed, build-verified slice. Read top-to-bottom for what happened; deep dives are
in `STUDY-NOTES.md`.

## Status at handoff (before you slept)
- ✅ Stage 1 — NestJS fundamentals (Documents module, guards, pipes, interceptors, filters)
- ✅ Stage 2 — Auth (JWT access+refresh, Passport, rotation+reuse detection, cookie storage)
- ✅ Stage 3 — Postgres/TypeORM (entities, migrations, repositories, N+1, indexing, pgvector)
- ✅ Stage 4 — Redis (cache-aside, BullMQ ingest queue, retries, DLQ, idempotency)
- ✅ Stage 6a — LLM provider abstraction + Anthropic SDK (gated) + mock + SSE streaming
- 📄 `STUDY-NOTES.md` covers Stages 1–4 in depth.

## Plan for the run (differentiator-first)
1. Stage 6b — embeddings + pgvector retrieval + FTS + hybrid
2. Stage 6c — chunking (fixed vs semantic) + retrieval-quality comparison
3. Stage 6d — reranking
4. Stage 6e — RAG pipeline endpoint with citations
5. Stage 6f — ReAct agent loop (search-docs + web-search tools, error handling)
6. Stage 6g — multi-provider (OpenAI alongside Anthropic) + tradeoffs
7. Stage 6h — eval scaffolding (golden Q/A + scorer)
8. Stage 5 — React/Vite client + WebSocket live status + Next.js App Router
9. Stage 7 — Dockerfiles + docker-compose + GitHub Actions CI
10. Docs: append Stage 5/6/7 to STUDY-NOTES.md + a plain-English OVERVIEW.md

---

## Log

### 6b — Embeddings + retrieval ✅
- `EmbeddingProvider` abstraction + deterministic `LocalEmbeddingProvider` (256-dim, offline). Real embeddings = 1-line swap.
- Migration: `documents.content` (body text) + `chunks.embedding vector(256)` + HNSW cosine index + GIN FTS index.
- Ingest worker now chunks the doc body (`ChunkingService.fixedSize`, 6c) and embeds each chunk into pgvector.
- `RetrievalService`: `vectorSearch` (cosine `<=>`), `keywordSearch` (tsvector/tsquery + ts_rank), `hybridSearch` (Reciprocal Rank Fusion).
- `GET /rag/search?q=&mode=vector|keyword|hybrid&k=` — verified: 3 docs embedded, all three modes return ranked results; keyword nails exact terms, hybrid fuses.
- **Honest limitation:** local hash embeddings ≈ token overlap, not deep semantics. Pipeline/SQL are production-correct.

### 6c — Chunking (fixed vs semantic) ✅
- `ChunkingService.fixedSize(size, overlap)` and `.semantic(maxSize)`. Fixed used in ingest.

### 6d — Reranking ✅
- `Reranker` interface + `LexicalReranker` (offline). "Retrieve wide, rerank narrow." Live: cross-encoder / LLM-as-reranker. Verified: correctly floated the right chunk to [1].

### 6e — RAG pipeline + citations ✅
- `RagService.answer()`: hybrid retrieve (over-fetch) → rerank → grounded generate → `{ answer, citations[] }`. `POST /rag/query`. Grounding system prompt curbs hallucination. Verified.

### 6f — ReAct agent ✅
- `AgentService`: reason→act→observe loop, 2 tools (`search_documents` = RAG, `web_search` = stub), step cap, and error handling for unknown-tool / tool-throws / malformed-output. `POST /agent`. Verified: search→observe→final in 2 steps with full trace. Mock is ReAct-aware offline.

### 6g — Multi-provider ✅
- `OpenAIProvider` (fetch-based) behind the same `LLMProvider` interface; factory selects by `MODE`/`PROVIDER`/keys. Tradeoffs doc: `docs/llm-provider-tradeoffs.md` (system-prompt placement, tool-call format, sampling, failover). Build verified.

### 6h — Eval scaffolding ✅
- `src/eval/golden.ts` (5-doc corpus + 12 Q/A) + `src/eval/run-eval.ts` (`pnpm eval`). Scorers: retrieval hit@k, key-phrase match, embedding cosine sim; LLM-as-judge noted for live. **Result: 12/12 hit@3, 12/12 phrase.** Extend w/ hard negatives + CI thresholds.

### Docs ✅ (partial)
- Stage 6 appended to `STUDY-NOTES.md` (now covers Stages 1–4 + 6). `OVERVIEW.md` + this log written.
- TODO after Stage 5 lands: append Stage 5 to STUDY-NOTES; fix its intro header ("Stages 4–7 later").

### In progress
- Stage 5 build (agent): WebSocket gateway + EventEmitter + CORS already wired into server; client/ + nextapp/ scaffolding.

### Next (after Stage 5)
- Verify Stage 5 builds (server/client/nextapp).
- Stage 7 (Dockerfiles + docker-compose + GitHub Actions CI) — build + verify.
- Final review pass + update OVERVIEW.

