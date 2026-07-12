import type { DocumentDto, DocumentStatus } from '../types';

const STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: 'Pending',
  ingesting: 'Ingesting…',
  ready: 'Ready',
  failed: 'Failed',
};

/**
 * DOCUMENT LIST — GET /documents once, then rows update LIVE from socket events
 * (see App). The status pill reflects the current ingest state without a refetch.
 */
export function DocumentList({
  documents,
  loading,
  error,
  onRefresh,
}: {
  documents: DocumentDto[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <section className="card">
      <div className="row between">
        <h2>Documents</h2>
        <button className="link" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {!error && documents.length === 0 && !loading && (
        <p className="muted">No documents yet — create one to see live ingestion.</p>
      )}

      <ul className="list">
        {documents.map((doc) => (
          <li key={doc.id} className="doc">
            <div>
              <strong>{doc.title}</strong>
              <div className="muted small">{doc.mimeType}</div>
            </div>
            <span className={`pill pill-${doc.status}`}>{STATUS_LABEL[doc.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
