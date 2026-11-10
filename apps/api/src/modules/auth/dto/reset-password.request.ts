import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

import { normalizeEmail } from '../email.js';
import { IsOtpCode } from '../otp-policy.js';
import { IsStrongPassword } from '../password-policy.js';

export class ResetPasswordRequest {
  @ApiProperty({ example: 'khach@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'Email khong hop le' })
  email!: string;

  @ApiProperty({ example: '000000' })
  @IsOtpCode()
  code!: string;

  @ApiProperty({ example: 'NewPassword123', format: 'password' })
  @IsStrongPassword()
  newPassword!: string;
}
