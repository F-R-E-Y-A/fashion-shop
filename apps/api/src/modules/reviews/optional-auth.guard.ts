import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AuthGuard } from '../auth/index.js';

/**
 * Trang danh gia cong khai: khach vang lai van xem duoc. Co header Authorization thi xac thuc qua
 * AuthGuard de biet nguoi dang xem da bam huu ich chua; token sai van tra 401 de web lam moi phien.
 * Ban sao cua cart/optional-auth.guard.ts: phan he khong import guard cua nhau.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    if (request.headers.authorization === undefined) return true;
    return this.authGuard.canActivate(context);
  }
}
