import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the pgvector embedding column to chunks + an HNSW cosine index.
 * (Hand-written because pgvector's `vector` type isn't a native TypeORM column
 * type — this is the standard pgvector + TypeORM pattern: raw SQL for vectors.)
 */
export class AddChunkEmbedding1783820000000 implements MigrationInterface {
  name = 'AddChunkEmbedding1783820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    // Documents get a body text column (what we chunk + embed for RAG).
    await queryRunner.query(`ALTER TABLE "documents" ADD COLUMN "content" text`);
    await queryRunner.query(`ALTER TABLE "chunks" ADD COLUMN "embedding" vector(256)`);
    // HNSW index for fast approximate nearest-neighbour cosine search.
    await queryRunner.query(
      `CREATE INDEX "IDX_chunks_embedding_hnsw" ON "chunks" USING hnsw ("embedding" vector_cosine_ops)`,
    );
    // GIN index backing full-text keyword search on chunk content.
    await queryRunner.query(
      `CREATE INDEX "IDX_chunks_content_fts" ON "chunks" USING gin (to_tsvector('english', "content"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chunks_content_fts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chunks_embedding_hnsw"`);
    await queryRunner.query(`ALTER TABLE "chunks" DROP COLUMN IF EXISTS "embedding"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "content"`);
  }
}
