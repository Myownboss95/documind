# Next.js App Router — Beginner Walkthrough

A roadmap for understanding the `nextapp/` folder from zero. We'll go **file by file**,
in a deliberate order, and every lesson ends with a short quiz (answers included).

The whole time, we compare against something you already built: the **Vite React SPA in
`client/`**. Same NestJS API behind both. The interesting question this app answers is:
*"why would I use Next.js instead of a plain React SPA?"*

> No Laravel here — that comparison belongs to the NestJS backend. This is 100% frontend.

---

## The one mental model to hold

A plain React SPA (your `client/`) ships an **empty HTML page + a big JS bundle**. The
browser downloads the JS, runs it, and *then* React draws the page and fetches data.
Everything happens **in the browser**.

Next.js adds a second place your code can run: **the server**. Some components render on
the server (no JS shipped for them, can fetch data directly, secrets stay hidden), and
only the *interactive* bits get shipped to the browser. Same React syntax — but now you
choose **where each piece runs**.

```
React SPA (client/)          Next.js App Router (nextapp/)
─────────────────            ─────────────────────────────
browser only                 server  ──renders HTML──▶ browser
  └ fetch → API                └ fetch → API             └ hydrates only
                                                            the interactive bits
```

That single idea — *server component vs. client component* — is what this whole app
demonstrates.

---

## What we'll cover (the lessons)

Each lesson = a file (or small group), explained beginner-first, then a quiz gate.
We do NOT advance past a quiz you can't answer.

| # | Lesson | Files | The idea it teaches |
|---|--------|-------|---------------------|
| 0 | What is Next.js & how to run it | `package.json`, `next.config.mjs`, `tsconfig.json` | The `next dev` / `build` / `start` scripts; how the App Router "just knows" your routes from folders |
| 1 | Routing by folders | `app/layout.tsx`, `app/page.tsx`, `app/chat/page.tsx` | `app/page.tsx` = `/`, `app/chat/page.tsx` = `/chat`. No router config file. |
| 2 | The layout (shared shell) | `app/layout.tsx`, `app/globals.css` | One wrapper (nav + `<html>`) around every page. Like a master template. |
| 3 | Server Components (the default) | `app/page.tsx` | Runs on the server, `async` + `await fetch`, ships **zero JS** for itself. |
| 4 | Client Components (`'use client'`) | `app/components/AskForm.tsx` | Opt back into `useState`/`onClick`. The interactive island. |
| 5 | Server Actions (`'use server'`) | `app/actions.ts` | Call a server function from the browser like it's local — no manual fetch/route. |
| 6 | Streaming with SSE | `app/chat/page.tsx` | Tokens appear as they're generated, via the browser's `EventSource`. |
| 7 | Env & config split | `app/lib/api.ts` | Why there are TWO API URLs: server-only vs. `NEXT_PUBLIC_`. |
| 8 | Wrap-up: SPA vs. Next.js | (compare with `client/`) | When each frontend style wins. The interview answer. |

---

## Lesson detail (what each one actually delivers)

### Lesson 0 — What is Next.js & how to run it
- **Files:** `package.json`, `next.config.mjs`
- You'll learn: `next dev` (hot-reload dev server on port 3000), `next build` (production
  compile), `next start` (serve the built app). `reactStrictMode` in the config.
- **Run it:** `pnpm --filter nextapp dev` → open `http://localhost:3000`.
- SPA contrast: `client/` uses Vite (`vite`, `vite build`). Next.js bundles its own
  server; Vite only builds static files that any web server can host.

### Lesson 1 — Routing by folders
- **Files:** `app/page.tsx` → the `/` route, `app/chat/page.tsx` → the `/chat` route.
- The rule: a folder under `app/` with a `page.tsx` becomes a URL. Nesting = nested URL.
- SPA contrast: in `client/` there's no routing at all yet — it's one `App.tsx`. A real
  SPA would need `react-router` and a `<Routes>` config. Next.js gives you routing from
  the **folder structure** for free.

