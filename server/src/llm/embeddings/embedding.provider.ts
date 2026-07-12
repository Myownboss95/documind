import { Injectable } from '@nestjs/common';

/**
 * EMBEDDING PROVIDER  (Stage 6b)
 * ------------------------------
 * Mirrors the LLM provider abstraction: same interface, swappable implementation.
 * The offline default is a DETERMINISTIC LOCAL embedder (no key, no network) so the
 * whole RAG pipeline runs and is testable. In live mode you'd swap in a real
 * embeddings API (OpenAI text-embedding-3, Voyage, Cohere) — one-line change.
 *
 * HONEST LIMITATION: the local embedder is a hashed bag-of-words, so cosine
 * similarity ≈ token overlap, NOT deep semantics. It's enough to demonstrate the
 * pipeline (embed → pgvector → cosine → hybrid → rerank → RAG) and the SQL/vector
 * mechanics; real semantic quality needs real embeddings. The dimension is fixed
 * (must match the pgvector column: vector(256)).
 */
export const EMBEDDING_DIM = 256;
export const EMBEDDING_PROVIDER = 'EMBEDDING_PROVIDER';

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** djb2 string hash → non-negative int. */
function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return h >>> 0;
}

@Injectable()
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local-hash';
  readonly dim = EMBEDDING_DIM;

  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(this.dim).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const tok of tokens) {
      // Two hashes per token reduce collisions and add a little structure.
      v[hash(tok) % this.dim] += 1;
      v[hash(tok + '#') % this.dim] += 0.5;
    }
    // L2-normalize so cosine distance behaves (unit vectors).
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

/** Format a JS number[] as a pgvector literal: '[0.1,0.2,...]'. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}
