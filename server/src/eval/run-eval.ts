import 'dotenv/config';
import AppDataSource from '../data-source';
import { DocumentEntity } from '../documents/document.entity';
import { ChunkEntity } from '../documents/chunk.entity';
import { ChunkingService } from '../documents/chunking.service';
import { LocalEmbeddingProvider, toVectorLiteral } from '../llm/embeddings/embedding.provider';
import { RetrievalService } from '../rag/retrieval.service';
import { CORPUS, GOLDEN } from './golden';

/** Cosine similarity of two L2-normalized vectors == their dot product. */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const chunker = new ChunkingService();
  const embedder = new LocalEmbeddingProvider();
  const retrieval = new RetrievalService(AppDataSource, embedder);
  const docRepo = AppDataSource.getRepository(DocumentEntity);
  const chunkRepo = AppDataSource.getRepository(ChunkEntity);

  // --- seed the fixed corpus (chunk + embed each doc) ---
  await AppDataSource.query('DELETE FROM chunks');
  await AppDataSource.query('DELETE FROM documents');
  const idMap = new Map<string, string>();
  for (const d of CORPUS) {
    const doc = await docRepo.save(
      docRepo.create({
        title: d.title,
        sourceUri: `s3://eval/${d.id}`,
        mimeType: 'text/plain',
        content: d.content,
        status: 'ready',
      }),
    );
    idMap.set(d.id, doc.id);
    for (const [i, piece] of chunker.fixedSize(d.content, 300, 50).entries()) {
      const c = await chunkRepo.save(chunkRepo.create({ index: i, content: piece, documentId: doc.id }));
      await AppDataSource.query(`UPDATE chunks SET embedding = $1::vector WHERE id = $2`, [
        toVectorLiteral(await embedder.embed(piece)),
        c.id,
      ]);
    }
  }

  // --- score the golden set ---
  let hit = 0;
  let phrase = 0;
  let simSum = 0;
  const rows: Array<Record<string, string>> = [];
  for (const g of GOLDEN) {
    const results = await retrieval.hybridSearch(g.q, 3);
    const isHit = results.some((r) => r.documentId === idMap.get(g.expectDoc));
    const phraseFound = results.some((r) => r.content.toLowerCase().includes(g.expect.toLowerCase()));
    const top = results[0]?.content ?? '';
    const sim = cosine(await embedder.embed(g.expect), await embedder.embed(top));
    if (isHit) hit++;
    if (phraseFound) phrase++;
    simSum += sim;
    rows.push({ q: g.q.slice(0, 42), hit: isHit ? 'PASS' : 'FAIL', phrase: phraseFound ? 'y' : 'n', sim: sim.toFixed(2) });
  }
  // eslint-disable-next-line no-console
  console.table(rows);
  const n = GOLDEN.length;
  console.log(`\nRetrieval hit@3        : ${hit}/${n}  (${((100 * hit) / n).toFixed(0)}%)`);
  console.log(`Key-phrase in top-3     : ${phrase}/${n}  (${((100 * phrase) / n).toFixed(0)}%)`);
  console.log(`Avg embedding sim (local): ${(simSum / n).toFixed(3)}`);
  console.log(
    `\nScorers: (1) retrieval hit@k, (2) key-phrase presence [exact-match-ish],\n` +
      `(3) embedding cosine similarity. LIVE MODE adds LLM-as-judge (ask the model to\n` +
      `grade the generated answer vs the golden answer 0–5). Extend to catch regressions\n` +
      `by adding hard negatives + CI thresholds that FAIL the build when a score drops.`,
  );
  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
