import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { LexicalReranker, RERANKER } from './reranker';
import { LlmModule } from '../llm/llm.module';

/**
 * RAG MODULE  (Stage 6b–6e)
 * imports LlmModule for LLM_PROVIDER (generation). DataSource + EMBEDDING_PROVIDER
 * are global. Exports retrieval + RAG for the agent (6f) and evals (6h).
 */
@Module({
  imports: [LlmModule],
  controllers: [RagController],
  providers: [RetrievalService, RagService, { provide: RERANKER, useClass: LexicalReranker }],
  exports: [RetrievalService, RagService],
})
export class RagModule {}
