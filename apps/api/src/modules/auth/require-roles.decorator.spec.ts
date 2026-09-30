import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';

import { AuthGuard } from './auth.guard.js';
import { RequireRoles } from './require-roles.decorator.js';
import { RoleCode } from './role-code.js';
import { REQUIRED_ROLES_KEY, RolesGuard } from './roles.guard.js';

describe('RequireRoles', () => {
  it('gan AuthGuard ROI RolesGuard, dung thu tu, trong mot decorator', () => {
    @RequireRoles(RoleCode.ADMIN)
    class AdminController {}

    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toEqual([AuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, AdminController)).toEqual([RoleCode.ADMIN]);
  });

  it('gan duoc o method', () => {
    class Controller {
      @RequireRoles(RoleCode.ADMIN, RoleCode.CUSTOMER)
      handler(): void {}
    }
    const handler = Object.getOwnPropertyDescriptor(Controller.prototype, 'handler')?.value;

    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([AuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, handler)).toEqual(['ADMIN', 'CUSTOMER']);
  });

  it('nem loi ngay luc khai bao khi khong co vai nao', () => {
    const none = [] as unknown as Parameters<typeof RequireRoles>;
    expect(() => RequireRoles(...none)).toThrow('RequireRoles can it nhat mot vai');
  });
});
