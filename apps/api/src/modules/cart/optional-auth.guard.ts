import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AuthGuard } from '../auth/index.js';

/**
 * Cho phep request di qua ke ca khi chua dang nhap (khach vang lai dung guestToken).
 * Neu request co mang theo header Authorization thi se xac thuc JWT qua AuthGuard
 * de trich xuat thong tin nguoi dung vao @CurrentUser().
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    if (request.headers.authorization === undefined) {
      return true;
    }
    return this.authGuard.canActivate(context);
  }
}
