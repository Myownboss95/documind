'use client';

import { useState } from 'react';
import { PUBLIC_API_URL } from '../lib/api';

/**
 * STREAMING CHAT (Stage 5) — a client component consuming the API's SSE endpoint
 * via the browser's EventSource. Tokens render progressively as they arrive — the
 * same pattern you use for streaming LLM output (low time-to-first-token). SSE is
 * one-way server→client, which is all a token stream needs (vs a WebSocket).
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
    <main>
      <h1>Streaming chat</h1>
      <p>
        <b>Client component</b> streaming tokens over <b>SSE</b> (EventSource) — they appear as
        they’re generated.
      </p>
      <input value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '70%' }} />
      <button onClick={run} disabled={streaming}>
        {streaming ? 'streaming…' : 'Stream'}
      </button>
      <pre className="card">{out || '(tokens will appear here)'}</pre>
      <p>
        <a href="/">← home</a>
      </p>
    </main>
  );
}
