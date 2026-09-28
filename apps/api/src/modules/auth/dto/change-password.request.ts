import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

import { IsStrongPassword } from '../password-policy.js';

export class ChangePasswordRequest {
  @ApiProperty({ format: 'password' })
  @IsString({ message: 'Mat khau hien tai phai la chuoi' })
  @MinLength(1, { message: 'Mat khau hien tai khong duoc de trong' })
  currentPassword!: string;

  @ApiProperty({ example: 'NewPassword123', format: 'password' })
  @IsStrongPassword()
  newPassword!: string;
}
