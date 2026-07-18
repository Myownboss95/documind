import { useRef, useState, type FormEvent } from 'react';
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
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const doc = await api.uploadDocument(token, file, title);
      onCreated(doc);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>New document</h2>
      <form onSubmit={handleSubmit}>
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
        <button type="submit" disabled={loading || !title.trim()}>
          {loading ? 'Creating…' : 'Create & ingest'}
        </button>
      </form>

      <div className="or-divider">
        <span>or</span>
      </div>

      <form onSubmit={handleUpload}>
        <label>Upload a file</label>
        <label className="file-drop">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span className="file-drop-cta">Choose file</span>
          <span className="file-drop-name">
            {file ? file.name : 'No file selected'}
          </span>
        </label>
        <p className="small muted file-hint">PDF, Word, TXT or MD · 10MB max</p>
        <button type="submit" disabled={loading || !file}>
          {loading ? 'Uploading…' : 'Upload & ingest'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
