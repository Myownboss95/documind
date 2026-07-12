import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // @Public() -> the global JwtAuthGuard skips this. A liveness/root route must be
  // reachable without a token. (Real apps also mark /health @Public().)
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
