import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { CurrentUserType } from './current-user.type.js';
import type { RoleCode } from './role-code.js';

export const REQUIRED_ROLES_KEY = 'fashion-shop:required-roles';

/**
 * Chi lam authorization: so vai yeu cau (metadata cua RequireRoles) voi `request.user.roles` ma
 * AuthGuard da nap tu CSDL cho CHINH request nay. Khong truy van lai, khong doc JWT, khong goi
 * AuthService. Mot vai khop la du (OR).
 *
 * Mac dinh la TU CHOI: thieu metadata hay thieu request.user nghia la guard bi gan sai cach (khong
 * qua RequireRoles), va sai cach thi dong cua chu khong mo cua. Ca hai tra 403 chu khong 401: day la
 * loi cau hinh phia may chu, 401 se khien giao dien thu refresh token vo ich.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly RoleCode[] | undefined>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) throw this.forbidden();

    const user = context.switchToHttp().getRequest<{ user?: CurrentUserType }>().user;
    if (!user) throw this.forbidden();

    if (!required.some((role) => user.roles.includes(role))) throw this.forbidden();
    return true;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      error: 'FORBIDDEN',
      message: 'Khong du quyen truy cap',
    });
  }
}
