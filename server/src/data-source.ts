import 'dotenv/config';
import { DataSource } from 'typeorm';
import { DocumentEntity } from './documents/document.entity';
import { ChunkEntity } from './documents/chunk.entity';
import { UserEntity } from './users/user.entity';

/**
 * TYPEORM CLI DATASOURCE  (Stage 3 · migrations)
 * ----------------------------------------------
 * The TypeORM CLI (migration:generate / migration:run / migration:revert) needs a
 * DataSource to know how to connect + where entities and migrations live. This is
 * SEPARATE from the Nest runtime connection (app.module's forRootAsync) — the CLI
 * runs outside Nest, so it loads .env itself via `import 'dotenv/config'`.
 *
 * synchronize is FALSE here (and now also in app.module): from now on, schema
 * changes go through migration files, not auto-sync. That's the production rule.
 *
 * (Laravel parallel: config/database.php connection the artisan migrate CLI uses.)
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD || undefined,
  database: process.env.DATABASE_NAME,
  entities: [DocumentEntity, ChunkEntity, UserEntity],
  migrations: ['src/migrations/*.ts'], // where generated migration files go
  synchronize: false,
});
