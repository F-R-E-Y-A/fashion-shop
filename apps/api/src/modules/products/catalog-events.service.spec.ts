import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { InventoryService } from '../inventory/index.js';
import { CatalogEventsService } from './catalog-events.service.js';

function fixture() {
  vi.useFakeTimers();
  const findMany = vi.fn().mockResolvedValue([{ value: '7:true' }]);
  const stock = vi.fn().mockResolvedValue('stock-1');
  const service = new CatalogEventsService(
    { $queryRaw: findMany } as unknown as PrismaService,
    { getAvailabilityRevision: stock } as unknown as InventoryService,
  );
  return { service, findMany, stock };
}

afterEach(() => vi.useRealTimers());

describe('PH-11: SSE public catalog revisions', () => {
  it('chia se probe cho nhieu client, chi phat khi thay doi, ngung query khi tat het client', async () => {
    const { service, findMany, stock } = fixture();
    const first = vi.fn();
    const second = vi.fn();
    const a = service.events.subscribe(first);
    const b = service.events.subscribe(second);
    await vi.advanceTimersByTimeAsync(0);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(first).toHaveBeenCalledTimes(1);
    stock.mockResolvedValue('stock-2');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(first).toHaveBeenCalledTimes(2);
    expect(first.mock.calls[1]![0]).toMatchObject({
      type: 'catalog-changed',
      data: { revision: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    a.unsubscribe();
    b.unsubscribe();
    const count = findMany.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(findMany).toHaveBeenCalledTimes(count);
  });

  it('DB loi thong bao unavailable, ket noi van song va phuc hoi lai revision', async () => {
    const { service, findMany } = fixture();
    const events = vi.fn();
    const subscription = service.events.subscribe(events);
    await vi.advanceTimersByTimeAsync(0);
    findMany.mockRejectedValueOnce(new Error('private database detail'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(events.mock.calls[1]![0]).toEqual({ type: 'catalog-unavailable', data: {} });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(events.mock.calls[2]![0].type).toBe('catalog-changed');
    expect(JSON.stringify(events.mock.calls)).not.toContain('private database detail');
    subscription.unsubscribe();
  });

  it('client ket noi lai sau heartbeat van nhan revision moi nhat ngay', async () => {
    const { service } = fixture();
    const a = service.events.subscribe();
    await vi.advanceTimersByTimeAsync(15_000);
    const events = vi.fn();
    const b = service.events.subscribe(events);
    expect(events.mock.calls[0]![0].type).toBe('catalog-changed');
    a.unsubscribe();
    b.unsubscribe();
  });
});
