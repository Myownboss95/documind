/**
 * LLM PROVIDER ABSTRACTION  (Stage 6a / 6g)
 * -----------------------------------------
 * A thin, provider-agnostic interface so the same RAG/agent code can run against
 * Anthropic, a mock, or (6g) OpenAI without changes. This is the seam that makes
 * provider swaps and offline testing possible.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  /** System prompt — instructions/role, SEPARATE from the user turns. */
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface LLMProvider {
  readonly name: string;
  /** Non-streaming: wait for the whole completion. */
  generate(opts: GenerateOptions): Promise<string>;
  /** Streaming: yield text chunks as they arrive (token-by-token feel). */
  stream(opts: GenerateOptions): AsyncIterable<string>;
}

/** DI token for whichever provider is active (chosen by MODE + key in LlmModule). */
export const LLM_PROVIDER = 'LLM_PROVIDER';
