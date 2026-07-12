import 'dotenv/config';
import { DataSource, type Logger as TypeOrmLogger } from 'typeorm';
import { DocumentEntity } from './documents/document.entity';
import { ChunkEntity } from './documents/chunk.entity';
import { UserEntity } from './users/user.entity';

/**
 * N+1 DEMO  (Stage 3)
 * -------------------
 * Seeds 3 documents x 3 chunks, then runs the SAME logical query two ways:
 *   NAIVE  -> load docs, then load each doc's chunks in a loop  => 1 + N queries
 *   FIXED  -> load docs WITH their chunks in one go (join)      => constant queries
 * A counting logger prints each SQL statement so you SEE the N+1.
 */
let tracking = false;
let queryCount = 0;
const countingLogger: TypeOrmLogger = {
  logQuery(query: string) {
    if (!tracking) return;
    queryCount++;
    console.log(`   [q${queryCount}] ${query.replace(/\s+/g, ' ').slice(0, 95)}`);
  },
  logQueryError() {},
  logQuerySlow() {},
  logSchemaBuild() {},
  logMigration() {},
  log() {},
};

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD || undefined,
  database: process.env.DATABASE_NAME,
  entities: [DocumentEntity, ChunkEntity, UserEntity],
  logger: countingLogger,
});

async function main() {
  await ds.initialize();
  const docRepo = ds.getRepository(DocumentEntity);
  const chunkRepo = ds.getRepository(ChunkEntity);

  // --- seed (not tracked) ---
  await ds.query('DELETE FROM chunks');
  await ds.query('DELETE FROM documents');
  for (let d = 1; d <= 3; d++) {
    const doc = await docRepo.save(
      docRepo.create({
        title: `Doc ${d}`,
        sourceUri: `s3://d/${d}.pdf`,
        mimeType: 'application/pdf',
        status: 'ready',
      }),
    );
    for (let c = 0; c < 3; c++) {
      await chunkRepo.save(chunkRepo.create({ index: c, content: `chunk ${c} of doc ${d}`, documentId: doc.id }));
    }
  }

  console.log('\n================ NAIVE (the N+1 bug) ================');
  tracking = true;
  queryCount = 0;
  const docs = await docRepo.find(); // 1 query for the parent list
  for (const doc of docs) {
    // A separate query PER document — this loop is the N+1.
    await chunkRepo.find({ where: { documentId: doc.id } });
  }
  tracking = false;
  console.log(`   => ${queryCount} queries total  (1 docs + ${docs.length} chunk lookups). With 1000 docs this is 1001 round-trips.`);

  console.log('\n================ FIXED (load chunks WITH docs) ================');
  tracking = true;
  queryCount = 0;
  const docsWith = await docRepo.find({ relations: { chunks: true } }); // one join query
  tracking = false;
  const totalChunks = docsWith.reduce((n, d) => n + d.chunks.length, 0);
  console.log(`   => ${queryCount} query total  (loaded ${totalChunks} chunks across ${docsWith.length} docs). Constant, no matter how many docs.`);

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
