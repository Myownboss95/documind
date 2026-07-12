import { API_URL } from './lib/api';
import AskForm from './components/AskForm';

/**
 * SERVER COMPONENT (Stage 5) — the default in the App Router. It runs ONLY on the
 * server: it can fetch data directly (below), keep secrets, and ships zero JS for
 * itself. force-dynamic = render at request time (so the build doesn't need a live
 * API). Interactive bits are delegated to the client component <AskForm/>.
 */
export const dynamic = 'force-dynamic';

interface SearchHit {
  content: string;
  score: number;
}

async function getSample(): Promise<SearchHit[]> {
  try {
    const res = await fetch(`${API_URL}/rag/search?q=retrieval&mode=hybrid&k=3`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: { results: SearchHit[] } };
    return json.data.results;
  } catch {
    return []; // API not running (e.g. at build time) — render gracefully
  }
}

export default async function Home() {
  const results = await getSample(); // <-- server-side fetch, no client JS

  return (
    <main>
      <h1>DocuMind — Next.js App Router</h1>
      <p>
        This page is a <b>server component</b>: the retrieval below was fetched on the server at
        request time (no client-side JS for it).
      </p>

      <h2>Sample retrieval (server-fetched)</h2>
      {results.length === 0 ? (
        <p>
          <i>No results — start the API (`pnpm --filter server start`) and seed some documents.</i>
        </p>
      ) : (
        results.map((r, i) => (
          <div key={i} className="card">
            ({r.score.toFixed(3)}) {r.content.slice(0, 140)}…
          </div>
        ))
      )}

      <h2>Ask your docs (server action)</h2>
      <AskForm />

      <p style={{ marginTop: '1.5rem' }}>
        <a href="/chat">→ Streaming chat (client component + SSE)</a>
      </p>
    </main>
  );
}
