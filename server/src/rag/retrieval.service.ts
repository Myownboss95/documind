import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
  toVectorLiteral,
} from '../llm/embeddings/embedding.provider';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
}

/**
 * RETRIEVAL SERVICE  (Stage 6b)
 * -----------------------------
 * Three retrievers over the `chunks` table:
 *  - vectorSearch  : semantic — cosine distance on pgvector embeddings (`<=>`).
 *  - keywordSearch : lexical — Postgres full-text search (tsvector/tsquery, ts_rank).
 *  - hybridSearch  : fuse both with Reciprocal Rank Fusion (RRF).
 *
 * WHY HYBRID? Vector search finds semantically-related text even with different
 * words; keyword search nails exact terms, names, IDs, and rare tokens that
 * embeddings blur. Each misses what the other catches — hybrid gets both. RRF
 * combines rankings without needing the two score scales to be comparable.
 */
@Injectable()
export class RetrievalService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
  ) {}

  async vectorSearch(query: string, k = 5): Promise<RetrievedChunk[]> {
    const qv = toVectorLiteral(await this.embedder.embed(query));
    const rows: Array<{ id: string; document_id: string; content: string; score: string }> =
      await this.db.query(
        `SELECT id, document_id, content, 1 - (embedding <=> $1::vector) AS score
         FROM chunks
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [qv, k],
      );
    return rows.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      content: r.content,
      score: Number(r.score),
      source: 'vector' as const,
    }));
  }

  async keywordSearch(query: string, k = 5): Promise<RetrievedChunk[]> {
    const rows: Array<{ id: string; document_id: string; content: string; score: string }> =
      await this.db.query(
        `SELECT id, document_id, content,
                ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS score
         FROM chunks
         WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
         ORDER BY score DESC
         LIMIT $2`,
        [query, k],
      );
    return rows.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      content: r.content,
      score: Number(r.score),
      source: 'keyword' as const,
    }));
  }

  async hybridSearch(query: string, k = 5): Promise<RetrievedChunk[]> {
    const [vec, kw] = await Promise.all([
      this.vectorSearch(query, k * 2),
      this.keywordSearch(query, k * 2),
    ]);
    // Reciprocal Rank Fusion: score = Σ 1/(C + rank). C=60 is the common default.
    const C = 60;
    const fused = new Map<string, { chunk: RetrievedChunk; rrf: number }>();
    const fuse = (list: RetrievedChunk[]) =>
      list.forEach((c, i) => {
        const add = 1 / (C + i + 1);
        const cur = fused.get(c.chunkId);
        if (cur) cur.rrf += add;
        else fused.set(c.chunkId, { chunk: { ...c, source: 'hybrid' }, rrf: add });
      });
    fuse(vec);
    fuse(kw);
    return [...fused.values()]
      .sort((a, b) => b.rrf - a.rrf)
      .slice(0, k)
      .map((s) => ({ ...s.chunk, score: s.rrf }));
  }
}
