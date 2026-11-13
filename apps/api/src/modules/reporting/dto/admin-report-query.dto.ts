import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

export const VALID_TOP_LIMITS = [5, 10, 20] as const;
export type ValidTopLimit = (typeof VALID_TOP_LIMITS)[number];

export function getTodayInVietnam(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function diffCalendarDays(fromStr: string, toStr: string): number {
  const fromDate = new Date(`${fromStr}T00:00:00Z`);
  const toDate = new Date(`${toStr}T00:00:00Z`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

function isValidCalendarDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const [yStr, mStr, dStr] = val.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

@ValidatorConstraint({ name: 'isValidCalendarDate', async: false })
export class IsValidCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return isValidCalendarDate(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} phải là ngày lịch hợp lệ theo định dạng YYYY-MM-DD.`;
  }
}

@ValidatorConstraint({ name: 'isDateRangeValid', async: false })
export class IsDateRangeValidConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as AdminReportQueryDto;

    // Neu from hoac to khong hop le theo format YYYY-MM-DD, de IsValidCalendarDateConstraint xu ly loi
    if (obj.from !== undefined && !isValidCalendarDate(obj.from)) return true;
    if (obj.to !== undefined && !isValidCalendarDate(obj.to)) return true;

    const effectiveTo = obj.to ?? getTodayInVietnam();
    const effectiveFrom = obj.from ?? addDaysToDateString(effectiveTo, -29);

    if (effectiveFrom > effectiveTo) return false;

    const diffDays = diffCalendarDays(effectiveFrom, effectiveTo);
    const inclusiveDays = diffDays + 1;
    return inclusiveDays <= 366;
  }

  defaultMessage(args: ValidationArguments): string {
    const obj = args.object as AdminReportQueryDto;
    const effectiveTo = obj.to ?? getTodayInVietnam();
    const effectiveFrom = obj.from ?? addDaysToDateString(effectiveTo, -29);

    if (effectiveFrom > effectiveTo) {
      return 'Ngày bắt đầu (from) không được lớn hơn ngày kết thúc (to).';
    }
    return 'Khoảng thời gian báo cáo không được vượt quá 366 ngày (bao gồm cả hai đầu).';
  }
}

export class AdminReportQueryDto {
  @ApiPropertyOptional({ description: 'Từ ngày (YYYY-MM-DD)', example: '2026-10-14' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from phải có định dạng YYYY-MM-DD' })
  @Validate(IsValidCalendarDateConstraint)
  @Validate(IsDateRangeValidConstraint)
  from?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (YYYY-MM-DD)', example: '2026-11-12' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to phải có định dạng YYYY-MM-DD' })
  @Validate(IsValidCalendarDateConstraint)
  @Validate(IsDateRangeValidConstraint)
  to?: string;

  @ApiPropertyOptional({
    description: 'Số lượng top sản phẩm (5, 10 hoặc 20)',
    enum: [5, 10, 20],
    default: 10,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 10;
    // Tu choi cac chuoi exponent nhu 1e1, 1.0, vv. Chi chap nhan chuoi so nguyen thuan tuy '5', '10', '20'
    if (typeof value === 'string' && /^(5|10|20)$/.test(value)) {
      return Number(value);
    }
    if (typeof value === 'number' && (value === 5 || value === 10 || value === 20)) {
      return value;
    }
    return -1;
  })
  @IsIn([5, 10, 20], { message: 'top chỉ được nhận giá trị 5, 10 hoặc 20' })
  top?: ValidTopLimit = 10;
}
