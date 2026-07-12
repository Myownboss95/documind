import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { IngestProcessor } from './ingest.processor';
import { ChunkingService } from './chunking.service';
import { DocumentEntity } from './document.entity';
import { ChunkEntity } from './chunk.entity';
import { INGEST_DLQ, INGEST_QUEUE } from './ingest.constants';

/**
 * DOCUMENTS MODULE  (Stage 4)
 * ---------------------------
 * - forFeature([DocumentEntity, ChunkEntity]) -> repos for the service + processor.
 * - registerQueue(ingest, ingest-dlq) -> the producer queue + the dead-letter queue.
 * - IngestProcessor is the worker (consumer) for the ingest queue.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, ChunkEntity]),
    BullModule.registerQueue({ name: INGEST_QUEUE }, { name: INGEST_DLQ }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, IngestProcessor, ChunkingService],
  exports: [ChunkingService],
})
export class DocumentsModule {}
