import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutService } from './checkout.service.js';
import { SettlementService } from './settlement.service.js';

/** Gia lap nguon viec: moi lan goi tra lo tiep theo, bo cac id worker bao da xu ly. */
function source<T extends { id: string }>(items: T[], size: number) {
  return vi.fn(async (skip: string[]) =>
    items.filter((item) => !skip.includes(item.id)).slice(0, size),
  );
}

function fixture(
  orders: { id: string; userId: string }[],
  payments: { id: string; reference: string }[],
) {
  const due = source(orders, 50);
  const candidates = source(
    payments.map((payment) => ({ ...payment, gateway: 'VNPAY', checkoutUrl: 'x', orderId: 'o' })),
    50,
  );
  const cancel = vi.fn(async (id: string) => {
    if (id === 'poison') throw new TypeError('private detail');
  });
  const checkout = {
    orders: { due },
    payments: { candidates, launchLatest: vi.fn() },
    cancel,
  } as unknown as CheckoutService;
  const service = new SettlementService(checkout, {
    get: () => 'test',
  } as unknown as ConfigService);
  const reconcile = vi.spyOn(service, 'reconcile').mockResolvedValue(undefined);
  return { service, due, cancel, reconcile };
}

afterEach(() => vi.restoreAllMocks());

describe('PH-11 worker doi soat: tung muc rieng, vet het lo trong ngan sach', () => {
  it('vet qua nhieu lo thay vi dung o 50 don moi tick', async () => {
    const orders = Array.from({ length: 120 }, (_, i) => ({ id: `o${i}`, userId: 'u' }));
    const { service, cancel, due } = fixture(orders, []);
    await service.tick();
    expect(cancel).toHaveBeenCalledTimes(120);
    expect(due.mock.calls.length).toBe(4);
  });

  it('mot don loi khong chan don sau, khong bi lay lai trong cung tick, khong lo chi tiet loi', async () => {
    const { service, cancel, reconcile } = fixture(
      [
        { id: 'poison', userId: 'u' },
        { id: 'ok', userId: 'u' },
      ],
      [{ id: 'p1', reference: 'P1' }],
    );
    const log = vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    await service.tick();
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(['poison', 'ok']);
    expect(reconcile).toHaveBeenCalledWith('P1');
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]![0])).toContain('poison');
    expect(String(log.mock.calls[0]![0])).not.toContain('private detail');
  });

  it('het ngan sach thi dung, viec con lai de tick sau', async () => {
    const orders = Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, userId: 'u' }));
    const { service, cancel } = fixture(orders, []);
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    cancel.mockImplementation(async () => {
      now += 7_000;
    });
    await service.tick();
    expect(cancel).toHaveBeenCalledTimes(3);
  });
});
