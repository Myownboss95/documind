'use client';

import { useState } from 'react';
import { PUBLIC_API_URL } from '../lib/api';

/**
 * STREAMING CHAT (Stage 5) — a client component consuming the API's SSE endpoint via
 * the browser's EventSource. Tokens render progressively as they arrive (low
 * time-to-first-token) — the same pattern for streaming LLM output.
 */
export default function ChatPage() {
  const [q, setQ] = useState('Explain vector similarity search');
  const [out, setOut] = useState('');
  const [streaming, setStreaming] = useState(false);

  function run() {
    setOut('');
    setStreaming(true);
    const es = new EventSource(`${PUBLIC_API_URL}/llm/stream?q=${encodeURIComponent(q)}`);
    es.onmessage = (e) => {
      let chunk = e.data;
      try {
        chunk = (JSON.parse(e.data) as { data?: string }).data ?? e.data;
      } catch {
        /* raw */
      }
      if (chunk.includes('[DONE]')) {
        es.close();
        setStreaming(false);
        return;
      }
      setOut((o) => o + chunk);
    };
    es.onerror = () => {
      es.close();
      setStreaming(false);
    };
  }

  return (
    <>
      <span className="eyebrow">Client component · SSE</span>
      <h1>Streaming chat</h1>
      <p className="lead">
        Tokens stream over <b>Server-Sent Events</b> and render as they’re generated —
        one-way server→client, all a token stream needs.
      </p>
      <div className="field">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask something…" />
        <button onClick={run} disabled={streaming}>
          {streaming ? 'Streaming…' : 'Stream'}
        </button>
      </div>
      <div className="card">
        <pre className={out ? undefined : 'stream-empty'}>{out || 'Tokens will appear here…'}</pre>
      </div>
    </>
  );
}
