import { ApiProperty } from '@nestjs/swagger';

/**
 * Hinh dang an toan cua mot tai khoan cho trang quan tri. Danh sach truong la ALLOWLIST: service chi
 * `select` dung cac cot nay, nen passwordHash, authVersion, token hay OTP khong bao gio duoc doc ra,
 * chu khong phai doc ra roi loc bot.
 */
export class AdminUserResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({
    example: 'ACTIVE',
    description: 'user_status: PENDING_VERIFICATION, ACTIVE, LOCKED, DISABLED',
  })
  status!: string;
  @ApiProperty({ type: [String], example: ['CUSTOMER'], description: 'Ma vai, xep theo abc' })
  roles!: string[];
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  emailVerifiedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminUserListResponse {
  @ApiProperty({ type: [AdminUserResponse] }) items!: AdminUserResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}
