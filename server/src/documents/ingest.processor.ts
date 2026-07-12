import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { DocumentEntity, type DocumentStatus } from './document.entity';
import { DOCUMENT_STATUS_EVENT } from '../realtime/events.gateway';
import { ChunkEntity } from './chunk.entity';
import { CacheService } from '../redis/cache.service';
import { ChunkingService } from './chunking.service';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
  toVectorLiteral,
} from '../llm/embeddings/embedding.provider';
import { DOCS_CACHE_KEY, INGEST_DLQ, INGEST_QUEUE } from './ingest.constants';

interface IngestJob {
  documentId: string;
}

/**
 * INGEST PROCESSOR  (Stage 4 · the CONSUMER)
 * ------------------------------------------
 * @Processor(INGEST_QUEUE) makes this a BullMQ worker. process() runs for each
 * job: it "chunks + embeds" a document (simulated) and flips status to ready.
 *
 * IDEMPOTENCY (why it matters: a job can run MORE THAN ONCE — retries, at-least-once
 * delivery, crashes after work but before ack). So process() must be safe to repeat:
 *  - if the doc is already 'ready', skip.
 *  - delete existing chunks before re-inserting (so a retry doesn't DOUBLE them).
 * This is the SAME discipline as payment/webhook handlers: dedupe by a stable key,
 * make the effect the same whether run once or five times.
 *
 * RETRIES + DLQ: the job is enqueued with attempts:3 + exponential backoff. If it
 * still fails, onFailed moves it to a dead-letter queue and marks the doc 'failed'.
 */
@Processor(INGEST_QUEUE)
export class IngestProcessor extends WorkerHost {
  private readonly logger = new Logger('IngestProcessor');

  constructor(
    @InjectRepository(DocumentEntity) private readonly docs: Repository<DocumentEntity>,
    @InjectRepository(ChunkEntity) private readonly chunks: Repository<ChunkEntity>,
    @InjectQueue(INGEST_DLQ) private readonly dlq: Queue,
    private readonly cache: CacheService,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
    @InjectDataSource() private readonly db: DataSource,
    private readonly chunker: ChunkingService,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  /**
   * Emit an in-process app event on every status transition. The WebSocket gateway
   * (@OnEvent) re-broadcasts it to connected browsers for live updates. Decoupled:
   * this worker never touches socket.io. (Stage 5)
   */
  private emitStatus(documentId: string, status: DocumentStatus): void {
    this.events.emit(DOCUMENT_STATUS_EVENT, { documentId, status });
  }

  async process(job: Job<IngestJob>): Promise<void> {
    const { documentId } = job.data;
    const doc = await this.docs.findOne({ where: { id: documentId } });
    if (!doc) return; // deleted meanwhile — nothing to do

    // IDEMPOTENCY guard: a retried/duplicate job for an already-ingested doc no-ops.
    if (doc.status === 'ready') {
      this.logger.log(`skip ${documentId} — already ready`);
      return;
    }

    // Demo hook: a doc whose title contains FAIL always throws -> exercises retries+DLQ.
    if (doc.title.includes('FAIL')) {
      throw new Error('simulated ingest failure');
    }

    await this.docs.update({ id: documentId }, { status: 'ingesting' });
    this.emitStatus(documentId, 'ingesting'); // live: pending -> ingesting

    // Chunk the document body (fixed-size + overlap); fall back to a title stub
    // when there's no body text. (Stage 6c compares fixed vs semantic chunking.)
    const body = doc.content?.trim();
    const pieces =
      body && body.length > 0
        ? this.chunker.fixedSize(body, 300, 50)
        : [`${doc.title} — ${doc.sourceUri}`];

    // Idempotent: delete existing chunks before re-inserting (safe on retry).
    await this.chunks.delete({ documentId });
    for (let i = 0; i < pieces.length; i++) {
      const saved = await this.chunks.save(
        this.chunks.create({ index: i, content: pieces[i], documentId }),
      );
      // Embed + store the vector via raw SQL (pgvector isn't a native TypeORM type).
      const emb = await this.embedder.embed(pieces[i]);
      await this.db.query(`UPDATE chunks SET embedding = $1::vector WHERE id = $2`, [
        toVectorLiteral(emb),
        saved.id,
      ]);
    }

    await this.docs.update({ id: documentId }, { status: 'ready' });
    this.emitStatus(documentId, 'ready'); // live: ingesting -> ready
    await this.cache.del(DOCS_CACHE_KEY); // invalidate stale doc list
    this.logger.log(`ingested ${documentId} -> ready`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<IngestJob>, err: Error): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      // Retries exhausted -> DEAD-LETTER. Keep the payload + reason for inspection.
      await this.dlq.add('dead', {
        documentId: job.data.documentId,
        reason: err.message,
        attempts: job.attemptsMade,
      });
      await this.docs.update({ id: job.data.documentId }, { status: 'failed' });
      this.emitStatus(job.data.documentId, 'failed'); // live: -> failed (retries exhausted)
      this.logger.warn(`DLQ: ${job.data.documentId} after ${job.attemptsMade} attempts — ${err.message}`);
    }
  }
}