### Lesson 2 — The layout (shared shell)
- **File:** `app/layout.tsx` — renders `<html><body>`, the nav bar, and `{children}`.
- Every page is dropped into `{children}`, so the nav appears everywhere without repeating it.
- `metadata` here sets the `<title>` / description (SEO) — the server writes real HTML tags.

### Lesson 3 — Server Components (the default!) ⭐
- **File:** `app/page.tsx` — note it's an `async function` that does `await fetch(...)`
  **directly in the component**. That's only possible because it runs on the server.
- `export const dynamic = 'force-dynamic'` = "render this fresh on every request" (so the
  build doesn't need the API live).
- Key beginner "aha": there is **no `useState`, no `useEffect`** here. You fetch and render
  in one pass, on the server. The user gets finished HTML.
- SPA contrast: `client/App.tsx` fetches in a `useEffect` after the page loads → a loading
  flash. The server component has the data *before* the browser sees anything.

### Lesson 4 — Client Components (`'use client'`)
- **File:** `app/components/AskForm.tsx` — the `'use client'` line at the top is the switch.
- Now you can use `useState`, `onChange`, `onClick` again — this is the interactive island
  living inside the server-rendered page.
- The mental rule: **server by default; add `'use client'` only where you need interactivity.**

### Lesson 5 — Server Actions (`'use server'`)
- **File:** `app/actions.ts` — `askRag()` has `'use server'` at the top of the file.
- The client component imports and *calls it like a normal function*, but it **executes on
  the server**. No `fetch`, no API route, no URL. Next.js wires the RPC for you.
- Why it matters: the real API URL / any secret stays on the server; the browser just calls
  `askRag(q)`.
- SPA contrast: `client/src/api.ts` has to hand-write every `fetch`, headers, JSON parsing.

### Lesson 6 — Streaming with SSE
- **File:** `app/chat/page.tsx` — a **client** component using the browser's `EventSource`
  to consume the API's `/llm/stream` Server-Sent-Events endpoint.
- Tokens render as they arrive (`setOut(o => o + chunk)`) — the ChatGPT-style typing effect.
- Teaches: one-way server→client streaming, `[DONE]` sentinel, closing the stream.

### Lesson 7 — Env & config split
- **File:** `app/lib/api.ts` — two constants: `API_URL` (server-only) and `PUBLIC_API_URL`
  (`NEXT_PUBLIC_*`, safe to ship to the browser).
- The rule every Next.js dev must know: **only `NEXT_PUBLIC_`-prefixed env vars reach the
  browser.** Everything else is server-only (that's how secrets stay secret).

### Lesson 8 — Wrap-up: SPA vs. Next.js
- Side-by-side with `client/`. When SPA wins (simple, host anywhere, app-like dashboards),
  when Next.js wins (SEO, fast first paint, hide secrets, less client JS).
- This is the interview money question — we'll rehearse the 60-second answer.

---

## Quiz format (from your ground rules)

Every lesson ends with 3–4 short questions, and the **answers come right after the
questions** in the same message — no waiting, no separate key. You then get a planted bug
to fix before we move on.

---

## Sample gate — Lesson 0 (so you see the format)

**Q1.** What does `next dev` do that `vite` also does, and what does it do *extra*?
**Q2.** Which file tells Next.js that `/chat` is a valid route?
**Q3.** True/false: in Next.js you register routes in a central config file.

**Answers**
**A1.** Both start a hot-reloading dev server. `next dev` *extra*: it also runs a **Node
server** that can render components server-side — Vite only serves static client files.
**A2.** `app/chat/page.tsx` — the folder path *is* the route.
**A3.** **False.** Routing comes from the `app/` folder structure; there's no route config.

---

## How we'll run each session

1. I open the file for the lesson and walk it line-by-line, beginner pace.
2. I point out the SPA (`client/`) equivalent so you see the trade-off.
3. Quiz (answers included).
4. You fix a small planted bug to prove it landed.
5. Only then, next lesson.

Ready when you are — say **"start lesson 0"** (or jump to any lesson number).
