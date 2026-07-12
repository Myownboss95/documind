import * as bcrypt from 'bcryptjs';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * USERS SERVICE  (Stage 3 · Postgres-backed)
 * ------------------------------------------
 * Repository-backed now. All lookups are async (hit the DB) and return
 * `UserEntity | null` (TypeORM returns null, not undefined, when not found).
 *
 * OnModuleInit: Nest calls onModuleInit() once after the module is set up. We use
 * it to SEED the demo user if the users table is empty, so login works on a fresh
 * DB. (This is a teaching convenience — real apps seed via a dedicated seeder /
 * migration, not on boot. Laravel: database seeders + `artisan db:seed`.)
 */
@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.users.findOne({ where: { email: 'ada@example.com' } });
    if (!existing) {
      await this.users.save(
        this.users.create({
          email: 'ada@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          displayName: 'Ada Lovelace',
          hashedRefreshToken: null,
        }),
      );
    }
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { email } });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }

  /** UPDATE users SET hashed_refresh_token = ? WHERE id = ? (rotation/revoke). */
  async setRefreshTokenHash(userId: string, hash: string | null): Promise<void> {
    await this.users.update({ id: userId }, { hashedRefreshToken: hash });
  }
}
