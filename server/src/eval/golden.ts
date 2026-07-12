/**
 * GOLDEN SET  (Stage 6h)
 * ----------------------
 * A small fixed corpus + 12 Q/A pairs with the expected source doc and a key
 * phrase the right answer should contain. This is the regression harness: when you
 * change chunking, the embedder, retrieval, or a prompt, re-run and watch the
 * scores — a drop means you broke retrieval before it ships.
 */
export interface CorpusDoc {
  id: string;
  title: string;
  content: string;
}
export interface GoldenQA {
  q: string;
  expectDoc: string; // corpus id the answer should come from
  expect: string; // key phrase a correct answer/chunk should contain
}

export const CORPUS: CorpusDoc[] = [
  {
    id: 'rag',
    title: 'RAG',
    content:
      'Retrieval augmented generation combines a retriever and a generator. The retriever finds relevant chunks using vector similarity search over embeddings. Cosine distance ranks semantic closeness. Reranking re-scores the top candidates for precision. Hybrid retrieval adds keyword search for exact terms.',
  },
  {
    id: 'redis',
    title: 'Redis Queues',
    content:
      'BullMQ is a job queue backed by Redis. Producers add jobs and consumers process them asynchronously. Retries use exponential backoff between attempts. A dead letter queue captures jobs that exhaust their retries. Idempotency keeps retried jobs safe from double effects.',
  },
  {
    id: 'pg',
    title: 'Postgres Indexing',
    content:
      'A B-tree index speeds up equality and range queries. EXPLAIN ANALYZE shows the query plan and timing. Without an index Postgres performs a sequential scan of every row. Composite index column order matters for the leftmost prefix rule.',
  },
  {
    id: 'auth',
    title: 'Auth',
    content:
      'JWT auth uses a short-lived access token and a long-lived refresh token. Refresh rotation issues a new token each use and detects reuse of an old one. Store refresh tokens in an httpOnly cookie to avoid XSS theft. bcrypt hashes passwords with a salt.',
  },
  {
    id: 'nest',
    title: 'NestJS',
    content:
      'A guard decides if a request is allowed. A pipe validates and transforms arguments. An interceptor wraps the handler to shape the response. An exception filter turns errors into responses. Dependency injection provides services via the constructor.',
  },
];

export const GOLDEN: GoldenQA[] = [
  { q: 'How does the queue retry failed jobs?', expectDoc: 'redis', expect: 'exponential backoff' },
  { q: 'What captures jobs that exhaust retries?', expectDoc: 'redis', expect: 'dead letter' },
  { q: 'How do retried jobs avoid double effects?', expectDoc: 'redis', expect: 'idempotency' },
  { q: 'How does semantic search rank results?', expectDoc: 'rag', expect: 'cosine' },
  { q: 'What improves precision after retrieval?', expectDoc: 'rag', expect: 'rerank' },
  { q: 'How do you find exact terms in retrieval?', expectDoc: 'rag', expect: 'keyword' },
  { q: 'What speeds up range queries in Postgres?', expectDoc: 'pg', expect: 'b-tree' },
  { q: 'How do you inspect a query plan?', expectDoc: 'pg', expect: 'explain analyze' },
  { q: 'What happens without an index?', expectDoc: 'pg', expect: 'sequential scan' },
  { q: 'How are refresh tokens protected from XSS?', expectDoc: 'auth', expect: 'httponly cookie' },
  { q: 'How is refresh token theft detected?', expectDoc: 'auth', expect: 'reuse' },
  { q: 'What validates and transforms request arguments in Nest?', expectDoc: 'nest', expect: 'pipe' },
];
