'use client';

import { useState } from 'react';
import { askRag, type RagResult } from '../actions';

/**
 * CLIENT COMPONENT (Stage 5) — 'use client' opts into interactivity. It calls the
 * SERVER ACTION `askRag` directly (RPC-style) — no fetch, no client-side API route.
 */
export default function AskForm() {
  const [q, setQ] = useState('How do retried jobs stay safe?');
  const [ans, setAns] = useState<RagResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAns(await askRag(q));
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your docs…" />
        <button disabled={loading || !q}>{loading ? 'Thinking…' : 'Ask'}</button>
      </div>
      {ans && (
        <div className="card answer">
          {ans.answer}
          <div className="meta">
            {ans.citations.length} citation{ans.citations.length === 1 ? '' : 's'} · provider: {ans.provider}
          </div>
        </div>
      )}
    </form>
  );
}
