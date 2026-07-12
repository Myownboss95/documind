import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { DocumentEntity } from './document.entity';
import { CacheService } from '../redis/cache.service';
import { DOCS_CACHE_KEY, INGEST_QUEUE } from './ingest.constants';
import type { CreateDocumentDto } from './dto/create-document.dto';

/**
 * DOCUMENTS SERVICE  (Stage 4 · producer + cache-aside)
 * -----------------------------------------------------
 * create() now: saves the doc (status 'pending'), invalidates the list cache, and
 * ENQUEUES an ingest job (the heavy chunk+embed work happens async in a worker, so
 * the HTTP request returns instantly). findAll() uses cache-aside.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    @InjectQueue(INGEST_QUEUE)
    private readonly ingestQueue: Queue,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateDocumentDto): Promise<DocumentEntity> {
    const doc = await this.documents.save(
      this.documents.create({
        title: dto.title,
        sourceUri: dto.sourceUri,
        mimeType: dto.mimeType,
        content: dto.content ?? null,
        status: 'pending',
      }),
    );

    await this.cache.del(DOCS_CACHE_KEY); // write invalidates the cached list

    // Enqueue async ingestion. jobId = a STABLE key -> BullMQ dedupes, so the same
    // document can't be queued twice (idempotency at the ENQUEUE boundary). attempts
    // + exponential backoff give automatic retries on transient failures.
    await this.ingestQueue.add(
      'ingest',
      { documentId: doc.id },
      {
        jobId: `ingest-${doc.id}`, // stable id for idempotency (BullMQ forbids ':')
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    );

    return doc;
  }

  async findAll(): Promise<DocumentEntity[]> {
    // cache-aside READ: try cache first.
    const cached = await this.cache.getJson<DocumentEntity[]>(DOCS_CACHE_KEY);
    if (cached) return cached;

    const docs = await this.documents.find({ order: { createdAt: 'DESC' } });
    await this.cache.setJson(DOCS_CACHE_KEY, docs, 30); // populate with a 30s TTL
    return docs;
  }

  async findOne(id: string): Promise<DocumentEntity> {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc) {
      throw new NotFoundException(`document ${id} not found`);
    }
    return doc;
  }
}
