import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * CREATE DOCUMENT DTO  (Stage 1 · ④ — now validated)
 * --------------------------------------------------
 * Each decorator is one validation rule, read at RUNTIME by Nest's ValidationPipe.
 * This is a Nest DTO doing exactly what a Laravel Form Request's rules() does:
 *
 *   LARAVEL rules():
 *     'title'     => ['required', 'string', 'max:200'],
 *     'sourceUri' => ['required', 'string'],
 *     'mimeType'  => ['required', 'in:application/pdf,text/plain,text/markdown'],
 *
 * WHY a class (not interface): decorators need a real runtime object to attach to.
 * WHY validate here: the handler then only ever sees clean, typed data — no
 * `if (typeof title !== 'string')` paranoia scattered through business logic.
 */
export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  sourceUri!: string;

  // DocuMind only ingests these types for now — reject anything else at the door.
  @IsIn(['application/pdf', 'text/plain', 'text/markdown'])
  mimeType!: string;

  // Optional body text — the RAG corpus. When present, the ingest worker chunks
  // and embeds it. (In a real app you'd upload the file and extract text server-side.)
  @IsString()
  @IsOptional()
  @MaxLength(100_000)
  content?: string;
}
