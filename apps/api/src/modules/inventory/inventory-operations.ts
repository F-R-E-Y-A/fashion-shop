import { ConflictException } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';

export type StockItem = { variantId: string; quantity: number };

export async function lockStock(tx: Prisma.TransactionClient, items: StockItem[]) {
  for (const id of [...new Set(items.map((item) => item.variantId))].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory:${id}`}, 0))`;
  }
}

/** Chi chot reservation con han. Khong tu phuc hoi don da nhả hang khi callback den muon. */
export async function commitStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: StockItem[],
) {
  await lockStock(tx, items);
  const holds = await tx.inventoryReservation.findMany({ where: { orderId } });
  const stock = await tx.inventory.findMany({
    where: { productVariantId: { in: items.map((item) => item.variantId) } },
  });
  const now = new Date();
  if (
    items.some((item) => {
      const hold = holds.find((row) => row.productVariantId === item.variantId);
      return (
        !hold ||
        hold.releasedAt !== null ||
        hold.expiresAt <= now ||
        hold.quantity !== item.quantity ||
        (stock.find((row) => row.productVariantId === item.variantId)?.quantityOnHand ?? -1) <
          item.quantity
      );
    })
  )
    return false;
  for (const item of items) {
    const changed = await tx.inventory.updateMany({
      where: { productVariantId: item.variantId, quantityOnHand: { gte: item.quantity } },
      data: { quantityOnHand: { decrement: item.quantity } },
    });
    if (changed.count !== 1) throw new ConflictException('Tồn kho thay đổi khi chốt đơn.');
    await tx.stockMovement.create({
      data: {
        orderId,
        productVariantId: item.variantId,
        movementType: 'SALE',
        quantityDelta: -item.quantity,
      },
    });
  }
  await tx.inventoryReservation.updateMany({
    where: { orderId, releasedAt: null },
    data: { releasedAt: now },
  });
  return true;
}
