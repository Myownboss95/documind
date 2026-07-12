import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JWT AUTH GUARD  (Stage 2 · ② — registered GLOBALLY)
 * ---------------------------------------------------
 * Extends Passport's AuthGuard('jwt'), which runs the JwtStrategy (extract token
 * -> verify signature/expiry -> attach req.user, or 401). We add ONE thing: check
 * the @Public() metadata first and skip auth for public routes.
 *
 * Registered via APP_GUARD so it protects EVERY route by default ("secure by
 * default"). New routes are automatically protected — the safe default, and the
 * opposite of the Stage 1 planted bug where a route was accidentally left open.
 *
 * Reflector reads decorator metadata. getAllAndOverride checks the handler first,
 * then the controller — so @Public() works at either level.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true; // skip auth for @Public() routes (login, health)
    }
    return super.canActivate(context); // otherwise run the normal JWT check
  }
}
