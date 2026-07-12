import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * LOGIN DTO  (Stage 2 · validated by the global ValidationPipe)
 * ------------------------------------------------------------
 * (Laravel: a LoginRequest with rules ['email'=>'required|email', 'password'=>'required'].)
 */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
