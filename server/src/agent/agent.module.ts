import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';

/**
 * AGENT MODULE  (Stage 6f) — needs LLM_PROVIDER (planning) + RetrievalService
 * (the search_documents tool), both from imported modules.
 */
@Module({
  imports: [LlmModule, RagModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
