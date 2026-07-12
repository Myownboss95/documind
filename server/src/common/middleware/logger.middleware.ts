import { performance } from 'node:perf_hooks';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * LOGGER MIDDLEWARE  (Stage 1 · ② — runs AFTER request-id)
 * --------------------------------------------------------
 * Logs each request on the way IN and, via res.on('finish'), on the way OUT with
 * the final status + duration. WHY the 'finish' event? The status code and
 * duration aren't known until the response is fully sent — you can't log them by
 * just writing a line after next() (next() returns while async work is pending).
 * 'finish' fires exactly once, at the true end. This is how morgan/pino-http work.
 *
 * We use Nest's built-in Logger so output matches Nest's own formatting. 'HTTP'
 * is the context tag you'll see in the log line.
 *
 * performance.now() (monotonic) not Date.now(): the wall clock can jump (NTP/DST)
 * and produce negative/garbage durations. Always use the monotonic clock to time.
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    req.startTime = performance.now();
    this.logger.log(`--> ${req.method} ${req.originalUrl} [${req.id}]`);

    res.on('finish', () => {
      const ms = Math.round(performance.now() - req.startTime);
      this.logger.log(`<-- ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms [${req.id}]`);
    });

    next();
  }
}
