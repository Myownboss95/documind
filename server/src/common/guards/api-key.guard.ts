import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * API-KEY GUARD  (Stage 1 · ③)
 * ----------------------------
 * A Guard decides "may this request proceed?" It runs AFTER middleware (so req.id
 * already exists) and BEFORE pipes/handler. Return true -> continue; return false
 * -> Nest throws 403; throw -> your chosen status (here 401).
 *
 * LARAVEL EQUIVALENT:
 *   class EnsureApiKey {
 *     public function handle($request, Closure $next) {
 *       if ($request->header('x-api-key') !== config('services.api_key'))
 *         abort(401, 'missing or invalid API key');
 *       return $next($request);
 *     }
 *   }
 *
 * ExecutionContext: a transport-agnostic wrapper around the current request. For
 * HTTP we call switchToHttp().getRequest() to get the Express req. (The same guard
 * could run over WebSockets/gRPC — that abstraction is why it's not just `req`.)
 *
 * PRODUCTION TOUCH — timing-safe comparison: comparing secrets with === leaks
 * information via timing (=== returns faster on an early-mismatched byte). An
 * attacker can exploit that to guess a key byte-by-byte. crypto.timingSafeEqual
 * compares in constant time. Small detail, real vulnerability class.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  // In Stage 2/3 this moves to @nestjs/config; for now, env with a dev default.
  private readonly expectedKey = process.env.API_KEY ?? 'dev-secret-key';

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header('x-api-key') ?? '';

    if (!this.safeEqual(provided, this.expectedKey)) {
      throw new UnauthorizedException('missing or invalid API key');
    }
    return true;
  }

  /** Constant-time string compare. Length is checked first (timingSafeEqual
   *  throws on length mismatch), which is an acceptable, standard trade-off. */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
