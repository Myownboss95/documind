import { Body, Controller, Inject, type MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { LLM_PROVIDER, type LLMProvider } from './provider.interface';
import { ChatDto } from './dto/chat.dto';
import { Public } from '../auth/decorators/public.decorator';

/**
 * LLM CONTROLLER  (Stage 6a)
 * --------------------------
 * - POST /llm/chat  -> NON-streaming: wait for the whole reply.
 * - GET  /llm/stream?q=...  -> STREAMING via SSE: tokens as they arrive.
 * (Marked @Public for easy offline testing; in prod you'd require a token.)
 */
@Controller('llm')
export class LlmController {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LLMProvider) {}

  @Public()
  @Post('chat')
  async chat(@Body() dto: ChatDto) {
    const reply = await this.llm.generate({
      system: dto.system,
      messages: [{ role: 'user', content: dto.message }],
    });
    return { provider: this.llm.name, reply };
  }

  /**
   * @Sse turns a returned Observable<MessageEvent> into a Server-Sent Events
   * stream. We wrap the provider's async-iterable of text chunks into that
   * Observable — this is the exact pattern for streaming LLM output to a browser
   * (EventSource). Each `data:` frame is one chunk; we end with [DONE].
   */
  @Public()
  @Sse('stream')
  stream(@Query('q') q: string): Observable<MessageEvent> {
    const question = q?.trim() || 'Say hello.';
    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          for await (const chunk of this.llm.stream({
            messages: [{ role: 'user', content: question }],
          })) {
            subscriber.next({ data: chunk });
          }
          subscriber.next({ data: '[DONE]' });
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
        }
      })();
    });
  }
}
