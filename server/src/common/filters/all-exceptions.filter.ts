import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * GLOBAL EXCEPTION FILTER  (Stage 1 · ⑥)
 * --------------------------------------
 * @Catch() with NO arguments = catch EVERYTHING that bubbles up (HttpExceptions
 * you threw, plus unexpected runtime errors). This is Laravel's
 * App\Exceptions\Handler::render(): the single place that turns any error into an
 * HTTP response.
 *
 * It does three production-critical things:
 *  1. CONSISTENT SHAPE — every error looks the same: { error: { statusCode,
 *     message, requestId, timestamp, path } }. The frontend parses one error
 *     shape everywhere. (This is what fixes the previously un-enveloped 404.)
 *  2. NO LEAKS — for unexpected (5xx) errors we return a GENERIC message; the real
 *     error + stack is only LOGGED server-side. Leaking stack traces is an
 *     info-disclosure vulnerability.
 *  3. CORRELATABLE LOGS — every error is logged WITH req.id, so you paste that id
 *     into Datadog and find the exact failure. 5xx logged at error (with stack);
 *     4xx logged at warn (it's the client's fault, less alarming, less noisy).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    // ArgumentsHost is like ExecutionContext — a transport-agnostic wrapper.
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Extract a client-safe message.
    let message: string | string[];
    if (isHttp) {
      // HttpException.getResponse() is a string OR an object like
      // { message, error, statusCode } (validation errors put an array in message).
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
    } else {
      // Unexpected error -> NEVER leak its message to the client.
      message = 'internal server error';
    }

    // Log with the correlation id. Different severity for server vs client faults.
    const line = `${req.method} ${req.originalUrl} ${status} [${req.id}]`;
    if (status >= 500) {
      this.logger.error(line, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(`${line} ${Array.isArray(message) ? message.join('; ') : message}`);
    }

    res.status(status).json({
      error: {
        statusCode: status,
        message,
        requestId: req.id,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      },
    });
  }
}
