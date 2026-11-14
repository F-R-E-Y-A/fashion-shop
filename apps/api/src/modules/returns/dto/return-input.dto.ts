import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';
import {
  RETURN_DESCRIPTION_MAX,
  RETURN_MEDIA_MAX,
  RETURN_NOTE_MAX,
  RETURN_REASONS,
  type ReturnReasonCode,
} from '../return-policy.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Cung hinh dang khoa anh voi reviews: freya/returns/<userId>/<ten>; thu muc do UploadsService kiem. */
const MEDIA_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,250}$/;

export class ReturnIdParam {
  @IsUUID('all', { message: 'id phai la UUID' })
  id!: string;
}

export class ReturnLineInput {
  @ApiProperty({ format: 'uuid', description: 'Dong don can tra' })
  @IsUUID('all', { message: 'orderItemId phai la UUID' })
  orderItemId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt({ message: 'quantity phai la so nguyen' })
  @Min(1, { message: 'quantity nho nhat la 1' })
  quantity!: number;
}

export class RefundAccountInput {
  @ApiProperty({ example: 'Vietcombank', maxLength: 120 })
  @Transform(trim)
  @IsString({ message: 'bankName phai la chuoi' })
  @IsNotEmpty({ message: 'Nhap ten ngan hang' })
  @MaxLength(120, { message: 'bankName toi da 120 ky tu' })
  bankName!: string;

  @ApiProperty({ example: '0123456789', description: '6-20 chu so' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value))
  @IsString({ message: 'accountNumber phai la chuoi' })
  @Matches(/^\d{6,20}$/, { message: 'So tai khoan gom 6-20 chu so' })
  accountNumber!: string;

  @ApiProperty({ example: 'NGUYEN VAN A', maxLength: 120 })
  @Transform(trim)
  @IsString({ message: 'accountHolder phai la chuoi' })
  @IsNotEmpty({ message: 'Nhap ten chu tai khoan' })
  @MaxLength(120, { message: 'accountHolder toi da 120 ky tu' })
  accountHolder!: string;
}

/**
 * POST /api/orders/:id/returns. Nguoi gui la CurrentUser; don phai cua chinh ho. `refundAccount` chi
 * bat buoc voi don COD; don tra online thi tien ve dung cong va truong nay bi bo qua.
 */
export class CreateReturnRequest {
  @ApiProperty({ type: [ReturnLineInput] })
  @IsArray({ message: 'items phai la mang' })
  @ArrayMinSize(1, { message: 'Chon it nhat mot mon de tra' })
  @ArrayMaxSize(50, { message: 'items toi da 50 dong' })
  @ValidateNested({ each: true })
  @Type(() => ReturnLineInput)
  items!: ReturnLineInput[];

  @ApiProperty({ enum: RETURN_REASONS })
  @IsIn(RETURN_REASONS, { message: 'reasonCode khong hop le' })
  reasonCode!: ReturnReasonCode;

  @ApiPropertyOptional({ maxLength: RETURN_DESCRIPTION_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'description phai la chuoi' })
  @MaxLength(RETURN_DESCRIPTION_MAX, {
    message: `description toi da ${RETURN_DESCRIPTION_MAX} ky tu`,
  })
  description?: string;

  @ApiPropertyOptional({ type: [String], maxItems: RETURN_MEDIA_MAX })
  @IsOptional()
  @IsArray({ message: 'mediaKeys phai la mang' })
  @ArrayMaxSize(RETURN_MEDIA_MAX, { message: `Toi da ${RETURN_MEDIA_MAX} anh` })
  @IsString({ each: true, message: 'mediaKeys phai la chuoi' })
  @Matches(MEDIA_KEY_PATTERN, { each: true, message: 'mediaKeys khong hop le' })
  mediaKeys?: string[];

  @ApiPropertyOptional({ type: RefundAccountInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => RefundAccountInput)
  refundAccount?: RefundAccountInput;
}

export class RejectReturnRequest {
  @ApiProperty({ maxLength: RETURN_NOTE_MAX, description: 'Ly do tu choi, khach thay' })
  @Transform(trim)
  @IsString({ message: 'note phai la chuoi' })
  @IsNotEmpty({ message: 'Nhap ly do tu choi' })
  @MaxLength(RETURN_NOTE_MAX, { message: `note toi da ${RETURN_NOTE_MAX} ky tu` })
  note!: string;
}

export class ApproveReturnRequest {
  @ApiPropertyOptional({ maxLength: RETURN_NOTE_MAX, description: 'Huong dan gui hang cho khach' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'note phai la chuoi' })
  @MaxLength(RETURN_NOTE_MAX, { message: `note toi da ${RETURN_NOTE_MAX} ky tu` })
  note?: string;
}

export class RefundReturnRequest {
  @ApiPropertyOptional({
    maxLength: 64,
    description: 'Bat buoc voi don COD: ma giao dich chuyen khoan da hoan cho khach',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'transferReference phai la chuoi' })
  @Matches(/^[A-Za-z0-9._-]{4,64}$/, {
    message: 'Ma giao dich gom 4-64 ky tu chu, so, dau cham, gach',
  })
  transferReference?: string;
}

export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'RECEIVED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type ReturnStatusCode = (typeof RETURN_STATUSES)[number];

export class ListAdminReturnsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: RETURN_STATUSES })
  @IsOptional()
  @IsIn(RETURN_STATUSES, { message: 'status khong hop le' })
  status?: ReturnStatusCode;
}
