import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AgentService } from './agent.service';
import { Public } from '../auth/decorators/public.decorator';

class AgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question!: string;
}

/** POST /agent { question } -> { answer, steps, trace } (Stage 6f) */
@Public()
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post()
  async ask(@Body() dto: AgentDto) {
    return this.agent.run(dto.question);
  }
}
