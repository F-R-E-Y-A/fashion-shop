import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { lockStock } from './inventory-operations.js';

export interface StockCount {
  sku: string;
  quantity: number;
}

export interface StockCountChange {
  sku: string;
  variantId: string;
  before: number | null;
  after: number;
  reserved: number;
}

export type StockCountResult =
  | { outcome: 'APPLIED' | 'DRY_RUN'; changes: StockCountChange[] }
  | { outcome: 'REJECTED'; errors: string[] };

const MAX_QUANTITY = 1_000_000;

/**
 * Doc CSV kiem ke `sku,quantity` (so ton vat ly dem duoc). Bo dong trong, dong `#` va dong tieu de.
 * Tra loi theo so dong de chu kho sua file; khong doan SKU hay so luong.
 */
export function parseStockCsv(text: string): { counts: StockCount[]; errors: string[] } {
  const counts: StockCount[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/u).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const [sku = '', quantity = '', ...rest] = line.split(',').map((cell) => cell.trim());
    if (!counts.length && !errors.length && sku.toLowerCase() === 'sku') return;
    const row = `Dong ${index + 1}`;
    if (rest.length || !sku) errors.push(`${row}: can dung hai cot sku,quantity.`);
    else if (!/^\d+$/u.test(quantity) || Number(quantity) > MAX_QUANTITY)
      errors.push(`${row}: quantity phai la so nguyen 0..${MAX_QUANTITY}.`);
    else if (seen.has(sku)) errors.push(`${row}: SKU ${sku} bi lap.`);
    else {
      seen.add(sku);
      counts.push({ sku, quantity: Number(quantity) });
    }
  });
  return { counts, errors };
}

/**
 * Dat ton vat ly theo so kiem ke, tat ca hoac khong dong nao. Khoa variant cung thu tu voi Checkout
 * nen khong chen giua reserve/commit; tu choi so nho hon luong dang giu cho don chua thanh toan.
 * Moi chenh lech ghi mot StockMovement ADJUSTMENT de truy vet.
 */
export async function applyStockCounts(
  prisma: PrismaClient,
  counts: StockCount[],
  options: { dryRun?: boolean } = {},
): Promise<StockCountResult> {
  if (!counts.length) return { outcome: 'REJECTED', errors: ['Khong co dong ton nao.'] };
  return prisma.$transaction(
    async (tx) => {
      const variants = await tx.productVariant.findMany({
        where: { sku: { in: counts.map((count) => count.sku) } },
        select: { id: true, sku: true },
      });
      const bySku = new Map(variants.map((variant) => [variant.sku, variant.id]));
      const errors = counts
        .filter((count) => !bySku.has(count.sku))
        .map((count) => `SKU ${count.sku} khong ton tai.`);
      if (errors.length) return { outcome: 'REJECTED', errors };

      const items = counts.map((count) => ({
        variantId: bySku.get(count.sku)!,
        quantity: count.quantity,
      }));
      await lockStock(tx, items);
      const ids = items.map((item) => item.variantId);
      const stock = new Map(
        (await tx.inventory.findMany({ where: { productVariantId: { in: ids } } })).map((row) => [
          row.productVariantId,
          row.quantityOnHand,
        ]),
      );
      const held = new Map(
        (
          await tx.inventoryReservation.groupBy({
            by: ['productVariantId'],
            where: {
              productVariantId: { in: ids },
              releasedAt: null,
              expiresAt: { gt: new Date() },
            },
            _sum: { quantity: true },
          })
        ).map((row) => [row.productVariantId, row._sum.quantity ?? 0]),
      );
      const changes = counts.map((count, index) => {
        const variantId = items[index]!.variantId;
        return {
          sku: count.sku,
          variantId,
          before: stock.get(variantId) ?? null,
          after: count.quantity,
          reserved: held.get(variantId) ?? 0,
        };
      });
      const belowHeld = changes
        .filter((change) => change.after < change.reserved)
        .map(
          (change) =>
            `SKU ${change.sku}: ${change.after} nho hon ${change.reserved} dang giu cho don cho thanh toan.`,
        );
      if (belowHeld.length) return { outcome: 'REJECTED', errors: belowHeld };
      if (options.dryRun) return { outcome: 'DRY_RUN', changes };

      for (const change of changes) await write(tx, change);
      return { outcome: 'APPLIED', changes };
    },
    { timeout: 60_000 },
  );
}

async function write(tx: Prisma.TransactionClient, change: StockCountChange) {
  const delta = change.after - (change.before ?? 0);
  await tx.inventory.upsert({
    where: { productVariantId: change.variantId },
    create: { productVariantId: change.variantId, quantityOnHand: change.after },
    update: { quantityOnHand: change.after },
  });
  if (delta !== 0)
    await tx.stockMovement.create({
      data: {
        productVariantId: change.variantId,
        movementType: 'ADJUSTMENT',
        quantityDelta: delta,
      },
    });
}
