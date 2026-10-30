import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedShipping } from '../../prisma/seed/shipping.seed.js';
import { createTestApp, type TestApp } from '../helpers/create-test-app.js';
import { resetDatabase } from '../helpers/db.js';

/**
 * Tai checkout: LOAD_USERS khach cung luc tranh mot bien the con LOAD_STOCK, moi khach preview roi
 * tao don COD (khong goi cong ngoai). Chay tay: npm run test:load -w apps/api. Chi tren CSDL kiem
 * thu (setup-env.ts chan CSDL khac). In bao cao JSON de so sanh truoc/sau khi doi pool, chi muc.
 */
const USERS = Number(process.env.LOAD_USERS ?? 200);
const STOCK = Number(process.env.LOAD_STOCK ?? 50);
/**
 * Rai thoi diem khach bat dau tren LOAD_RAMP_MS. 0 la cung mot mili giay: 1000 ket noi TCP mo
 * cung luc toi server cuc bo tren Windows bi ECONNREFUSED o phia client (hang cho listen day).
 */
const RAMP_MS = Number(process.env.LOAD_RAMP_MS ?? 0);

interface Sample {
  step: 'preview' | 'create';
  status: number;
  ms: number;
  code?: string;
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!
    : 0;
}

describe(`tai checkout: ${USERS} khach tranh mot SKU con ${STOCK}`, () => {
  let t: TestApp;
  let variantId: string;
  const tokens: string[] = [];
  const addresses: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const province = await t.prisma.administrativeArea.create({
      data: { code: 'T01', name: 'Tỉnh tải', level: 'PROVINCE' },
    });
    const commune = await t.prisma.administrativeArea.create({
      data: { code: 'T0101', name: 'Phường tải', level: 'COMMUNE', parentId: province.id },
    });
    // Bieu phi chi sinh cho xa da co luc seed: tao khu vuc truoc.
    await seedShipping(t.prisma);
    variantId = (await t.prisma.productVariant.findFirstOrThrow({ orderBy: { id: 'asc' } })).id;
    await t.prisma.productVariant.update({
      where: { id: variantId },
      data: { listPrice: '200000', salePrice: null },
    });
    await t.prisma.inventory.create({
      data: { productVariantId: variantId, quantityOnHand: STOCK },
    });
    const users = Array.from({ length: USERS }, (_, i) => ({
      id: randomUUID(),
      email: `load-${i}@fixture.test`,
      passwordHash: 'not-used',
      status: 'ACTIVE' as const,
    }));
    await t.prisma.user.createMany({ data: users });
    const rows = users.map((user) => ({ user, addressId: randomUUID(), cartId: randomUUID() }));
    await t.prisma.address.createMany({
      data: rows.map(({ user, addressId }) => ({
        id: addressId,
        userId: user.id,
        administrativeAreaId: commune.id,
        recipientName: 'Khách tải',
        phone: '0901234567',
        detailAddress: 'Địa chỉ kiểm thử tải',
        isDefault: true,
      })),
    });
    await t.prisma.cart.createMany({
      data: rows.map(({ user, cartId }) => ({ id: cartId, userId: user.id })),
    });
    await t.prisma.cartItem.createMany({
      data: rows.map(({ cartId }) => ({ cartId, productVariantId: variantId, quantity: 1 })),
    });
    const jwt = t.app.get(JwtService);
    for (const { user, addressId } of rows) {
      tokens.push(await jwt.signAsync({ sub: user.id, ver: 0 }));
      addresses.push(addressId);
    }
  }, 300_000);
  afterAll(async () => {
    await t?.close();
  });

  it('dung STOCK don, khong ban vuot, khong 500; qua tai chi duoc la 503 SERVER_BUSY', async () => {
    const samples: Sample[] = [];
    const timed = async (
      step: Sample['step'],
      run: () => Promise<{ status: number; body: { code?: string } }>,
    ) => {
      const start = performance.now();
      const response = await run();
      samples.push({
        step,
        status: response.status,
        ms: performance.now() - start,
        code: response.body?.code,
      });
      return response;
    };
    const started = performance.now();
    await Promise.all(
      tokens.map(async (token, i) => {
        if (RAMP_MS) await new Promise((done) => setTimeout(done, (i * RAMP_MS) / USERS));
        const auth = { Authorization: `Bearer ${token}` };
        const quote = await timed('preview', () =>
          t.http.post('/api/checkout/preview').set(auth).send({ addressId: addresses[i] }),
        );
        if (quote.status !== 201) return;
        await timed('create', () =>
          t.http
            .post('/api/checkout/orders')
            .set(auth)
            .send({
              addressId: addresses[i],
              fingerprint: (quote.body as { fingerprint: string }).fingerprint,
              idempotencyKey: randomUUID(),
              gateway: 'COD',
            }),
        );
      }),
    );
    const wallMs = performance.now() - started;
    const held = await t.prisma.inventoryReservation.aggregate({
      where: { productVariantId: variantId, releasedAt: null },
      _sum: { quantity: true },
    });
    const orders = await t.prisma.order.count();
    const report = Object.fromEntries(
      (['preview', 'create'] as const).map((step) => {
        const rows = samples.filter((sample) => sample.step === step);
        const ms = rows.map((row) => row.ms);
        const statuses: Record<string, number> = {};
        for (const row of rows) {
          const key = row.code ? `${row.status}:${row.code}` : String(row.status);
          statuses[key] = (statuses[key] ?? 0) + 1;
        }
        return [
          step,
          {
            count: rows.length,
            statuses,
            p50: percentile(ms, 50),
            p95: percentile(ms, 95),
            p99: percentile(ms, 99),
            max: Math.max(0, ...ms),
          },
        ];
      }),
    );
    process.stdout.write(
      `${JSON.stringify({ users: USERS, stock: STOCK, rampMs: RAMP_MS, poolMax: process.env.DATABASE_POOL_MAX ?? '10 (mac dinh)', wallMs: Math.round(wallMs), orders, held: held._sum.quantity ?? 0, ...report }, (_key, value: unknown) => (typeof value === 'number' ? Math.round(value) : value), 2)}\n`,
    );
    expect(orders).toBe(Math.min(USERS, STOCK));
    expect(held._sum.quantity ?? 0).toBe(Math.min(USERS, STOCK));
    // Dung dan la dieu kien cung; 503 SERVER_BUSY la thieu nang luc, doc trong bao cao chu khong la bug.
    expect(
      samples.filter((sample) => sample.status >= 500 && sample.code !== 'SERVER_BUSY'),
    ).toEqual([]);
  }, 600_000);
});
