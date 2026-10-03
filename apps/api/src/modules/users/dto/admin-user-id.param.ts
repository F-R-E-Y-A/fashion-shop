import { IsUUID } from 'class-validator';

/**
 * Tham so duong dan khai bang lop de di qua ValidationPipe (bai hoc ND-10): id sai dang tra 400 ngay
 * o day, khong bao gio toi Prisma (Prisma gap chuoi khong phai UUID se nem loi 500). Chap nhan moi
 * phien ban UUID vi cot uuid cua Postgres cung vay; UUID dung dang ma khong co thi service tra 404.
 */
export class AdminUserIdParam {
  @IsUUID('all', { message: 'id phai la UUID' })
  id!: string;
}
