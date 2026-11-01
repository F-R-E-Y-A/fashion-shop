import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Hinh dang loi thong nhat cho toan bo API.
 * Giao dien web chi phai xu ly dung mot hinh dang nay, khong phai doan moi noi mot kieu.
 */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

const BUSY_RETRY_AFTER_SECONDS = 2;

/**
 * Het ket noi DB trong han cho: Prisma P2028 (khong mo duoc transaction trong maxWait) hoac pg-pool
 * het connectionTimeoutMillis cho query le. Do tai 1000 khach thay ca hai thanh 500 neu khong tach.
 */
function isPoolExhausted(exception: unknown): boolean {
  if (!(exception instanceof Error)) return false;
  return (
    ((exception as { code?: unknown }).code === 'P2028' &&
      exception.message.includes('Unable to start a transaction')) ||
    exception.message === 'timeout exceeded when trying to connect'
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Loi khong xac dinh phia may chu';
    let code = HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR';
    let retryAfterSeconds: number | undefined;

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const body = payload as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        if (typeof body.error === 'string') {
          code = body.error.toUpperCase().replace(/\s+/g, '_');
        }
        // Chi dua len HEADER Retry-After (429/503); khong bao gio vao than phan hoi.
        if (typeof body.retryAfterSeconds === 'number') retryAfterSeconds = body.retryAfterSeconds;
      }
    } else if (isPoolExhausted(exception)) {
      // Het ket noi trong han cho: qua tai tam thoi, khach thu lai duoc, khong phai loi ma.
      status = HttpStatus.SERVICE_UNAVAILABLE;
      code = 'SERVER_BUSY';
      message = 'Hệ thống đang đông, vui lòng thử lại sau ít giây.';
      retryAfterSeconds = BUSY_RETRY_AFTER_SECONDS;
    } else if (exception instanceof Error) {
      // Khong tra chi tiet loi noi bo ra ngoai, chi ghi vao nhat ky may chu.
      this.logger.error(exception.message, exception.stack);
    }

    const body: ApiErrorBody = {
      statusCode: status,
      code,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${request.method} ${request.url} -> ${status}`);
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}`);
    }

    if (retryAfterSeconds !== undefined)
      response.setHeader('Retry-After', String(retryAfterSeconds));
    response.status(status).json(body);
  }
}
