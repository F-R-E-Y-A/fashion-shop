import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  AdminAdjustStockDto,
  AdminInventoryDetail,
  AdminInventoryPage,
  AdminLowStockItem,
  AdminLowStockResponse,
  InventoryPageQuery,
  LowStockQuery,
} from './dto/admin-inventory.dto.js';
import { lockStock } from './inventory-operations.js';

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
          select: {
            id: true,
            movementType: true,
            quantityDelta: true,
            reason: true,
            createdAt: true,
          },
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

  adjust(
    id: string,
    dto: AdminAdjustStockDto,
    actorUserId?: string,
  ): Promise<AdminInventoryDetail> {
    return this.prisma.$transaction(
      async (tx) => {
        // Khoa bien the cung thu tu voi Checkout de tranh race condition;
        // dung ReadCommitted de sau khi lay duoc lock thi doc snapshot moi nhat (bao gom luong dat giu vua commit).
        await lockStock(tx, [{ variantId: id, quantity: 0 }]);
        const asOf = new Date();

        const variant = await tx.productVariant.findUnique({
          where: { id },
          select: selection,
        });
        if (!variant) throw new NotFoundException('Không tìm thấy biến thể');

        const currentQty = variant.inventory?.quantityOnHand ?? null;
        const trimmedReason = dto.reason.trim();

        if (dto.requestKey && typeof tx.stockMovement.findUnique === 'function') {
          const prior = await tx.stockMovement.findUnique({
            where: { requestKey: dto.requestKey },
          });
          if (prior) {
            if (
              prior.productVariantId !== id ||
              prior.movementType !== dto.type ||
              prior.reason !== trimmedReason ||
              (dto.type === 'RECEIPT' && prior.quantityDelta !== dto.quantity) ||
              (dto.type === 'ADJUSTMENT' && currentQty !== null && currentQty !== dto.quantity)
            ) {
              throw new ConflictException(
                'Mã yêu cầu (requestKey) đã được sử dụng cho thao tác điều chỉnh khác.',
              );
            }
            const held = await tx.inventoryReservation.groupBy({
              by: ['productVariantId'],
              where: {
                productVariantId: id,
                releasedAt: null,
                expiresAt: { gt: asOf },
              },
              _sum: { quantity: true },
            });
            const reservedQuantity = held[0]?._sum.quantity ?? 0;
            const items = await tx.stockMovement.findMany({
              where: { productVariantId: id },
              select: {
                id: true,
                movementType: true,
                quantityDelta: true,
                reason: true,
                createdAt: true,
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 12,
            });
            const total = await tx.stockMovement.count({ where: { productVariantId: id } });
            const effectiveQty = currentQty ?? 0;
            const availableQuantity = Math.max(0, effectiveQty - reservedQuantity);
            return {
              id: variant.id,
              sku: variant.sku,
              productName: variant.product.name,
              colorName: variant.color.name,
              sizeCode: variant.size.code,
              quantityOnHand: effectiveQty,
              reservedQuantity,
              availableQuantity,
              asOf: asOf.toISOString(),
              movements: toPage(
                items.map((v) => ({
                  ...v,
                  createdAt: v.createdAt.toISOString(),
                })),
                total,
                { page: 1, pageSize: 12 },
              ),
            };
          }
        }

        let afterQty: number;
        let delta: number;

        if (dto.type === 'RECEIPT') {
          if (dto.quantity <= 0) {
            throw new BadRequestException('Số lượng nhập hàng phải lớn hơn 0');
          }
          afterQty = (currentQty ?? 0) + dto.quantity;
          delta = dto.quantity;
        } else if (dto.type === 'ADJUSTMENT') {
          if (dto.quantity < 0) {
            throw new BadRequestException('Số lượng kiểm kê không được âm');
          }
          if (currentQty !== null && currentQty === dto.quantity) {
            throw new BadRequestException('Số lượng kiểm kê trùng khớp với tồn hiện tại');
          }
          afterQty = dto.quantity;
          delta = afterQty - (currentQty ?? 0);
          if (delta === 0) {
            throw new BadRequestException('Số lượng kiểm kê trùng khớp với tồn hiện tại');
          }
        } else {
          throw new BadRequestException('Loại thao tác không hợp lệ');
        }

        if (afterQty > 1_000_000) {
          throw new BadRequestException('Tồn kho tối đa không được vượt quá 1.000.000');
        }

        // Kiem tra luong dang giu cho don hang chua thanh toan hoac cho xac nhan
        const held = await tx.inventoryReservation.groupBy({
          by: ['productVariantId'],
          where: {
            productVariantId: id,
            releasedAt: null,
            expiresAt: { gt: asOf },
          },
          _sum: { quantity: true },
        });
        const reservedQuantity = held[0]?._sum.quantity ?? 0;

        if (afterQty < reservedQuantity) {
          throw new BadRequestException(
            `Không thể điều chỉnh tồn kho (${afterQty}) nhỏ hơn số lượng đang giữ cho đơn hàng (${reservedQuantity})`,
          );
        }

        await tx.inventory.upsert({
          where: { productVariantId: id },
          create: { productVariantId: id, quantityOnHand: afterQty },
          update: { quantityOnHand: afterQty },
        });

        try {
          await tx.stockMovement.create({
            data: {
              productVariantId: id,
              movementType: dto.type,
              quantityDelta: delta,
              reason: trimmedReason,
              actorUserId: actorUserId ?? null,
              ...(dto.requestKey ? { requestKey: dto.requestKey } : {}),
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException(
              'Mã yêu cầu (requestKey) đã được sử dụng cho thao tác điều chỉnh khác.',
            );
          }
          throw error;
        }

        const items = await tx.stockMovement.findMany({
          where: { productVariantId: id },
          select: {
            id: true,
            movementType: true,
            quantityDelta: true,
            reason: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 12,
        });
        const total = await tx.stockMovement.count({ where: { productVariantId: id } });
        const availableQuantity = Math.max(0, afterQty - reservedQuantity);

        return {
          id: variant.id,
          sku: variant.sku,
          productName: variant.product.name,
          colorName: variant.color.name,
          sizeCode: variant.size.code,
          quantityOnHand: afterQty,
          reservedQuantity,
          availableQuantity,
          asOf: asOf.toISOString(),
          movements: toPage(
            items.map((v) => ({
              ...v,
              createdAt: v.createdAt.toISOString(),
            })),
            total,
            { page: 1, pageSize: 12 },
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
