/** Queue names for the DocuMind ingestion pipeline (Stage 4). */
export const INGEST_QUEUE = 'ingest';
export const INGEST_DLQ = 'ingest-dlq'; // dead-letter: jobs that exhausted retries
export const DOCS_CACHE_KEY = 'documents:all';
