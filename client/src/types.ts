// Shared types mirroring the Nest API contracts.

export type DocumentStatus = 'pending' | 'ingesting' | 'ready' | 'failed';

export interface DocumentDto {
  id: string;
  title: string;
  sourceUri: string;
  mimeType: string;
  content: string | null;
  status: DocumentStatus;
  createdAt: string;
}

// Body for POST /documents. The server also requires sourceUri + mimeType; the
// create form fills sensible defaults so the user only types a title + body.
export interface CreateDocumentInput {
  title: string;
  content: string;
  sourceUri: string;
  mimeType: string;
}

// Every successful API response is wrapped by the server's TransformInterceptor.
export interface ApiEnvelope<T> {
  data: T;
  meta: { requestId: string; durationMs: number; timestamp: string };
}

export interface LoginResponse {
  accessToken: string;
}

// Payload broadcast on the socket.io 'document.status' channel.
export interface DocumentStatusEvent {
  documentId: string;
  status: DocumentStatus;
}
