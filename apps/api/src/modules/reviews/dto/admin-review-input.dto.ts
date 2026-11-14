import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

import { REVIEW_NOTE_MAX, REVIEW_REPLY_MAX } from '../review-policy.js';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.normalize('NFC').trim() : value;

/**
 * Phien ban quan tri dang xem (editCount cua dong trong danh sach). Nguoi viet sua sau khi trang
 * quan tri da tai thi editCount tang va lenh duyet/an tra 409 REVIEW_CHANGED (ADR-054).
 */
export class ApproveReviewRequest {
  @ApiProperty({ minimum: 0, description: 'editCount cua danh gia luc quan tri doc' })
  @IsInt({ message: 'editCount phai la so nguyen' })
  @Min(0, { message: 'editCount khong am' })
  editCount!: number;
}

/** Ly do an bat buoc: nguoi viet thay ly do nay o trang "Danh gia cua toi". */
export class RejectReviewRequest extends ApproveReviewRequest {
  @ApiProperty({ maxLength: REVIEW_NOTE_MAX, example: 'Noi dung chua so dien thoai quang cao' })
  @Transform(trimmed)
  @IsString({ message: 'note phai la chuoi' })
  @IsNotEmpty({ message: 'note khong duoc de trong' })
  @MaxLength(REVIEW_NOTE_MAX, { message: `note toi da ${REVIEW_NOTE_MAX} ky tu` })
  note!: string;
}

export class ReplyReviewRequest {
  @ApiProperty({ maxLength: REVIEW_REPLY_MAX })
  @Transform(trimmed)
  @IsString({ message: 'content phai la chuoi' })
  @IsNotEmpty({ message: 'content khong duoc de trong' })
  @MaxLength(REVIEW_REPLY_MAX, { message: `content toi da ${REVIEW_REPLY_MAX} ky tu` })
  content!: string;
}
