/**
 * EXPRESS REQUEST TYPE AUGMENTATION  (Stage 1 · ② middleware)
 * ----------------------------------------------------------
 * Nest runs on Express, so the underlying req/res are Express objects. Our
 * middleware attaches `id` and `startTime` to req; rather than casting
 * `(req as any).id` everywhere (unsafe, hides typos), we extend Express's Request
 * type ONCE here. Now req.id / req.startTime are strongly typed app-wide.
 *
 * Only NON-SENSITIVE request metadata goes on req — an id and a timestamp. Never
 * secrets/tokens: req is shared and frequently logged, so anything on it can leak.
 */
export {};

declare global {
  namespace Express {
    interface Request {
      /** Correlation id for this request; echoed in the X-Request-Id header. */
      id: string;
      /** High-resolution start time (performance.now()) for duration logging. */
      startTime: number;
    }
  }
}
