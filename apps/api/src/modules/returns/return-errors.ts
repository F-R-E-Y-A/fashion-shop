import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { RETURN_WINDOW_DAYS } from './return-policy.js';

/** Ma loi cua phan he; thong diep tieng Viet co dau vi hien thang cho khach va ADMIN. */
export const returnNotFound = (): NotFoundException =>
  new NotFoundException({ error: 'RETURN_NOT_FOUND', message: 'Không tìm thấy yêu cầu trả hàng.' });

export const returnNotAllowed = (): ConflictException =>
  new ConflictException({
    error: 'RETURN_NOT_ALLOWED',
    message: 'Chỉ gửi yêu cầu trả hàng cho đơn đã giao thành công.',
  });

export const returnWindowClosed = (): ConflictException =>
  new ConflictException({
    error: 'RETURN_WINDOW_CLOSED',
    message: `Đã quá hạn ${RETURN_WINDOW_DAYS} ngày kể từ khi nhận hàng để yêu cầu trả.`,
  });

export const returnExists = (): ConflictException =>
  new ConflictException({
    error: 'RETURN_EXISTS',
    message: 'Đơn này đã có yêu cầu trả hàng. Theo dõi yêu cầu đó trong mục Trả hàng.',
  });

export const invalidReturnItems = (message: string): BadRequestException =>
  new BadRequestException({ error: 'INVALID_RETURN_ITEMS', message });

export const photoRequiredError = (): BadRequestException =>
  new BadRequestException({
    error: 'RETURN_PHOTO_REQUIRED',
    message: 'Hàng lỗi hoặc giao sai cần ít nhất một ảnh để shop kiểm tra.',
  });

export const refundAccountRequired = (): BadRequestException =>
  new BadRequestException({
    error: 'REFUND_ACCOUNT_REQUIRED',
    message:
      'Đơn trả tiền khi nhận hàng cần ngân hàng, số tài khoản và tên chủ tài khoản để hoàn tiền.',
  });

export const wrongReturnState = (message: string): ConflictException =>
  new ConflictException({ error: 'RETURN_STATE_CHANGED', message });

export const transferReferenceRequired = (): BadRequestException =>
  new BadRequestException({
    error: 'TRANSFER_REFERENCE_REQUIRED',
    message: 'Đơn trả tiền khi nhận hàng: nhập mã giao dịch chuyển khoản đã hoàn cho khách.',
  });

export const refundAwaitingGateway = (): ConflictException =>
  new ConflictException({
    error: 'REFUND_PENDING',
    message:
      'Lệnh hoàn trước chưa rõ kết quả từ cổng. Đối soát và chốt lệnh đó ở trang đơn hàng, rồi bấm hoàn tiền lại.',
  });
