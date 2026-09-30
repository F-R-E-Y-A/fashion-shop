import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AuthGuard } from './auth.guard.js';
import type { RoleCode } from './role-code.js';
import { REQUIRED_ROLES_KEY, RolesGuard } from './roles.guard.js';

/**
 * Cua duy nhat de yeu cau vai: gan AuthGuard ROI RolesGuard trong mot decorator, nen controller
 * khong the quen guard nao hay dat sai thu tu. Chua dang nhap -> 401 (AuthGuard), da dang nhap
 * nhung khong co vai nao trong danh sach -> 403 (RolesGuard).
 *
 * Gan o MOT cap (class hoac method), khong ca hai: gan ca hai thi AuthGuard chay hai lan.
 */
export function RequireRoles(
  ...roles: [RoleCode, ...RoleCode[]]
): MethodDecorator & ClassDecorator {
  // Kieu tuple da bat it nhat mot vai luc bien dich; kiem them luc chay cho loi goi qua spread rong.
  if (roles.length === 0) throw new Error('RequireRoles can it nhat mot vai');

  return applyDecorators(
    SetMetadata(REQUIRED_ROLES_KEY, roles),
    UseGuards(AuthGuard, RolesGuard),
    ApiUnauthorizedResponse({ description: 'Chua dang nhap hoac phien khong con hop le' }),
    ApiForbiddenResponse({ description: `Can mot trong cac vai: ${roles.join(', ')}` }),
  );
}
