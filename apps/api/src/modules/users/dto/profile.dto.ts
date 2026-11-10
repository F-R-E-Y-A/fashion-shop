import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidateIf } from 'class-validator';

import { IsPersonName, IsPhoneNumber, PERSON_NAME_MAX } from './contact-fields.js';

/** Chi co mat khi client gui; gui `null` thi van bi kiem (va bi tu choi), khac voi @IsOptional. */
const whenPresent = ValidateIf((_object: unknown, value: unknown) => value !== undefined);

/**
 * PATCH /api/users/me: chi sua ho ten va so dien thoai. Vang mat la giu nguyen; `null` bi tu choi (400),
 * chua ho tro xoa (ADR-023). Truong la (email, status, roles, avatarUrl...) bi ValidationPipe tra 400.
 */
export class UpdateProfileRequest {
  @ApiPropertyOptional({ example: 'Nguyễn Văn An', maxLength: PERSON_NAME_MAX })
  @whenPresent
  @IsPersonName('fullName')
  fullName?: string;

  @ApiPropertyOptional({ example: '0901234567', pattern: '^0\\d{9}$' })
  @whenPresent
  @IsPhoneNumber('phone')
  phone?: string;
}

/** Ho so an toan cua chinh nguoi dang dang nhap. Khong co passwordHash, authVersion, status, roles. */
export class ProfileResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ type: String, nullable: true }) fullName!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
}
