import { Injectable } from '@nestjs/common';
import type { RetrievedChunk } from './retrieval.service';

/**
 * RERANKER  (Stage 6d)
 * --------------------
 * WHY rerank at all? Top-k vector search is a COARSE first pass — ANN over
 * embeddings is fast but approximate, and a single embedding can't capture exactly
 * how well a chunk answers THIS query. So we OVER-RETRIEVE (e.g. top 12) with the
 * cheap retriever, then RE-SCORE those candidates with a more precise (but slower)
 * signal and keep the best few. This "retrieve wide, rerank narrow" pattern
 * consistently beats top-k vector search alone on precision.
 *
 * Offline default = a lexical reranker (deterministic term-overlap score). In live
 * mode you'd swap in a cross-encoder (e.g. Cohere/BGE reranker) or LLM-as-reranker
 * (ask the model to score each chunk 0–10 for relevance) — same interface.
 */
export const RERANKER = 'RERANKER';

export interface Reranker {
  readonly name: string;
  rerank(query: string, chunks: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]>;
}

@Injectable()
export class LexicalReranker implements Reranker {
  readonly name = 'lexical';

  async rerank(query: string, chunks: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]> {
    const qTerms = new Set<string>(query.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const scored = chunks.map((c) => {
      const cTerms: string[] = c.content.toLowerCase().match(/[a-z0-9]+/g) ?? [];
      const overlap = cTerms.reduce((n: number, t) => n + (qTerms.has(t) ? 1 : 0), 0);
      // Normalize by sqrt(length) so long chunks don't win purely on size.
      const score = overlap / Math.sqrt(cTerms.length || 1);
      return { ...c, score };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}
