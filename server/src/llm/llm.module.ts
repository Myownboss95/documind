import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmController } from './llm.controller';
import { MockProvider } from './mock.provider';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAIProvider } from './openai.provider';
import { LLM_PROVIDER } from './provider.interface';

/**
 * LLM MODULE  (Stage 6a)
 * ----------------------
 * The factory picks the active provider at boot:
 *   MODE=live AND ANTHROPIC_API_KEY set  -> real AnthropicProvider
 *   otherwise                            -> MockProvider (offline default)
 * Everything downstream (RAG, agent) depends on LLM_PROVIDER, not a concrete class,
 * so the swap is invisible to them. Exported so Stage 6e/6f can inject it.
 */
@Module({
  controllers: [LlmController],
  providers: [
    MockProvider,
    AnthropicProvider,
    OpenAIProvider,
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService, MockProvider, AnthropicProvider, OpenAIProvider],
      useFactory: (
        config: ConfigService,
        mock: MockProvider,
        anthropic: AnthropicProvider,
        openai: OpenAIProvider,
      ) => {
        const live = config.get<string>('MODE') === 'live';
        const which = (config.get<string>('PROVIDER') ?? 'anthropic').toLowerCase();
        if (live && which === 'openai' && process.env.OPENAI_API_KEY) return openai;
        if (live && process.env.ANTHROPIC_API_KEY) return anthropic;
        return mock; // offline default
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
