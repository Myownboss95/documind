import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

// MIME constants for the file types DocuMind can ingest.
export const MIME_PDF = 'application/pdf';
export const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MIME_TXT = 'text/plain';
export const MIME_MD = 'text/markdown';

/** The set the upload endpoint accepts (also used to validate at the door). */
export const SUPPORTED_MIME_TYPES = [MIME_PDF, MIME_DOCX, MIME_TXT, MIME_MD] as const;

/**
 * EXTRACTION SERVICE  (File-upload stage · file bytes -> plain text)
 * -----------------------------------------------------------------
 * Turns an uploaded file's raw bytes into the plain text that the EXISTING ingest
 * pipeline chunks + embeds. It does NOT chunk or embed — it only produces the
 * `content` string we hand to DocumentsService.create(), so the whole downstream
 * flow (BullMQ ingest -> chunk -> pgvector) is reused unchanged.
 *
 *  - PDF  -> pdf-parse (pure JS, offline)
 *  - DOCX -> mammoth extractRawText (pure JS, offline)
 *  - TXT / Markdown -> decode UTF-8
 *  - anything else -> 400 BadRequest
 *
 * All three libraries work fully offline (no cloud creds), matching the project's
 * "runs offline" constraint.
 */
@Injectable()
export class ExtractionService {
  private readonly logger = new Logger('ExtractionService');

  async extract(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    switch (mimeType) {
      case MIME_PDF: {
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          return result.text.trim();
        } finally {
          await parser.destroy();
        }
      }
      case MIME_DOCX: {
        const result = await mammoth.extractRawText({ buffer });
        return result.value.trim();
      }
      case MIME_TXT:
      case MIME_MD:
        return buffer.toString('utf8').trim();
      default:
        this.logger.warn(`unsupported file type ${mimeType} (${filename})`);
        throw new BadRequestException(
          `unsupported file type '${mimeType}'. Allowed: ${SUPPORTED_MIME_TYPES.join(', ')}`,
        );
    }
  }
}
