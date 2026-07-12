import { SetMetadata } from '@nestjs/common';

/**
 * @Public()  (Stage 2 · ②)
 * ------------------------
 * Tags a route (or controller) with metadata { isPublic: true }. The global
 * JwtAuthGuard reads this tag and SKIPS auth for that route. This is the opt-out
 * that makes "global guard" practical — login/health must be reachable WITHOUT a
 * token. (Laravel: excluding a route from the auth middleware, or ->withoutMiddleware.)
 *
 * A decorator here just ATTACHES metadata; the guard is what acts on it.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
