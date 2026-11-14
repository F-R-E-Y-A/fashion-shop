import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { normalizeEmail } from '../email.js';
import { IsOtpCode, OTP_CODE_DIGITS } from '../otp-policy.js';
import { IsStrongPassword } from '../password-policy.js';

@ValidatorConstraint({ name: 'resetPasswordProof', async: false })
export class ResetPasswordProofConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = (args.object ?? {}) as Record<string, unknown>;
    const hasToken = typeof obj.resetToken === 'string' && obj.resetToken.trim().length > 0;
    const hasEmail = typeof obj.email === 'string' && obj.email.trim().length > 0;
    const hasCode =
      typeof obj.code === 'string' && new RegExp(`^\\d{${OTP_CODE_DIGITS}}$`).test(obj.code);
    const hasLegacyProof = hasEmail && hasCode;

    return hasToken || hasLegacyProof;
  }

  defaultMessage(): string {
    return 'Yeu cau dat lai mat khau phai cung cap resetToken hoac day du email va code hop le';
  }
}

export class ResetPasswordRequest {
  @ApiPropertyOptional({
    description: 'Reset grant token nhan duoc sau khi verify OTP',
    example: 'd9b1c73a45c3614995f9d85aa990146747ddb8d6e7b1583c7c2b6ab8e3110589',
  })
  @IsOptional()
  @IsString({ message: 'resetToken phai la chuoi ky tu' })
  @IsNotEmpty({ message: 'resetToken khong duoc de trong' })
  resetToken?: string;

  @ApiPropertyOptional({ example: 'khach@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsOptional()
  @IsEmail({}, { message: 'Email khong hop le' })
  email?: string;

  @ApiPropertyOptional({ example: '000000' })
  @IsOptional()
  @IsOtpCode()
  code?: string;

  @ApiProperty({ example: 'NewPassword123', format: 'password' })
  @IsStrongPassword()
  @Validate(ResetPasswordProofConstraint)
  newPassword!: string;
}
