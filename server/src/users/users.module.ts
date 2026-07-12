import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserEntity } from './user.entity';

/**
 * USERS MODULE  (Stage 2)
 * -----------------------
 * MODULE ENCAPSULATION (an important Nest idea): a provider is PRIVATE to its
 * module unless you `exports` it. We export UsersService so AuthModule can inject
 * it. If we didn't export it, AuthModule importing UsersModule still couldn't see
 * UsersService — a common "Nest can't resolve dependency" gotcha.
 * (Laravel's container is global by default; Nest scopes providers per-module.)
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
