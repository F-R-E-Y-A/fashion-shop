import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Dat `Cache-Control: no-store` cho phan hoi quan tri: than chua email, trang thai va vai cua nguoi
 * khac, trinh duyet hay proxy khong duoc luu lai. Gan o cap class bang UseInterceptors vi @Header cua
 * Nest chi gan duoc tung method. Dat header TRUOC khi handler chay nen ca 200 lan loi 400/404 sau do
 * deu mang header; 401/403 do guard tra truoc interceptor va than khong co du lieu nguoi dung.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}
