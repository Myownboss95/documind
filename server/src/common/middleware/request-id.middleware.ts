import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * REQUEST-ID MIDDLEWARE  (Stage 1 · ② — runs FIRST)
 * -------------------------------------------------
 * A Nest middleware is just a class with a use(req, res, next) method — the exact
 * Express middleware signature, wrapped so Nest can inject it. @Injectable() lets
 * it participate in DI (it could ask for a config service, etc.).
 *
 * It assigns a correlation id to every request. MUST run before the logger, since
 * the logger prints req.id. PRODUCTION TOUCH: reuse an upstream X-Request-Id if
 * present, so one request keeps ONE id across service hops (distributed tracing).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    req.id = incoming && incoming.trim() !== '' ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next(); // forgetting next() hangs the request — same rule as raw Express
  }
}
