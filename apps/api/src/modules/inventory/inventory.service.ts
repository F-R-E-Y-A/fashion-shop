import { ConflictException, Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { commitStock, lockStock, type StockItem } from './inventory-operations.js';

export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';

/** Cart chi doc; Checkout dung reserve/release/commit trong transaction cua cung luong. */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(
    orderId: string,
    items: StockItem[],
    expiresAt: Date,
    tx: Prisma.TransactionClient,
  ) {
    await lockStock(tx, items);
    const available = await this.getAvailableQuantities(
      items.map((item) => item.variantId),
      tx,
    );
    if (items.some((item) => (available.get(item.variantId) ?? -1) < item.quantity)) {
      throw new ConflictException({
        error: 'STOCK_CHANGED',
        message: 'Hàng vừa thay đổi hoặc không còn đủ tồn. Vui lòng kiểm tra lại giỏ.',
      });
    }
    await tx.inventoryReservation.createMany({
      data: items.map((item) => ({
        orderId,
        productVariantId: item.variantId,
        quantity: item.quantity,
        expiresAt,
      })),
    });
  }

  async release(orderId: string, items: StockItem[], tx: Prisma.TransactionClient) {
    await lockStock(tx, items);
    await tx.inventoryReservation.updateMany({
      where: { orderId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
  }

  commit(orderId: string, items: StockItem[], tx: Prisma.TransactionClient) {
    return commitStock(tx, orderId, items);
  }

  /**
   * Hang da chot (SALE) nhung chua roi tay khach — khach huy truoc khi shop xu ly hoac COD giao
   * that bai — tro lai kho dung mot lan: dong RETURN unique theo (don, bien the) chan cong trung.
   * Hang da giao roi tra lai thuoc luong doi tra, khong di qua day (ADR-038).
   */
  async restock(orderId: string, items: StockItem[], tx: Prisma.TransactionClient) {
    await lockStock(tx, items);
    const sold = await tx.stockMovement.count({ where: { orderId, movementType: 'SALE' } });
    const returned = await tx.stockMovement.count({ where: { orderId, movementType: 'RETURN' } });
    if (!sold || returned) return false;
    for (const item of items) {
      await tx.inventory.update({
        where: { productVariantId: item.variantId },
        data: { quantityOnHand: { increment: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          orderId,
          productVariantId: item.variantId,
          movementType: 'RETURN',
          quantityDelta: item.quantity,
        },
      });
    }
    return true;
  }

  async getAvailableQuantities(
    variantIds: string[],
    transaction?: Prisma.TransactionClient,
  ): Promise<Map<string, number | null>> {
    const ids = [...new Set(variantIds)];
    const result = new Map<string, number | null>(ids.map((id) => [id, null]));
    if (ids.length === 0) return result;
    const db = transaction ?? this.prisma;
    const stock = await db.inventory.findMany({ where: { productVariantId: { in: ids } } });
    const held = await db.inventoryReservation.groupBy({
      by: ['productVariantId'],
      where: {
        productVariantId: { in: ids },
        releasedAt: null,
        expiresAt: { gt: new Date() },
      },
      _sum: { quantity: true },
    });
    const reservations = new Map(held.map((row) => [row.productVariantId, row._sum.quantity ?? 0]));
    for (const row of stock) {
      result.set(
        row.productVariantId,
        Math.max(0, row.quantityOnHand - (reservations.get(row.productVariantId) ?? 0)),
      );
    }
    return result;
  }

  async getStockStatuses(
    groups: { id: string; variantIds: string[] }[],
  ): Promise<Map<string, StockStatus>> {
    const quantities = await this.getAvailableQuantities(
      groups.flatMap((group) => group.variantIds),
    );
    return new Map(
      groups.map(({ id, variantIds }) => {
        const values = variantIds.map((variantId) => quantities.get(variantId) ?? null);
        const status: StockStatus = values.some((quantity) => quantity !== null && quantity > 0)
          ? 'IN_STOCK'
          : values.length === 0 || values.some((quantity) => quantity === null)
            ? 'UNKNOWN'
            : 'OUT_OF_STOCK';
        return [id, status];
      }),
    );
  }

  /**
   * Chi cong bo revision, khong cong bo order hay du lieu giu hang. Ghi vao inventory hoac
   * inventory_reservations tang inventory_revision_seq (ADR-037); giu hang het han khong sinh ghi
   * nao nen kem han som nhat con hieu luc: qua moc do thi revision doi theo.
   */
  async getAvailabilityRevision(): Promise<string> {
    const [row] = await this.prisma.$queryRaw<{ value: string }[]>`
      SELECT concat_ws(':', s.last_value, s.is_called, (
        SELECT min(r.expires_at) FROM public.inventory_reservations r
        WHERE r.released_at IS NULL AND r.expires_at > now()
      )) AS value
      FROM public.inventory_revision_seq s`;
    return row?.value ?? '';
  }
}
