import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';
import { ROLE_CODES, type RoleCode } from '../../auth/index.js';

/**
 * Trang thai tai khoan nhan tu query. DTO khong duoc doc Prisma (luat ranh gioi), nen khai lai o day;
 * admin-users.service.spec.ts doi chieu voi enum UserStatus de them trang thai ma quen sua thi do.
 */
export const ADMIN_USER_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'LOCKED',
  'DISABLED',
] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

export const ADMIN_USER_SORTS = ['newest', 'oldest', 'email_asc', 'email_desc'] as const;
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number];

/** Do dai toi da cua mot dia chi email (RFC 5321). Chuoi tim dai hon khong the khop email nao. */
export const ADMIN_USER_QUERY_MAX = 254;

/**
 * Chi chuoi 'true' va 'false' moi la boolean. Khong dung @Type(() => Boolean): Boolean('false')
 * la true. Gia tri khac (ke ca mang khi lap tham so) giu nguyen de IsBoolean bao 400.
 */
const explicitBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/**
 * Tham so liet ke tai khoan cho quan tri vien: phan trang chung cong bo loc rieng. Cac bo loc ket
 * hop bang AND. Lap mot tham so (status=A&status=B) thanh mang va bi 400: chua ho tro chon nhieu.
 */
export class ListAdminUsersQuery extends PageQuery {
  @ApiPropertyOptional({
    description:
      'Tim email chua chuoi nay, khong phan biet hoa thuong; %, _ va dau nhay la ky tu thuong. Toi da 254 ky tu',
    maxLength: ADMIN_USER_QUERY_MAX,
  })
  @Transform(({ value }: { value: unknown }) => {
    const text = typeof value === 'string' ? value.trim() : value;
    return text === '' ? undefined : text;
  })
  @IsString({ message: 'q phai la mot chuoi' })
  @MaxLength(ADMIN_USER_QUERY_MAX, { message: 'q toi da 254 ky tu' })
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: ADMIN_USER_STATUSES })
  @IsIn(ADMIN_USER_STATUSES, { message: 'status khong hop le' })
  @IsOptional()
  status?: AdminUserStatus;

  @ApiPropertyOptional({
    enum: ROLE_CODES,
    description: 'Tai khoan CO vai nay (tai khoan nhieu vai van khop)',
  })
  @IsIn(ROLE_CODES, { message: 'role khong hop le' })
  @IsOptional()
  role?: RoleCode;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true: da xac thuc email (emailVerifiedAt khac null); false: chua xac thuc',
  })
  @Transform(explicitBoolean)
  @IsBoolean({ message: 'verified chi nhan true hoac false' })
  @IsOptional()
  verified?: boolean;

  @ApiPropertyOptional({
    enum: ADMIN_USER_SORTS,
    default: 'newest',
    description: 'newest/oldest theo ngay tao, email_asc/email_desc theo email; tie-break bang id',
  })
  @IsIn(ADMIN_USER_SORTS, { message: 'sort khong hop le' })
  @IsOptional()
  sort?: AdminUserSort;
}
