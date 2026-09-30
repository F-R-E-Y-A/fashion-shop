import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AddressesService } from './addresses.service.js';

const USER_ID = '00000000-0000-4000-8000-0000000000aa';
const ADDRESS_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Hai luat cau truc kho thay bang kiem thu HTTP: moi thao tac ghi KHOA truoc khi doc, va moi truy van
 * dia chi deu loc theo userId cua CurrentUser. Hanh vi that (bat bien mac dinh, 404 cho dia chi nguoi
 * khac, dong thoi) kiem o test/user-addresses*.http.spec.ts tren Postgres that.
 */
function makeService() {
  const calls: string[] = [];
  const record =
    (name: string, result: unknown = null) =>
    (...args: unknown[]) => {
      calls.push(name);
      return Promise.resolve(
        typeof result === 'function' ? (result as (...a: unknown[]) => unknown)(...args) : result,
      );
    };
  const tx = {
    $executeRaw: vi.fn(record('lock', 1)),
    address: {
      findFirst: vi.fn(record('address.findFirst', null)),
      count: vi.fn(record('address.count', 0)),
    },
    administrativeArea: { findFirst: vi.fn(record('area.findFirst', null)) },
  };
  const prisma = { $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
  return { calls, tx, service: new AddressesService(prisma as unknown as PrismaService) };
}

describe('AddressesService (UC-01.6)', () => {
  it('update: khoa truoc, tim theo id VA userId, khong thay thi 404', async () => {
    const { calls, tx, service } = makeService();

    await expect(
      service.update(USER_ID, ADDRESS_ID, { recipientName: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(calls[0]).toBe('lock');
    expect(tx.address.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ADDRESS_ID, userId: USER_ID } }),
    );
  });

  it('remove: khoa truoc, tim theo id VA userId, khong thay thi 404', async () => {
    const { calls, tx, service } = makeService();

    await expect(service.remove(USER_ID, ADDRESS_ID)).rejects.toBeInstanceOf(NotFoundException);

    expect(calls[0]).toBe('lock');
    expect(tx.address.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ADDRESS_ID, userId: USER_ID } }),
    );
  });

  it('create: khoa truoc khi kiem khu vuc va dem dia chi; khu vuc khong hop le thi 422', async () => {
    const { calls, service } = makeService();

    await expect(
      service.create(USER_ID, {
        recipientName: 'X',
        phone: '0901234567',
        administrativeAreaId: ADDRESS_ID,
        detailAddress: 'Y',
      }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_ADMINISTRATIVE_AREA' } });
    expect(calls).toEqual(['lock', 'area.findFirst']);
  });
});
