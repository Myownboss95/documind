import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DocumentEntity } from './document.entity';

/**
 * CHUNK ENTITY  (Stage 3 · N+1 demo; also DocuMind's ingestion unit)
 * -----------------------------------------------------------------
 * A document is split into many chunks (Stage 6 embeds each chunk). So:
 *   Document 1 ── has many ──> N Chunks
 *
 * @ManyToOne says "many chunks belong to one document". @JoinColumn names the FK
 * column (document_id). We index document_id because we constantly query
 * "chunks WHERE document_id = ?" — without that index those lookups are seq scans.
 * onDelete: 'CASCADE' -> deleting a document deletes its chunks.
 * (Laravel: $table->foreignUuid('document_id')->constrained()->cascadeOnDelete()
 *  + belongsTo(Document::class). Prisma: a relation field + @relation.)
 */
@Entity({ name: 'chunks' })
export class ChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  index!: number; // position of this chunk within its document

  @Column({ type: 'text' })
  content!: string;

  @Index()
  @Column({ name: 'document_id' })
  documentId!: string;

  @ManyToOne(() => DocumentEntity, (doc) => doc.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: DocumentEntity;
}
