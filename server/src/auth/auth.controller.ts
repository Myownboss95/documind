import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { RefreshToken } from './decorators/refresh-token.decorator';
import { setRefreshCookie, clearRefreshCookie } from './auth.cookies';
import type { AuthedUser } from './auth.types';

/**
 * AUTH CONTROLLER  (Stage 2 · ④ — cookie-based refresh)
 * -----------------------------------------------------
 * The REFRESH token now travels in an httpOnly cookie (out of reach of JS/XSS).
 * The ACCESS token is returned in the body for the client to keep in memory.
 *
 * @Res({ passthrough: true }): gives us the Express Response so we can set/clear
 * cookies, BUT passthrough:true means Nest STILL handles our returned value (so
 * the { data, meta } interceptor envelope keeps working). Without passthrough you
 * take over the response entirely and must res.json() yourself — a common gotcha.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto.email, dto.password);
    setRefreshCookie(res, tokens.refreshToken); // refresh -> httpOnly cookie
    return { accessToken: tokens.accessToken }; // access -> body (memory on client)
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @RefreshToken() token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!token) {
      throw new UnauthorizedException('no refresh token');
    }
    const tokens = await this.authService.refresh(token); // rotates + reuse-detects
    setRefreshCookie(res, tokens.refreshToken); // set the NEW rotated token
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthedUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.userId); // revoke server-side (clear stored hash)
    clearRefreshCookie(res); // and remove the cookie from the browser
  }

  @Get('me')
  me(@CurrentUser() user: AuthedUser) {
    return user;
  }
}
