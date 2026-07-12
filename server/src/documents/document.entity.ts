import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChunkEntity } from './chunk.entity';

export type DocumentStatus = 'pending' | 'ingesting' | 'ready' | 'failed';

/**
 * DOCUMENT ENTITY  (Stage 3 · TypeORM)
 * ------------------------------------
 * @Entity maps this class to a DB table. Each @Column maps to a column. TypeORM
 * reads these decorators to create/query the table. (Laravel: an Eloquent model +
 * its migration, combined. Prisma: a `model` block in schema.prisma.)
 *
 * PRISMA EQUIVALENT (schema.prisma):
 *   model Document {
 *     id        String   @id @default(uuid())
 *     title     String   @db.VarChar(200)
 *     sourceUri String   @map("source_uri")
 *     mimeType  String   @map("mime_type")
 *     status    String   @default("pending")
 *     createdAt DateTime @default(now()) @map("created_at")
 *     @@map("documents")
 *   }
 *
 * The `!` after each field is TypeScript's "definite assignment assertion" — we
 * promise these get set (by TypeORM at load time), so strict mode won't complain
 * they're uninitialized in the constructor.
 */
@Entity({ name: 'documents' })
export class DocumentEntity {
  // 'uuid' -> Postgres generates a UUID primary key. (Laravel: $table->uuid('id').)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 200 })
  title!: string;

  // @Column({ name: '...' }) -> snake_case column, camelCase property. A common
  // convention: snake_case in the DB, camelCase in code.
  @Column({ name: 'source_uri' })
  sourceUri!: string;

  @Column({ name: 'mime_type' })
  mimeType!: string;

  // Body text (Stage 6) — what the ingest worker chunks + embeds for RAG. Nullable
  // because a doc may be metadata-only until its content is uploaded.
  @Column({ type: 'text', nullable: true })
  content!: string | null;

  // @Index -> a B-tree index on status (we filter docs by status a lot). We go
  // deeper on indexing + EXPLAIN in a later sub-step; this shows the decorator.
  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  status!: DocumentStatus;

  // @CreateDateColumn -> auto-set to now() on insert. (Laravel: $table->timestamps().)
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // The inverse side of the relation: one document has many chunks. This is NOT a
  // column — it's a virtual relation TypeORM populates only when you ask for it
  // (via `relations`/join). By default it's undefined -> which is exactly how N+1
  // sneaks in (you load docs, then query chunks per doc). (Laravel: hasMany.)
  @OneToMany(() => ChunkEntity, (chunk) => chunk.document)
  chunks!: ChunkEntity[];
}
