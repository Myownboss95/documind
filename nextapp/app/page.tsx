import { API_URL } from './lib/api';
import AskForm from './components/AskForm';

/**
 * SERVER COMPONENT (Stage 5) — runs only on the server: fetches data directly,
 * ships zero JS for itself. force-dynamic = render at request time (build needs no
 * live API). Interactive bits go to the client component <AskForm/>.
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
    return [];
  }
}

export default async function Home() {
  const results = await getSample();

  return (
    <>
      <span className="eyebrow">Server component</span>
      <h1>Chat with your documents</h1>
      <p className="lead">
        A RAG knowledge base on the Next.js App Router — the same backend as the React SPA.
        The results below were fetched <b>on the server</b> at request time.
      </p>

      <h2>Sample retrieval</h2>
      {results.length === 0 ? (
        <div className="card stream-empty">
          No results yet — start the API and add a document to build the corpus.
        </div>
      ) : (
        results.map((r, i) => (
          <div key={i} className="card hit">
            <span className="score">{r.score.toFixed(3)}</span>
            <span>{r.content.slice(0, 150)}…</span>
          </div>
        ))
      )}

      <span className="eyebrow">Server action</span>
      <h2>Ask your documents</h2>
      <AskForm />
    </>
  );
}
