import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

import { normalizeEmail } from '../email.js';
import { IsStrongPassword } from '../password-policy.js';

class AuthCredentialsRequest {
  @ApiProperty({ example: 'khach@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'Email khong hop le' })
  email!: string;

  @ApiProperty({ example: 'Password123', format: 'password' })
  @IsString({ message: 'Mat khau phai la chuoi' })
  password!: string;
}

export class RegisterRequest extends AuthCredentialsRequest {
  @IsStrongPassword()
  declare password: string;
}

export class LoginRequest extends AuthCredentialsRequest {
  @MinLength(1, { message: 'Mat khau khong duoc de trong' })
  declare password: string;
}
