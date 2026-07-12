'use server';

import { API_URL } from './lib/api';

/**
 * SERVER ACTION (Stage 5)
 * -----------------------
 * 'use server' marks this as a server action: the client component calls it like a
 * function, but it EXECUTES ON THE SERVER (RPC-style, no manual fetch/route needed).
 * The API base + any secrets stay server-side. This is the modern alternative to a
 * client-side fetch to an API route handler.
 */
export interface RagResult {
  answer: string;
  citations: Array<{ marker: number; documentId: string; snippet: string }>;
  provider: string;
}

export async function askRag(query: string): Promise<RagResult> {
  const res = await fetch(`${API_URL}/rag/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, k: 3 }),
    cache: 'no-store',
  });
  if (!res.ok) {
    return { answer: `Error ${res.status} — is the API running?`, citations: [], provider: 'none' };
  }
  const json = (await res.json()) as { data: RagResult };
  return json.data;
}
