import { Injectable, NotFoundException } from '@nestjs/common';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  AdminInventoryDetail,
  AdminInventoryPage,
  InventoryPageQuery,
} from './dto/admin-inventory.dto.js';

const selection = {
  id: true,
  sku: true,
  product: { select: { name: true } },
  color: { select: { name: true } },
  size: { select: { code: true } },
  inventory: { select: { quantityOnHand: true } },
} satisfies Prisma.ProductVariantSelect;
type Variant = Prisma.ProductVariantGetPayload<{ select: typeof selection }>;

@Injectable()
export class AdminInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async rows(tx: Prisma.TransactionClient, variants: Variant[], asOf: Date) {
    const held = await tx.inventoryReservation.groupBy({
      by: ['productVariantId'],
      where: {
        productVariantId: { in: variants.map((v) => v.id) },
        releasedAt: null,
        expiresAt: { gt: asOf },
      },
      _sum: { quantity: true },
    });
    const amounts = new Map(held.map((v) => [v.productVariantId, v._sum.quantity ?? 0]));
    return variants.map((v) => {
      const quantityOnHand = v.inventory?.quantityOnHand ?? null;
      const reservedQuantity = amounts.get(v.id) ?? 0;
      return {
        id: v.id,
        sku: v.sku,
        productName: v.product.name,
        colorName: v.color.name,
        sizeCode: v.size.code,
        quantityOnHand,
        reservedQuantity,
        availableQuantity:
          quantityOnHand === null ? null : Math.max(0, quantityOnHand - reservedQuantity),
      };
    });
  }

  list(query: InventoryPageQuery): Promise<AdminInventoryPage> {
    return this.prisma.$transaction(
      async (tx) => {
        const asOf = new Date();
        const variants = await tx.productVariant.findMany({
          select: selection,
          orderBy: [{ sku: 'asc' }, { id: 'asc' }],
          skip: skipOf(query),
          take: query.pageSize,
        });
        const total = await tx.productVariant.count();
        return {
          ...toPage(await this.rows(tx, variants, asOf), total, query),
          asOf: asOf.toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  detail(id: string, query: InventoryPageQuery): Promise<AdminInventoryDetail> {
    return this.prisma.$transaction(
      async (tx) => {
        const asOf = new Date();
        const variant = await tx.productVariant.findUnique({ where: { id }, select: selection });
        if (!variant) throw new NotFoundException('Không tìm thấy biến thể');
        const items = await tx.stockMovement.findMany({
          where: { productVariantId: id },
          select: { id: true, movementType: true, quantityDelta: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: skipOf(query),
          take: query.pageSize,
        });
        const total = await tx.stockMovement.count({ where: { productVariantId: id } });
        const [row] = await this.rows(tx, [variant], asOf);
        return {
          ...row!,
          asOf: asOf.toISOString(),
          movements: toPage(
            items.map((v) => ({
              ...v,
              createdAt: v.createdAt.toISOString(),
            })),
            total,
            query,
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
