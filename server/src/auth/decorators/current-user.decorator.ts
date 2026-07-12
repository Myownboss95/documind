import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthedUser } from '../auth.types';

/**
 * @CurrentUser()  (Stage 2 · ②)
 * -----------------------------
 * A custom PARAMETER decorator. createParamDecorator lets us pull something out of
 * the request and inject it straight into a handler argument:
 *
 *   me(@CurrentUser() user: AuthedUser) { ... }
 *
 * Passport put the principal on req.user (from JwtStrategy.validate). This just
 * reads it, so controllers never touch the raw request. (Laravel: auth()->user()
 * / the Auth facade, or a route-model-bound user.)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.user as AuthedUser;
  },
);
