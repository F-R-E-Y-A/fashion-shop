import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const UPLOAD_PURPOSES = ['review'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export class CreateUploadTicketRequest {
  @ApiProperty({ enum: UPLOAD_PURPOSES, description: 'Anh dung vao dau; quyet dinh thu muc' })
  @IsIn(UPLOAD_PURPOSES, { message: 'purpose khong hop le' })
  purpose!: UploadPurpose;
}

export class UploadConfigResponse {
  @ApiProperty({ description: 'false: may chu chua cau hinh kho anh, an nut chon anh' })
  enabled!: boolean;
  @ApiProperty({ example: 5242880 }) maxBytes!: number;
  @ApiProperty({ type: [String], example: ['jpg', 'png', 'webp'] }) formats!: string[];
}

export class UploadTicketResponse {
  @ApiProperty({
    description: 'POST multipart toi day, kem `fields` va truong `file`; mot phieu mot anh',
  })
  uploadUrl!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  fields!: Record<string, string>;
  @ApiProperty({ description: 'Khoa (public_id) cua anh; gui lai trong media[].key khi luu' })
  key!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() maxBytes!: number;
  @ApiProperty({ type: [String] }) formats!: string[];
}
