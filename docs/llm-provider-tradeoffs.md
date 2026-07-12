# Multi-provider abstraction & tradeoffs (Stage 6g)

Our `LLMProvider` interface (`generate` + `stream`) lets the same RAG/agent code run
against Anthropic, OpenAI, or a mock. Adding a vendor = one class + one factory
branch. Here's *why* the abstraction matters and what actually differs.

## Why abstract at all
- **Failover / outages** — if one provider is down or rate-limited, route to another.
- **Cost/latency routing** — cheap model for cheap tasks, frontier model for hard ones.
- **Avoid lock-in** — vendor pricing/limits change; don't rewrite your app to switch.
- **Testing** — a mock provider makes the whole pipeline runnable offline, no spend.

## What differs between providers (the interview substance)

| Dimension | Anthropic (Messages API) | OpenAI (Chat Completions) |
|---|---|---|
| System prompt | **top-level** `system` field | folded into `messages` as `{role:'system'}` |
| Tool-call format | `tool_use` / `tool_result` **content blocks** | `tools` + `tool_calls` **JSON** on the message |
| Sampling params | **removed** on current models (temperature 400s) | `temperature`/`top_p` still accepted |
| Thinking/effort | adaptive thinking + `effort` levels | reasoning-effort on o-series models |
| Streaming | SSE, `content_block_delta` events | SSE, `choices[].delta.content` |
| Context / cost | per-model (e.g. 1M ctx tiers) | per-model | 

**The adapter's job** is to hide all of this so upstream code never branches on vendor.
Our `toMessages()` in each provider normalizes the system-prompt placement; a full
agent abstraction also normalizes the **tool-call format** (the biggest real gap —
Anthropic's block model vs OpenAI's JSON `tool_calls`).

## Failover pattern (sketch)
```
try   -> primary.generate(...)
catch (RateLimit/5xx/timeout) -> secondary.generate(...)   // same interface
```
Anthropic's SDK even has a server-side `fallbacks` param; cross-vendor failover you
wire yourself behind the interface. Add a circuit breaker + timeouts so a slow
provider doesn't stall every request.

## Selecting the provider (this repo)
`LlmModule` factory: `MODE=live` + `PROVIDER=openai` + `OPENAI_API_KEY` → OpenAI;
`MODE=live` + `ANTHROPIC_API_KEY` → Anthropic; otherwise the offline mock.
