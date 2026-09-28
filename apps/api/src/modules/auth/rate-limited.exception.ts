import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 429 khong tiet lo gi ngoai "hay doi": khong so lan con lai, khong tai khoan co ton tai hay khong,
 * khong trang thai kho dem. `retryAfterSeconds` chi de AllExceptionsFilter dat header Retry-After;
 * filter khong dua truong nay vao than phan hoi.
 */
export class RateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        error: 'RATE_LIMITED',
        message: 'Qua nhieu yeu cau, hay thu lai sau',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
