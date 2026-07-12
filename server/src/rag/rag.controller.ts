import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, MinLength, Max, Min } from 'class-validator';
import { RetrievalService } from './retrieval.service';
import { RagService } from './rag.service';
import { Public } from '../auth/decorators/public.decorator';

class RagQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(10)
  k?: number;
}

/**
 * RAG CONTROLLER
 *  GET  /rag/search?q=&mode=vector|keyword|hybrid&k=   (Stage 6b — raw retrieval)
 *  POST /rag/query { query, k }                        (Stage 6e — full RAG w/ citations)
 */
@Public()
@Controller('rag')
export class RagController {
  constructor(
    private readonly retrieval: RetrievalService,
    private readonly rag: RagService,
  ) {}

  @Get('search')
  async search(@Query('q') q: string, @Query('mode') mode = 'hybrid', @Query('k') k = '5') {
    const query = q ?? '';
    const kk = Number(k) || 5;
    if (mode === 'vector') return { mode, results: await this.retrieval.vectorSearch(query, kk) };
    if (mode === 'keyword') return { mode, results: await this.retrieval.keywordSearch(query, kk) };
    return { mode: 'hybrid', results: await this.retrieval.hybridSearch(query, kk) };
  }

  @Post('query')
  async query(@Body() dto: RagQueryDto) {
    return this.rag.answer(dto.query, dto.k ?? 4);
  }
}
