# Stage 5 — Frontend & Real-time (React SPA + Next.js, one Nest API)

Both frontends consume the **same NestJS API** (`:4000`). We build the feature twice
on purpose — to contrast the two architectures.

## What we built
- **Server (Nest):** a `socket.io` **WebSocket gateway** (`server/src/realtime/`) that
  broadcasts document ingest status. The ingest worker emits an in-process
  `EventEmitter2` event on every status change (`pending→ingesting→ready/failed`);
  the gateway `@OnEvent`s it and pushes to connected browsers — decoupled (the worker
  knows nothing about sockets). CORS enabled in `main.ts`.
- **`client/` (React + Vite SPA):** login → create doc → list docs, with **live status
  updates over WebSocket** (a row flips to `ready` with no refresh).
- **`nextapp/` (Next.js App Router):** a **server component** home page (server-side
  fetch), a **client component** create form calling a **server action**, and a
  **streaming chat** page consuming the API's **SSE**.

## WebSocket vs SSE (when to use each)
| | WebSocket | SSE (Server-Sent Events) |
|---|---|---|
| Direction | **full-duplex** (both ways) | **one-way** server→client |
| Transport | own protocol over TCP | plain HTTP (`text/event-stream`) |
| Reconnect | manual | **automatic** (built into EventSource) |
| Best for | chat, presence, **live job status** (our WS gateway) | **streaming LLM tokens**, notifications, progress (our chat) |
We use **WebSocket for live ingest status** (may want two-way later) and **SSE for LLM
token streaming** (one-way is all it needs — lighter, passes proxies, auto-reconnects).

## Server components vs client components (the "why")
- **Server component** (default in App Router): runs only on the server. Can fetch data
  and hold secrets, ships **zero JS** for itself → smaller bundle, faster first paint.
  Can't use state/effects/handlers.
- **Client component** (`'use client'`): runs in the browser. Needed for interactivity
  (`useState`, `onClick`, `EventSource`). Ships JS.
- Pattern: server components for data/shell, delegate interactive islands to client
  components. Our `page.tsx` (server) renders `<AskForm/>` (client).

## Server actions vs API routes
- **Server action** (`'use server'`): a function a client component calls like an RPC;
  it **executes on the server** — no manual `fetch`, no route handler, secrets stay
  server-side. Great for mutations/form submits. (Our `askRag` action.)
- **API route handler** (`app/api/*/route.ts`): a real HTTP endpoint you `fetch` — use
  when you need a public URL, webhooks, non-Next clients, or streaming responses.
- Rule: internal form/mutation → server action; a URL others call → route handler.

## Server-side vs client-side fetching
- **Server-side** (in a server component / action): closer to the DB/API, no client
  waterfall, secrets safe, better SEO/first paint. Default for initial data.
- **Client-side** (useEffect/SWR/EventSource): for interactive, user-triggered, or
  streaming/real-time data. Our SSE chat + WebSocket status are client-side.

## Next.js vs a plain SPA-on-an-API (the architecture contrast)
- **Vite React SPA + Nest API** (`client/`): the browser downloads a JS bundle, then
  every data need is a client `fetch` to the API. Simple, fully decoupled, but blank
  screen until JS loads + hydrates; SEO needs extra work; secrets can't live in the
  frontend.
- **Next.js App Router** (`nextapp/`): a **server** renders components (server-side
  fetch, streaming, server actions) and sends HTML + minimal JS. Better first paint /
  SEO, secrets stay server-side, and it can still call the same Nest API — but it adds
  a server tier and more concepts (RSC boundaries, caching). Same backend, different
  rendering model. That tradeoff (bundle-and-fetch vs server-render-and-stream) is the
  interview headline.
