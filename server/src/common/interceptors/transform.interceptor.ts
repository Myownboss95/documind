import { performance } from 'node:perf_hooks';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { Request } from 'express';

/**
 * TRANSFORM (RESPONSE ENVELOPE) INTERCEPTOR  (Stage 1 · ⑤)
 * -------------------------------------------------------
 * An interceptor WRAPS the handler. Code before `next.handle()` runs BEFORE the
 * handler; `.pipe(map(...))` runs AFTER it, transforming the result. That
 * before/after wrap is why interceptors are perfect for timing + response shaping.
 *
 * LARAVEL EQUIVALENTS (this does both at once):
 *   // "after" middleware:  $start = microtime(true);  then  $res = $next($request);
 *   //   then use $start to add a duration header before returning $res.
 *   // API Resource envelope:  return DocumentResource::collection($x)->additional(['meta'=>...]);
 *
 * We give EVERY successful response one consistent shape:
 *   { data: <handler result>, meta: { requestId, durationMs, timestamp } }
 * A consistent envelope means the frontend (Stage 5) parses one shape everywhere,
 * and every response carries its requestId for support/debugging.
 *
 * NOTE: interceptors only wrap SUCCESSFUL responses. If the handler throws, the
 * error skips the map() and goes to the exception filter (⑥) — which is why we
 * standardize the ERROR shape there, not here.
 *
 * RxJS in one line: next.handle() returns the handler's result as an Observable;
 * map() transforms the emitted value. (Laravel returns the value directly; Nest
 * models it as a stream so it can also support things like SSE/streaming later.)
 */
export interface ApiResponse<T> {
  data: T;
  meta: { requestId: string; durationMs: number; timestamp: string };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const req = context.switchToHttp().getRequest<Request>();
    const start = performance.now(); // BEFORE the handler runs

    return next.handle().pipe(
      // AFTER the handler produces its value:
      map((data) => ({
        data,
        meta: {
          requestId: req.id,
          durationMs: Math.round(performance.now() - start),
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}
