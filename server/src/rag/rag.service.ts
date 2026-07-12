import { Inject, Injectable } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { RERANKER, type Reranker } from './reranker';
import { LLM_PROVIDER, type LLMProvider } from '../llm/provider.interface';

export interface Citation {
  marker: number;
  chunkId: string;
  documentId: string;
  snippet: string;
}
export interface RagAnswer {
  answer: string;
  citations: Citation[];
  provider: string;
  reranker: string;
}

/**
 * RAG PIPELINE  (Stage 6e)
 * ------------------------
 * One method wires the whole thing: EMBED (inside retrieval) → RETRIEVE (hybrid,
 * over-fetched) → RERANK (narrow to top-k) → GENERATE (LLM, grounded on the
 * retrieved context) → return the answer WITH CITATIONS back to source chunks.
 *
 * The system prompt forces grounding ("answer only from context, cite [1][2], say
 * you don't know otherwise") — this is what curbs hallucination and makes the
 * answer auditable. Citations map each numbered context block back to its chunk +
 * document so the UI can show sources.
 */
@Injectable()
export class RagService {
  constructor(
    private readonly retrieval: RetrievalService,
    @Inject(RERANKER) private readonly reranker: Reranker,
    @Inject(LLM_PROVIDER) private readonly llm: LLMProvider,
  ) {}

  async answer(query: string, k = 4): Promise<RagAnswer> {
    // Retrieve wide (k*3 candidates via hybrid), then rerank down to k.
    const candidates = await this.retrieval.hybridSearch(query, k * 3);
    const top = await this.reranker.rerank(query, candidates, k);

    const context = top.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
    const system =
      'You are a helpful assistant for a document knowledge base. Answer ONLY using the ' +
      'provided context. Cite the sources you use with bracketed numbers like [1], [2]. ' +
      "If the answer is not in the context, say you don't know — do not invent facts.";
    const userPrompt = `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer (with [n] citations):`;

    const answer = await this.llm.generate({
      system,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 512,
    });

    const citations: Citation[] = top.map((c, i) => ({
      marker: i + 1,
      chunkId: c.chunkId,
      documentId: c.documentId,
      snippet: c.content.replace(/\s+/g, ' ').slice(0, 140),
    }));

    return { answer, citations, provider: this.llm.name, reranker: this.reranker.name };
  }
}
