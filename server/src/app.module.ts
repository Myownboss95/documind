import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentsModule } from './documents/documents.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { LlmModule } from './llm/llm.module';
import { EmbeddingModule } from './llm/embeddings/embedding.module';
import { RagModule } from './rag/rag.module';
import { AgentModule } from './agent/agent.module';
import { RealtimeModule } from './realtime/realtime.module';
import { DocumentEntity } from './documents/document.entity';
import { ChunkEntity } from './documents/chunk.entity';
import { UserEntity } from './users/user.entity';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { LoggerMiddleware } from './common/middleware/logger.middleware';

/**
 * ROOT MODULE  (Stage 3 · TypeORM connection)
 * -------------------------------------------
 * ConfigModule.forRoot({ isGlobal: true }) loads .env into a global ConfigService
 * (Laravel: config() + .env). isGlobal means we don't re-import it everywhere.
 *
 * TypeOrmModule.forRootAsync builds the DB connection using ConfigService (async
 * so it can read env first). useFactory returns the connection options.
 *   - synchronize: true  -> TypeORM auto-creates/updates tables from entities.
 *     GREAT for dev, DANGEROUS in prod (it can drop/alter columns and lose data).
 *     Prod uses explicit migrations instead (next: we'll generate one).
 *     (Laravel parallel: synchronize ~ auto-running migrations on boot; you'd
 *      never do that in prod either.)
 *
 * PRISMA EQUIVALENT: there's no forRoot — you'd inject a PrismaService that wraps
 * `new PrismaClient()`, and connection config lives in schema.prisma's datasource
 * block + DATABASE_URL. Migrations via `prisma migrate`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global in-process event bus (Stage 5). Lets the ingest worker emit
    // 'document.status' events that the WebSocket gateway re-broadcasts, keeping
    // the two decoupled (worker knows nothing about sockets).
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST'),
        port: config.get<number>('DATABASE_PORT'),
        username: config.get<string>('DATABASE_USER'),
        password: config.get<string>('DATABASE_PASSWORD') || undefined,
        database: config.get<string>('DATABASE_NAME'),
        entities: [DocumentEntity, ChunkEntity, UserEntity],
        synchronize: false, // OFF — schema now managed by migration files (prod rule)
        migrations: ['dist/migrations/*.js'], // compiled migrations the app can run
        // In containers (Stage 7) set RUN_MIGRATIONS=true to auto-apply pending
        // migrations on boot. Locally we run them manually via `pnpm migration:run`.
        migrationsRun: config.get<string>('RUN_MIGRATIONS') === 'true',
        logging: ['error', 'warn'],
      }),
    }),
    RedisModule,
    EmbeddingModule,
    DocumentsModule,
    AuthModule,
    LlmModule,
    RagModule,
    AgentModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, LoggerMiddleware).forRoutes('*');
  }
}
