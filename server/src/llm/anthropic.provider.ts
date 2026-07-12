import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import type { GenerateOptions, LLMProvider } from './provider.interface';

/**
 * ANTHROPIC PROVIDER  (Stage 6a — the REAL SDK, used when MODE=live + key)
 * -----------------------------------------------------------------------
 * `new Anthropic()` reads ANTHROPIC_API_KEY from the env automatically.
 *
 * SENIOR NOTE (current, correct as of 2026): on the latest models
 * (claude-opus-4-8), the classic sampling params — temperature / top_p / top_k —
 * are REMOVED and return a 400 if sent. You control depth/behavior via prompting
 * and (where supported) effort/adaptive thinking, not a temperature knob. So this
 * provider deliberately does NOT pass temperature. `max_tokens` is required and is
 * a hard ceiling on output (why it matters: too low truncates mid-answer).
 *
 * `system` is a TOP-LEVEL field, separate from the user/assistant `messages` — the
 * standard system-vs-user-prompt split.
 */
const MODEL = 'claude-opus-4-8';

@Injectable()
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client = new Anthropic();

  async generate(opts: GenerateOptions): Promise<string> {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    // content is a list of blocks; concatenate the text blocks.
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  async *stream(opts: GenerateOptions): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
