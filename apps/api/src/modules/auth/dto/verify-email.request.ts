import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches } from 'class-validator';

import { normalizeEmail } from '../email.js';
import { OTP_CODE_DIGITS } from '../otp-policy.js';

export class VerifyEmailRequest {
  @ApiProperty({ example: 'khach@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'Email khong hop le' })
  email!: string;

  @ApiProperty({ example: '000000' })
  @IsString({ message: 'Ma xac thuc phai la chuoi' })
  @Matches(new RegExp(`^\\d{${OTP_CODE_DIGITS}}$`), {
    message: `Ma xac thuc phai gom dung ${OTP_CODE_DIGITS} chu so`,
  })
  code!: string;
}
