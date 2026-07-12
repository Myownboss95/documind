import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { REFRESH_COOKIE } from '../auth.cookies';

/**
 * @RefreshToken()  (Stage 2 · ④)
 * ------------------------------
 * Pulls the refresh token from the httpOnly COOKIE first (web app), falling back
 * to the request BODY (mobile / non-browser API clients that can't use cookies).
 * One decorator serves both client types. Returns undefined if neither is present
 * (the handler then rejects with 401).
 *
 * req.cookies is populated by cookie-parser (wired in main.ts).
 */
export const RefreshToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    return fromCookie ?? fromBody;
  },
);
