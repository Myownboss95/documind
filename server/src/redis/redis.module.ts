import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';
import { CacheService } from './cache.service';

/**
 * REDIS MODULE  (Stage 4) — @Global so any module can inject CacheService/queues.
 * ----------------------------------------------------------------------------
 * - BullModule.forRootAsync sets the DEFAULT queue connection (Redis). Any
 *   registerQueue() elsewhere reuses it.
 * - REDIS provides a raw ioredis client for the cache (separate connection).
 * maxRetriesPerRequest: null is required by BullMQ-style blocking clients.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        connection: {
          host: c.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(c.get('REDIS_PORT') ?? 6379),
        },
      }),
    }),
  ],
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        new Redis({
          host: c.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(c.get('REDIS_PORT') ?? 6379),
          maxRetriesPerRequest: null,
        }),
    },
    CacheService,
  ],
  exports: [REDIS, CacheService, BullModule],
})
export class RedisModule {}
