'use client';

import { useState } from 'react';
import { askRag, type RagResult } from '../actions';

/**
 * CLIENT COMPONENT (Stage 5) — 'use client' opts into browser interactivity
 * (useState, onClick). It calls the SERVER ACTION `askRag` directly — no fetch,
 * no API route on the client side. Next handles the RPC.
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
      <input value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '70%' }} />
      <button disabled={loading || !q}>{loading ? '…' : 'Ask'}</button>
      {ans && (
        <div className="card">
          <b>Answer:</b> {ans.answer}
          <br />
          <small>
            {ans.citations.length} citations · provider: {ans.provider}
          </small>
        </div>
      )}
    </form>
  );
}
