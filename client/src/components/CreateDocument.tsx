import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import type { DocumentDto } from '../types';

/**
 * CREATE DOCUMENT FORM — POST /documents with the Bearer token. The server enqueues
 * async ingestion; the new row appears as 'pending' and then flips live via the
 * socket as the worker processes it. sourceUri/mimeType are defaulted so the user
 * only types a title + body. Tip: put FAIL in the title to watch it go 'failed'.
 */
export function CreateDocument({
  token,
  onCreated,
}: {
  token: string;
  onCreated: (doc: DocumentDto) => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const doc = await api.createDocument(token, {
        title,
        content,
        sourceUri: `manual://${Date.now()}`,
        mimeType: 'text/plain',
      });
      onCreated(doc);
      setTitle('');
      setContent('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>New document</h2>
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Onboarding guide"
          required
        />
      </label>
      <label>
        Body content
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste the document text to ingest…"
          rows={6}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={loading || !title.trim()}>
        {loading ? 'Creating…' : 'Create & ingest'}
      </button>
    </form>
  );
}
