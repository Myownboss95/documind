import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { getSocket } from './socket';
import type { DocumentDto, DocumentStatusEvent } from './types';
import { Login } from './components/Login';
import { CreateDocument } from './components/CreateDocument';
import { DocumentList } from './components/DocumentList';

/**
 * APP  (Stage 5 · React SPA)
 * --------------------------
 * Owns the two pieces of top-level state:
 *  - accessToken: kept IN MEMORY (React state), never localStorage. It's short-lived;
 *    the long-lived refresh token lives in an httpOnly cookie the JS can't read (XSS
 *    hardening). A refresh page = logged out here, which is the honest tradeoff for
 *    the demo (a real app would silently call /auth/refresh on load).
 *  - documents: the list, patched LIVE by socket.io 'document.status' events so a
 *    row flips pending -> ingesting -> ready without a manual refetch.
 */
export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const refreshList = useCallback(async (accessToken: string) => {
    setLoadingList(true);
    setListError(null);
    try {
      setDocuments(await api.listDocuments(accessToken));
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to load documents');
    } finally {
      setLoadingList(false);
    }
  }, []);

  // On login: fetch the list once, then open the socket and patch rows live.
  useEffect(() => {
    if (!token) return;
    void refreshList(token);

    const socket = getSocket();
    socket.connect();
    const onStatus = (evt: DocumentStatusEvent) => {
      setDocuments((prev) =>
        prev.map((d) => (d.id === evt.documentId ? { ...d, status: evt.status } : d)),
      );
    };
    socket.on('document.status', onStatus);

    return () => {
      socket.off('document.status', onStatus);
      socket.disconnect();
    };
  }, [token, refreshList]);

  if (!token) {
    return <Login onLoggedIn={setToken} />;
  }

  return (
    <main className="app">
      <header className="topbar">
        <h1>DocuMind</h1>
        <button className="link" onClick={() => setToken(null)}>
          Log out
        </button>
      </header>

      <section className="grid">
        <CreateDocument
          token={token}
          onCreated={(doc) => setDocuments((prev) => [doc, ...prev])}
        />
        <DocumentList
          documents={documents}
          loading={loadingList}
          error={listError}
          onRefresh={() => void refreshList(token)}
        />
      </section>
    </main>
  );
}
