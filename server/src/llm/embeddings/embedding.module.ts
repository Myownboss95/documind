import { Global, Module } from '@nestjs/common';
import { EMBEDDING_PROVIDER, LocalEmbeddingProvider } from './embedding.provider';

/**
 * EMBEDDING MODULE  (Stage 6b) — @Global so ingest (Stage 4) and retrieval both
 * inject the same EMBEDDING_PROVIDER. Swap LocalEmbeddingProvider for a real
 * embeddings-API provider in live mode.
 */
@Global()
@Module({
  providers: [{ provide: EMBEDDING_PROVIDER, useClass: LocalEmbeddingProvider }],
  exports: [EMBEDDING_PROVIDER],
})
export class EmbeddingModule {}
