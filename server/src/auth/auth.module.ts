import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersModule } from '../users/users.module';

/**
 * AUTH MODULE  (Stage 2 · ② — Passport, global guard)
 * ---------------------------------------------------
 * imports:
 *  - UsersModule  -> UsersService (exported by UsersModule)
 *  - PassportModule -> Passport infrastructure
 *  - JwtModule.register({}) -> JwtService (secret/expiry supplied per-token in AuthService)
 *
 * providers:
 *  - AuthService, JwtStrategy (registers the 'jwt' strategy)
 *  - { provide: APP_GUARD, useClass: JwtAuthGuard } -> makes the JWT guard GLOBAL
 *    via DI (so it can inject Reflector for the @Public() check). Every route is
 *    now protected unless marked @Public().
 */
@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
