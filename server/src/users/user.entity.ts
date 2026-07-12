import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * USER ENTITY  (Stage 3 · TypeORM)
 * --------------------------------
 * PRISMA EQUIVALENT (schema.prisma):
 *   model User {
 *     id                 String  @id @default(uuid())
 *     email              String  @unique
 *     passwordHash       String  @map("password_hash")
 *     displayName        String  @map("display_name")
 *     hashedRefreshToken String? @map("hashed_refresh_token")
 *     @@map("users")
 *   }
 */
@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // unique: true -> a UNIQUE index on email (no duplicate accounts + fast lookup).
  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ name: 'display_name' })
  displayName!: string;

  // nullable: true -> the column allows NULL (no active refresh token / logged out).
  @Column({ name: 'hashed_refresh_token', type: 'varchar', nullable: true })
  hashedRefreshToken!: string | null;
}
