import { Injectable } from '@nestjs/common';
import type { GenerateOptions, LLMProvider } from './provider.interface';

/**
 * MOCK PROVIDER  (Stage 6a — offline default)
 * -------------------------------------------
 * Deterministic, no API key, no network. Lets us build+test the RAG/agent CONTROL
 * FLOW without spending money. Same interface as the real provider, so swapping to
 * Anthropic (MODE=live + key) changes nothing downstream.
 */
@Injectable()
export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  async generate(opts: GenerateOptions): Promise<string> {
    // ReAct awareness (Stage 6f): when driving the agent loop offline, emit a valid
    // ReAct step deterministically — an Action first, then a Final Answer once a
    // tool Observation is present. (A real LLM does this reasoning itself.)
    if (opts.system?.includes('ReAct agent')) {
      const convo = opts.messages.map((m) => m.content).join('\n');
      if (convo.includes('Observation:')) {
        const obs = convo.split('Observation:').pop()?.trim().slice(0, 200) ?? '';
        return `Final Answer: Based on the tools, here is the answer (mock): ${obs}`;
      }
      const lastQ = [...opts.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const q = (lastQ.match(/Question:\s*(.*)/)?.[1] ?? lastQ).slice(0, 80);
      return `Thought: I should search the knowledge base.\nAction: search_documents\nAction Input: ${q}`;
    }

    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user');
    const sys = opts.system ? ` [system: ${opts.system.slice(0, 40)}…]` : '';
    return `«mock reply»${sys} to: "${(lastUser?.content ?? '').slice(0, 120)}"`;
  }

  async *stream(opts: GenerateOptions): AsyncIterable<string> {
    // Emit the mock reply word-by-word to simulate streaming tokens.
    const text = await this.generate(opts);
    for (const word of text.split(' ')) {
      yield word + ' ';
      await new Promise((r) => setTimeout(r, 15));
    }
  }
}
