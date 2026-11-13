import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';

/** Ma loi chung cua phan he; thong diep tieng Viet co dau vi hien thang cho khach. */
export const reviewNotFound = (): NotFoundException =>
  new NotFoundException({ error: 'REVIEW_NOT_FOUND', message: 'Không tìm thấy đánh giá.' });

export const orderItemNotFound = (): NotFoundException =>
  new NotFoundException({
    error: 'ORDER_ITEM_NOT_FOUND',
    message: 'Không tìm thấy sản phẩm này trong đơn hàng của bạn.',
  });

export const reviewAlreadyExists = (): ConflictException =>
  new ConflictException({
    error: 'REVIEW_ALREADY_EXISTS',
    message: 'Bạn đã đánh giá sản phẩm này trong đơn hàng.',
  });

/** Quan tri dang xem ban cu: nguoi viet vua sua. Duyet hay an luc nay la quyet tren noi dung chua doc. */
export const reviewChanged = (): ConflictException =>
  new ConflictException({
    error: 'REVIEW_CHANGED',
    message: 'Khách vừa sửa đánh giá này. Tải lại để xem nội dung mới rồi quyết định.',
  });

export const reviewNotAllowed = (): UnprocessableEntityException =>
  new UnprocessableEntityException({
    error: 'REVIEW_NOT_ALLOWED',
    message: 'Chỉ đánh giá được sản phẩm trong đơn đã giao thành công.',
  });

export const reviewWindowClosed = (): UnprocessableEntityException =>
  new UnprocessableEntityException({
    error: 'REVIEW_WINDOW_CLOSED',
    message: 'Đã quá hạn 30 ngày kể từ khi nhận hàng để đánh giá.',
  });

export const reviewNotEditable = (): UnprocessableEntityException =>
  new UnprocessableEntityException({
    error: 'REVIEW_NOT_EDITABLE',
    message: 'Đánh giá chỉ sửa được một lần trong 30 ngày và không sửa được khi đã bị ẩn.',
  });

export const ownReview = (): UnprocessableEntityException =>
  new UnprocessableEntityException({
    error: 'OWN_REVIEW',
    message: 'Không thể bình chọn hay báo cáo đánh giá của chính bạn.',
  });

export const mediaInUse = (): UnprocessableEntityException =>
  new UnprocessableEntityException({
    error: 'INVALID_MEDIA',
    message: 'Ảnh này đã gắn với một đánh giá khác.',
  });

export const duplicateMedia = (): UnprocessableEntityException =>
  new UnprocessableEntityException({ error: 'INVALID_MEDIA', message: 'Một ảnh bị gửi hai lần.' });

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
