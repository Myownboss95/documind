import { Injectable } from '@nestjs/common';

/**
 * CHUNKING SERVICE  (Stage 6c)
 * ----------------------------
 * Two strategies, so you can compare retrieval quality:
 *
 *  - fixedSize: split into fixed CHARACTER windows with OVERLAP. Simple and
 *    predictable, but blindly cuts mid-sentence — a chunk can start/end in the
 *    middle of an idea, hurting embedding quality and retrieval precision.
 *
 *  - semantic: split on sentence/paragraph boundaries, then greedily pack
 *    sentences up to a size budget. Chunks stay coherent (whole thoughts), which
 *    usually improves retrieval — related text lands together, boundaries fall on
 *    natural breaks.
 *
 * WHY OVERLAP (fixed): a fact that straddles a boundary would be split across two
 * chunks and retrievable from neither cleanly; overlap keeps boundary context in
 * both. Tradeoff: overlap duplicates text → more chunks, more storage/embeddings.
 */
@Injectable()
export class ChunkingService {
  fixedSize(text: string, size = 300, overlap = 50): string[] {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const step = Math.max(1, size - overlap);
    const out: string[] = [];
    for (let i = 0; i < clean.length; i += step) {
      out.push(clean.slice(i, i + size));
      if (i + size >= clean.length) break;
    }
    return out.filter((c) => c.trim().length > 0);
  }

  semantic(text: string, maxSize = 400): string[] {
    const sentences = text
      .split(/(?<=[.!?])\s+|\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    const out: string[] = [];
    let cur = '';
    for (const s of sentences) {
      const candidate = cur ? `${cur} ${s}` : s;
      if (candidate.length > maxSize && cur) {
        out.push(cur.trim());
        cur = s;
      } else {
        cur = candidate;
      }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
}
