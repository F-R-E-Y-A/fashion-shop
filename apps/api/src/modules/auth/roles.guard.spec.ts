import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import type { CurrentUserType } from './current-user.type.js';
import { RoleCode } from './role-code.js';
import { REQUIRED_ROLES_KEY, RolesGuard } from './roles.guard.js';

class Handlers {
  noMetadata(): void {}
}

/** Gan metadata len mot ham rieng cho moi ca, nhu SetMetadata lam that. */
function handlerRequiring(roles: readonly string[] | undefined): () => void {
  const handler = (): void => {};
  if (roles !== undefined) Reflect.defineMetadata(REQUIRED_ROLES_KEY, roles, handler);
  return handler;
}

function contextFor(handler: () => void, user: CurrentUserType | undefined): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => Handlers,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const principal = (roles: string[]): CurrentUserType => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'nguoi.dung@example.test',
  roles,
});

const guard = new RolesGuard(new Reflector());

function expectForbidden(run: () => unknown): void {
  try {
    run();
    expect.unreachable('RolesGuard phai tu choi');
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      error: 'FORBIDDEN',
      message: 'Khong du quyen truy cap',
    });
  }
}

describe('RolesGuard (T-M5 phan quyen API quan tri)', () => {
  it('cho ADMIN qua khi can ADMIN', () => {
    const context = contextFor(
      handlerRequiring([RoleCode.ADMIN]),
      principal(['CUSTOMER', 'ADMIN']),
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('tu choi CUSTOMER khi can ADMIN (403 FORBIDDEN)', () => {
    const context = contextFor(handlerRequiring([RoleCode.ADMIN]), principal(['CUSTOMER']));
    expectForbidden(() => guard.canActivate(context));
  });

  it('tu choi nguoi khong co vai nao', () => {
    const context = contextFor(handlerRequiring([RoleCode.ADMIN]), principal([]));
    expectForbidden(() => guard.canActivate(context));
  });

  it('mot vai khop trong danh sach yeu cau la du (OR)', () => {
    const context = contextFor(
      handlerRequiring([RoleCode.ADMIN, RoleCode.CUSTOMER]),
      principal(['CUSTOMER']),
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('khong nhan ma vai viet thuong: so khop dung ma trong RoleCode', () => {
    const context = contextFor(handlerRequiring([RoleCode.ADMIN]), principal(['admin']));
    expectForbidden(() => guard.canActivate(context));
  });

  it('tu choi khi thieu request.user (AuthGuard khong chay truoc)', () => {
    const context = contextFor(handlerRequiring([RoleCode.ADMIN]), undefined);
    expectForbidden(() => guard.canActivate(context));
  });

  it('tu choi khi thieu metadata: gan RolesGuard ma khong qua RequireRoles la dong cua', () => {
    const context = contextFor(Handlers.prototype.noMetadata, principal(['ADMIN']));
    expectForbidden(() => guard.canActivate(context));
  });

  it('tu choi khi metadata la danh sach rong', () => {
    const context = contextFor(handlerRequiring([]), principal(['ADMIN']));
    expectForbidden(() => guard.canActivate(context));
  });

  it('metadata o method thang metadata o class', () => {
    class AdminOnly {}
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, [RoleCode.ADMIN], AdminOnly);
    const context = {
      getHandler: () => handlerRequiring([RoleCode.CUSTOMER]),
      getClass: () => AdminOnly,
      switchToHttp: () => ({ getRequest: () => ({ user: principal(['CUSTOMER']) }) }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(true);
  });
});
