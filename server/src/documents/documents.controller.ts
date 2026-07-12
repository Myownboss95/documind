import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ExtractionService, SUPPORTED_MIME_TYPES } from './extraction.service';
import { STORAGE, type StorageAdapter } from '../storage/storage.interface';

// Max upload size — reject bigger files at the interceptor before buffering more.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * DOCUMENTS CONTROLLER  (Stage 1 · HTTP layer, + file-upload stage)
 * ----------------------------------------------------------------
 * Routes live under /documents. The GLOBAL JwtAuthGuard (Stage 2) protects every
 * route here — including /documents/upload — so a valid access token is required.
 */
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly extraction: ExtractionService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  @Get()
  findAll() {
    return this.documentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.findOne(id);
  }

  // POST /documents -> create from JSON (existing flow; enqueues ingest).
  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.documentsService.create(dto);
  }

  /**
   * POST /documents/upload  (multipart/form-data)
   * ---------------------------------------------
   * Accepts a real file (PDF / DOCX / TXT / MD) + optional `title` field:
   *   1. validate size + mime (reject unsupported early)
   *   2. store the raw bytes via the swappable STORAGE adapter -> a uri
   *   3. EXTRACT plain text from the bytes (pdf-parse / mammoth / utf-8)
   *   4. reuse DocumentsService.create({ content: text }) — which persists the doc
   *      and ENQUEUES the existing BullMQ ingest job (chunk -> embed -> pgvector).
   *
   * We deliberately DON'T re-implement ingestion here: extraction just produces the
   * `content` string the existing pipeline already knows how to chunk + embed.
   *
   * FileInterceptor('file') buffers the field named `file` into memory (file.buffer)
   * via multer. `limits.fileSize` caps the upload so a huge file is rejected before
   * we buffer all of it. Requires auth (NOT @Public).
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('title') title?: string,
  ) {
    if (!file) {
      throw new BadRequestException("missing file (send multipart field 'file')");
    }

    const mimeType = file.mimetype;
    if (!SUPPORTED_MIME_TYPES.includes(mimeType as (typeof SUPPORTED_MIME_TYPES)[number])) {
      throw new BadRequestException(
        `unsupported file type '${mimeType}'. Allowed: ${SUPPORTED_MIME_TYPES.join(', ')}`,
      );
    }

    // Namespaced, collision-proof key: documents/<uuid>-<original name>.
    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_');
    const key = `documents/${randomUUID()}-${safeName}`;

    // 1) store the raw bytes -> uri (local:// today, s3:// when STORAGE_DRIVER=s3).
    const uri = await this.storage.put(key, file.buffer, mimeType);

    // 2) extract text from the same bytes.
    const content = await this.extraction.extract(file.buffer, mimeType, file.originalname);

    // 3) reuse the existing create flow (persist + enqueue ingest). Returns status 'pending'.
    return this.documentsService.create({
      title: title?.trim() || file.originalname,
      sourceUri: uri,
      mimeType,
      content,
    });
  }
}
