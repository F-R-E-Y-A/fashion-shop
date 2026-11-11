import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { Decimal } from 'decimal.js';

import type { Prisma } from '../../generated/prisma/client.js';
import type { DiscountType, VoucherStatus } from './promotions.types.js';

export interface VoucherLockedRow {
  id: string;
  code: string;
  status: VoucherStatus;
  discountType: DiscountType;
  discountValue: Decimal;
  maxDiscountAmount: Decimal | null;
  minOrderAmount: Decimal | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toIsoString(date: Date | string): string {
  if (!date) {
    throw new Error('toIsoString: date is required');
  }
  if (date instanceof Date) return date.toISOString();
  return new Date(date).toISOString();
}

export function IsStrictIsoDateString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrictIsoDateString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          // Bắt buộc ISO 8601 có mili-giây và kết thúc bằng Z (UTC)
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
          const timestamp = Date.parse(value);
          if (Number.isNaN(timestamp)) return false;
          // Đối chiếu round-trip để loại bỏ ngày không hợp lệ (ví dụ ngày 31/02)
          return new Date(timestamp).toISOString() === value;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'expectedUpdatedAt phải đúng chuẩn ISO 8601 mili-giây (YYYY-MM-DDTHH:mm:ss.sssZ) và là ngày hợp lệ';
        },
      },
    });
  };
}

/** Khóa hàng Voucher theo id trước khi kiểm tra CAS và cập nhật. */
export async function lockVoucher(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<VoucherLockedRow | null> {
  const rows = await tx.$queryRaw<VoucherLockedRow[]>`
    SELECT id, code, status,
           discount_type AS "discountType",
           discount_value AS "discountValue",
           max_discount_amount AS "maxDiscountAmount",
           min_order_amount AS "minOrderAmount",
           usage_limit AS "usageLimit",
           per_user_limit AS "perUserLimit",
           starts_at AS "startsAt",
           ends_at AS "endsAt",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM public.vouchers
    WHERE id = ${id}::uuid
    FOR UPDATE
  `;
  return rows?.[0] ?? null;
}
