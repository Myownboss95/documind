import type {
  ApiEnvelope,
  CreateDocumentInput,
  DocumentDto,
  LoginResponse,
} from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/** Thrown for any non-2xx response so callers can show a clean error message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Typed fetch wrapper. Unwraps the server's { data, meta } envelope and returns
 * just `data`, typed as T. Adds the Bearer access token when provided.
 * credentials:'include' lets the httpOnly refresh cookie flow (login/refresh).
 */
async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const err = (await res.json()) as { message?: string; error?: string };
      msg = err.message ?? err.error ?? msg;
    } catch {
      /* non-JSON error body — keep the default message */
    }
    throw new ApiError(msg, res.status);
  }

  const json = (await res.json()) as ApiEnvelope<T>;
  return json.data;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  listDocuments: (token: string) =>
    request<DocumentDto[]>('/documents', { token }),

  createDocument: (token: string, input: CreateDocumentInput) =>
    request<DocumentDto>('/documents', {
      method: 'POST',
      token,
      body: input,
    }),

  /**
   * Uploads a file as multipart/form-data. Unlike request(), we must NOT set a
   * Content-Type header — the browser adds it with the multipart boundary.
   */
  uploadDocument: async (
    token: string,
    file: File,
    title?: string,
  ): Promise<DocumentDto> => {
    const form = new FormData();
    form.append('file', file);
    if (title && title.trim()) form.append('title', title);

    const res = await fetch(`${API_URL}/documents/upload`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const err = (await res.json()) as { message?: string; error?: string };
        msg = err.message ?? err.error ?? msg;
      } catch {
        /* non-JSON error body — keep the default message */
      }
      throw new ApiError(msg, res.status);
    }

    const json = (await res.json()) as ApiEnvelope<DocumentDto>;
    return json.data;
  },
};
