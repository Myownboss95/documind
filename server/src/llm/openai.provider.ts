import { Injectable } from '@nestjs/common';
import type { GenerateOptions, LLMProvider } from './provider.interface';

/**
 * OPENAI PROVIDER  (Stage 6g — the second provider behind the SAME interface)
 * --------------------------------------------------------------------------
 * Uses raw fetch against the Chat Completions API (no extra SDK). The point of
 * this file is the ABSTRACTION: RAG + agent code depend on LLMProvider, so adding
 * a whole second vendor is one class + one factory branch — zero changes upstream.
 *
 * KEY DIFFERENCES from Anthropic (the 6g tradeoffs — see docs/llm-provider-tradeoffs.md):
 *  - Message shape: OpenAI folds the system prompt INTO the messages array
 *    ({role:'system'}); Anthropic has a TOP-LEVEL `system` field. This adapter
 *    hides that difference.
 *  - Tool-call format differs (OpenAI `tools`/`tool_calls` JSON vs Anthropic
 *    `tool_use`/`tool_result` blocks) — an agent abstraction must normalize both.
 *  - Sampling: OpenAI still takes `temperature`; current Anthropic models don't.
 *  - Context limits, cost, and latency differ per model → a reason to failover.
 */
@Injectable()
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly key = process.env.OPENAI_API_KEY ?? '';
  private readonly model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  private toMessages(opts: GenerateOptions) {
    const msgs: Array<{ role: string; content: string }> = [];
    if (opts.system) msgs.push({ role: 'system', content: opts.system }); // folded in
    for (const m of opts.messages) msgs.push({ role: m.role, content: m.content });
    return msgs;
  }

  async generate(opts: GenerateOptions): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxTokens ?? 1024,
        messages: this.toMessages(opts),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? '';
  }

  async *stream(opts: GenerateOptions): AsyncIterable<string> {
    // For brevity we reuse generate() then chunk it. A production impl parses the
    // OpenAI SSE stream (`stream:true`, `data:` lines, `delta.content`). Same
    // consumer contract either way.
    const text = await this.generate(opts);
    for (const word of text.split(' ')) yield word + ' ';
  }
}
