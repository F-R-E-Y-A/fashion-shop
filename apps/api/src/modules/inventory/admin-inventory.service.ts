import { Injectable, NotFoundException } from '@nestjs/common';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  AdminInventoryDetail,
  AdminInventoryPage,
  AdminLowStockItem,
  AdminLowStockResponse,
  InventoryPageQuery,
  LowStockQuery,
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

  lowStock(query: LowStockQuery): Promise<AdminLowStockResponse> {
    const threshold = query.threshold ?? 5;
    const limit = query.limit ?? 5;
    return this.prisma.$transaction(
      async (tx) => {
        const asOf = new Date();
        const items = await tx.$queryRaw<AdminLowStockItem[]>`
          SELECT
            pv.id::text AS "id",
            pv.sku,
            p.name AS "productName",
            c.name AS "colorName",
            s.code AS "sizeCode",
            i.quantity_on_hand::int AS "quantityOnHand",
            COALESCE(r.reserved, 0)::int AS "reservedQuantity",
            GREATEST(0, i.quantity_on_hand - COALESCE(r.reserved, 0))::int AS "availableQuantity"
          FROM product_variants pv
          INNER JOIN inventory i ON i.product_variant_id = pv.id
          INNER JOIN products p ON p.id = pv.product_id
          INNER JOIN colors c ON c.id = pv.color_id
          INNER JOIN sizes s ON s.id = pv.size_id
          LEFT JOIN (
            SELECT product_variant_id, SUM(quantity)::int AS reserved
            FROM inventory_reservations
            WHERE released_at IS NULL AND expires_at > ${asOf}
            GROUP BY product_variant_id
          ) r ON r.product_variant_id = pv.id
          WHERE GREATEST(0, i.quantity_on_hand - COALESCE(r.reserved, 0)) <= ${threshold}
          ORDER BY "availableQuantity" ASC, pv.sku ASC, pv.id ASC
          LIMIT ${limit}
        `;

        const countResult = await tx.$queryRaw<Array<{ count: string | number | bigint }>>`
          SELECT COUNT(*)::text AS count
          FROM product_variants pv
          INNER JOIN inventory i ON i.product_variant_id = pv.id
          LEFT JOIN (
            SELECT product_variant_id, SUM(quantity)::int AS reserved
            FROM inventory_reservations
            WHERE released_at IS NULL AND expires_at > ${asOf}
            GROUP BY product_variant_id
          ) r ON r.product_variant_id = pv.id
          WHERE GREATEST(0, i.quantity_on_hand - COALESCE(r.reserved, 0)) <= ${threshold}
        `;

        const total = Number(countResult[0]?.count ?? 0);
        return {
          items,
          total,
          threshold,
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
