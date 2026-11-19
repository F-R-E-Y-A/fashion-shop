import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  AdminProductDetail,
  AdminProductPage,
  AdminProductSummary,
  AdminProductVariant,
} from './dto/admin-product.response.js';
import type { AdminVariantOptionsResponse } from './dto/admin-variant-options.response.js';
import type {
  AdminProductContent,
  ChangeProductContentDto,
} from './dto/change-product-content.dto.js';
import type {
  AdminProductStatus,
  ChangeProductStatusDto,
} from './dto/change-product-status.dto.js';
import type { CreateProductVariantDto } from './dto/create-product-variant.dto.js';
import type { ListAdminProductsQuery } from './dto/list-admin-products.query.js';
import type { UpdateProductVariantDto } from './dto/update-product-variant.dto.js';
import { adminContentChange } from './product-content.js';
import { lockProductStatus, productStatusChange } from './product-status.js';

const colorSelect = { code: true, name: true, hex: true } as const;
const summarySelect = {
  id: true,
  name: true,
  slug: true,
  priceFrom: true,
  isActive: true,
  adminDisabled: true,
  statusVersion: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true, isActive: true } },
  brand: { select: { id: true, name: true } },
  images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1, select: { url: true } },
} satisfies Prisma.ProductSelect;

const detailSelect = {
  ...summarySelect,
  contentVersion: true,
  adminContentFields: true,
  description: true,
  material: true,
  careInstructions: true,
  isFeatured: true,
  audience: true,
  updatedAt: true,
  images: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, url: true, alt: true, sortOrder: true, color: { select: colorSelect } },
  },
  variants: {
    orderBy: [{ size: { sortOrder: 'asc' } }, { color: { code: 'asc' } }, { id: 'asc' }],
    select: {
      id: true,
      sku: true,
      isActive: true,
      isCustom: true,
      adminManagedFields: true,
      updatedAt: true,
      listPrice: true,
      salePrice: true,
      colorId: true,
      sizeId: true,
      size: { select: { code: true } },
      color: { select: colorSelect },
    },
  },
} satisfies Prisma.ProductSelect;

type SummaryRow = Prisma.ProductGetPayload<{ select: typeof summarySelect }>;
function toSummary(row: SummaryRow): AdminProductSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    brand: row.brand,
    priceFrom: row.priceFrom.toString(),
    isActive: row.isActive,
    adminDisabled: row.adminDisabled,
    statusVersion: row.statusVersion,
    createdAt: row.createdAt.toISOString(),
    imageUrl: row.images[0]?.url ?? null,
  };
}

function toVariantResponse(v: {
  id: string;
  sku: string;
  colorId?: string;
  sizeId?: string;
  isActive: boolean;
  isCustom: boolean;
  adminManagedFields: string[];
  updatedAt: Date;
  listPrice: Prisma.Decimal;
  salePrice: Prisma.Decimal | null;
  color: { code: string; name: string; hex: string | null };
  size?: { code: string };
  sizeCode?: string;
}): AdminProductVariant {
  return {
    id: v.id,
    sku: v.sku,
    ...(v.colorId !== undefined ? { colorId: v.colorId } : {}),
    ...(v.sizeId !== undefined ? { sizeId: v.sizeId } : {}),
    isActive: v.isActive,
    isCustom: v.isCustom,
    adminManagedFields: v.adminManagedFields,
    updatedAt: v.updatedAt.toISOString(),
    listPrice: v.listPrice.toString(),
    salePrice: v.salePrice?.toString() ?? null,
    color: v.color,
    sizeCode: v.size?.code ?? v.sizeCode ?? '',
  };
}

function toIsoString(date: Date | string): string {
  if (date instanceof Date) return date.toISOString();
  return new Date(date).toISOString();
}

function parseMoney(val: unknown, fieldName: string): Prisma.Decimal {
  if (typeof val !== 'string' && typeof val !== 'number') {
    throw new BadRequestException(`${fieldName} phải là chuỗi số tiền hợp lệ`);
  }
  const s = String(val).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new BadRequestException(`${fieldName} phải là chuỗi số tiền hợp lệ`);
  }
  const num = Number(s);
  if (!Number.isFinite(num) || num <= 0 || num > 999_999_999) {
    throw new BadRequestException(`${fieldName} phải là số tiền hợp lệ (> 0 và <= 999.999.999)`);
  }
  return new Prisma.Decimal(s);
}

@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async getVariantOptions(): Promise<AdminVariantOptionsResponse> {
    const [colors, sizes] = await Promise.all([
      this.prisma.color.findMany({
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, hex: true },
      }),
      this.prisma.size.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, code: true, sortOrder: true },
      }),
    ]);
    return { colors, sizes };
  }

  async createVariant(
    productId: string,
    input: CreateProductVariantDto,
  ): Promise<AdminProductVariant> {
    const listPrice = parseMoney(input.listPrice, 'listPrice');
    let salePrice: Prisma.Decimal | null = null;
    if (input.salePrice !== undefined && input.salePrice !== null) {
      salePrice = parseMoney(input.salePrice, 'salePrice');
      if (salePrice.equals(listPrice)) {
        salePrice = null;
      } else if (salePrice.gt(listPrice)) {
        throw new BadRequestException('salePrice phải nhỏ hơn listPrice');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await lockProductStatus(tx, productId);
        if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

        // Idempotency: Kiểm tra nếu id đã tồn tại
        const existingById = await tx.productVariant.findUnique({
          where: { id: input.id },
          include: {
            color: { select: colorSelect },
            size: { select: { code: true } },
          },
        });

        if (existingById) {
          const isSameProduct = existingById.productId === productId;
          const isSameColor = existingById.colorId === input.colorId;
          const isSameSize = existingById.sizeId === input.sizeId;
          const isSameSku = existingById.sku === input.sku;
          const isSameList = existingById.listPrice.equals(listPrice);
          const isSameSale =
            (existingById.salePrice === null && salePrice === null) ||
            (existingById.salePrice !== null &&
              salePrice !== null &&
              existingById.salePrice.equals(salePrice));
          const isSameActive = existingById.isActive === (input.isActive ?? true);

          if (
            isSameProduct &&
            isSameColor &&
            isSameSize &&
            isSameSku &&
            isSameList &&
            isSameSale &&
            isSameActive
          ) {
            return toVariantResponse(existingById);
          }
          throw new ConflictException({
            error: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            message: 'ID biến thể đã tồn tại với thông tin khác.',
          });
        }

        // Kiểm tra trùng SKU
        const existingBySku = await tx.productVariant.findUnique({
          where: { sku: input.sku },
        });
        if (existingBySku) {
          throw new ConflictException({
            error: 'SKU_EXISTS',
            message: 'Mã SKU đã tồn tại trên hệ thống.',
          });
        }

        // Kiểm tra trùng tổ hợp màu/cỡ
        const existingByCombo = await tx.productVariant.findUnique({
          where: {
            productId_colorId_sizeId: {
              productId,
              colorId: input.colorId,
              sizeId: input.sizeId,
            },
          },
        });
        if (existingByCombo) {
          throw new ConflictException({
            error: 'COMBINATION_EXISTS',
            message: 'Sản phẩm đã có biến thể với màu và cỡ này.',
          });
        }

        // Kiểm tra color và size tồn tại
        const [color, size] = await Promise.all([
          tx.color.findUnique({ where: { id: input.colorId } }),
          tx.size.findUnique({ where: { id: input.sizeId } }),
        ]);
        if (!color) throw new NotFoundException('Không tìm thấy màu sắc');
        if (!size) throw new NotFoundException('Không tìm thấy kích cỡ');

        const created = await tx.productVariant.create({
          data: {
            id: input.id,
            productId,
            colorId: input.colorId,
            sizeId: input.sizeId,
            sku: input.sku,
            listPrice,
            salePrice,
            isActive: input.isActive ?? true,
            isCustom: true,
            adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
          },
          include: {
            color: { select: colorSelect },
            size: { select: { code: true } },
          },
        });

        // Tính lại priceFrom
        const activeVariants = await tx.productVariant.findMany({
          where: { productId, isActive: true },
          select: { listPrice: true, salePrice: true },
        });
        let newPriceFrom: Prisma.Decimal;
        if (activeVariants.length > 0) {
          newPriceFrom = Prisma.Decimal.min(
            ...activeVariants.map((v) => v.salePrice ?? v.listPrice),
          );
        } else {
          const allVariants = await tx.productVariant.findMany({
            where: { productId },
            select: { listPrice: true, salePrice: true },
          });
          newPriceFrom =
            allVariants.length > 0
              ? Prisma.Decimal.min(...allVariants.map((v) => v.salePrice ?? v.listPrice))
              : listPrice;
        }

        await tx.product.update({
          where: { id: productId },
          data: { priceFrom: newPriceFrom },
        });

        return toVariantResponse(created);
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[]) ?? [];
        if (target.includes('sku') || String(err.message).includes('sku')) {
          throw new ConflictException({
            error: 'SKU_EXISTS',
            message: 'Mã SKU đã tồn tại trên hệ thống.',
          });
        }
        throw new ConflictException({
          error: 'COMBINATION_EXISTS',
          message: 'Sản phẩm đã có biến thể với màu và cỡ này.',
        });
      }
      throw err;
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: UpdateProductVariantDto,
  ): Promise<AdminProductVariant> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await lockProductStatus(tx, productId);
        if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

        const variant = await tx.productVariant.findUnique({
          where: { id: variantId },
          include: {
            color: { select: colorSelect },
            size: { select: { code: true } },
          },
        });
        if (!variant || variant.productId !== productId) {
          throw new NotFoundException('Không tìm thấy biến thể');
        }

        // CAS Check
        const currentIso = toIsoString(variant.updatedAt);
        if (currentIso !== input.expectedUpdatedAt) {
          throw new ConflictException({
            error: 'CONCURRENT_MODIFICATION',
            message: 'Biến thể đã được cập nhật bởi thao tác khác. Vui lòng tải lại.',
          });
        }

        // No-op Check
        const parsedInputList =
          input.listPrice !== undefined ? parseMoney(input.listPrice, 'listPrice') : undefined;
        let parsedInputSale: Prisma.Decimal | null | undefined = undefined;
        if (input.salePrice !== undefined) {
          parsedInputSale =
            input.salePrice !== null ? parseMoney(input.salePrice, 'salePrice') : null;
          const effectiveList = parsedInputList ?? variant.listPrice;
          if (parsedInputSale !== null && parsedInputSale.equals(effectiveList)) {
            parsedInputSale = null;
          }
        }

        const isListSame =
          parsedInputList === undefined || variant.listPrice.equals(parsedInputList);
        const isSaleSame =
          parsedInputSale === undefined ||
          (variant.salePrice === null && parsedInputSale === null) ||
          (variant.salePrice !== null &&
            parsedInputSale !== null &&
            variant.salePrice.equals(parsedInputSale));
        const isActiveSame = input.isActive === undefined || variant.isActive === input.isActive;

        if (isListSame && isSaleSame && isActiveSame) {
          return toVariantResponse(variant);
        }

        // Validate prices
        const targetList = parsedInputList ?? variant.listPrice;
        let targetSale = variant.salePrice;
        if (input.salePrice !== undefined) {
          targetSale = parsedInputSale ?? null;
        }
        if (targetSale !== null) {
          if (targetSale.equals(targetList)) {
            targetSale = null;
          } else if (targetSale.gt(targetList)) {
            throw new BadRequestException('salePrice phải nhỏ hơn listPrice');
          }
        }

        // Chặn tắt biến thể cuối cùng nếu sản phẩm đang mở bán
        if (input.isActive === false && variant.isActive === true) {
          if (product.isActive) {
            const activeCount = await tx.productVariant.count({
              where: { productId, isActive: true },
            });
            if (activeCount <= 1) {
              throw new UnprocessableEntityException({
                error: 'LAST_ACTIVE_VARIANT_BLOCKED',
                message:
                  'Không thể ngừng bán biến thể hoạt động cuối cùng của sản phẩm đang mở bán. Vui lòng chuyển trạng thái sản phẩm sang Ngừng bán trước.',
              });
            }
          }
        }

        const saleChanged =
          targetSale === null
            ? variant.salePrice !== null
            : variant.salePrice === null || !targetSale.equals(variant.salePrice);

        // Cập nhật adminManagedFields
        const fieldsToManage: string[] = [];
        if (input.listPrice !== undefined) fieldsToManage.push('listPrice');
        if (input.salePrice !== undefined || saleChanged) fieldsToManage.push('salePrice');
        if (input.isActive !== undefined) fieldsToManage.push('isActive');
        const newAdminManagedFields = Array.from(
          new Set([...variant.adminManagedFields, ...fieldsToManage]),
        );

        const updated = await tx.productVariant.update({
          where: { id: variantId },
          data: {
            ...(input.listPrice !== undefined ? { listPrice: targetList } : {}),
            ...(input.salePrice !== undefined || saleChanged ? { salePrice: targetSale } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            adminManagedFields: newAdminManagedFields,
          },
          include: {
            color: { select: colorSelect },
            size: { select: { code: true } },
          },
        });

        // Tính lại priceFrom
        const activeVariants = await tx.productVariant.findMany({
          where: { productId, isActive: true },
          select: { listPrice: true, salePrice: true },
        });
        let newPriceFrom: Prisma.Decimal;
        if (activeVariants.length > 0) {
          newPriceFrom = Prisma.Decimal.min(
            ...activeVariants.map((v) => v.salePrice ?? v.listPrice),
          );
        } else {
          const allVariants = await tx.productVariant.findMany({
            where: { productId },
            select: { listPrice: true, salePrice: true },
          });
          newPriceFrom =
            allVariants.length > 0
              ? Prisma.Decimal.min(...allVariants.map((v) => v.salePrice ?? v.listPrice))
              : targetList;
        }

        await tx.product.update({
          where: { id: productId },
          data: { priceFrom: newPriceFrom },
        });

        return toVariantResponse(updated);
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[]) ?? [];
        if (target.includes('sku') || String(err.message).includes('sku')) {
          throw new ConflictException({
            error: 'SKU_EXISTS',
            message: 'Mã SKU đã tồn tại trên hệ thống.',
          });
        }
        throw new ConflictException({
          error: 'COMBINATION_EXISTS',
          message: 'Sản phẩm đã có biến thể với màu và cỡ này.',
        });
      }
      throw err;
    }
  }

  async changeStatus(id: string, input: ChangeProductStatusDto): Promise<AdminProductStatus> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockProductStatus(tx, id);
      if (!before) throw new NotFoundException('Không tìm thấy sản phẩm');
      if (before.statusVersion !== input.expectedVersion)
        throw new ConflictException('Trạng thái đã thay đổi. Tải lại và xác nhận lại.');

      const activeVariantsCount = await tx.productVariant.count({
        where: { productId: id, isActive: true },
      });
      if (!input.adminDisabled && activeVariantsCount === 0) {
        throw new UnprocessableEntityException({
          error: 'NO_ACTIVE_VARIANTS_FOR_ACTIVE_PRODUCT',
          message:
            'Không thể mở bán sản phẩm khi chưa có biến thể nào đang hoạt động. Vui lòng bật ít nhất một biến thể trước.',
        });
      }

      const hasImages = (await tx.productImage.count({ where: { productId: id } })) > 0;
      const data = productStatusChange(
        before,
        input.adminDisabled,
        hasImages,
        activeVariantsCount > 0,
      );
      const select = {
        id: true,
        name: true,
        isActive: true,
        adminDisabled: true,
        statusVersion: true,
      } as const;
      // Cung muc tieu thi khong doi updatedAt hoac tao revision SSE vo co.
      if (!data.statusVersion) return tx.product.findUniqueOrThrow({ where: { id }, select });
      return tx.product.update({
        where: { id, statusVersion: input.expectedVersion },
        data,
        select,
      });
    });
  }

  async changeContent(id: string, input: ChangeProductContentDto): Promise<AdminProductContent> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockProductStatus(tx, id);
      if (!before) throw new NotFoundException('Không tìm thấy sản phẩm');
      if (before.contentVersion !== input.expectedVersion)
        throw new ConflictException('Nội dung đã thay đổi. Tải bản mới trước khi lưu.');
      const data = adminContentChange(before, input);
      const select = {
        id: true,
        name: true,
        description: true,
        material: true,
        careInstructions: true,
        contentVersion: true,
        adminContentFields: true,
      } as const;
      if (!data) return tx.product.findUniqueOrThrow({ where: { id }, select });
      return tx.product.update({
        where: { id, contentVersion: input.expectedVersion },
        data,
        select,
      });
    });
  }

  async list(query: ListAdminProductsQuery): Promise<AdminProductPage> {
    const pattern = query.q?.replace(/[\\%_]/g, (char) => `\\${char}`);
    const where: Prisma.ProductWhereInput = {
      ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
      ...(pattern
        ? {
            OR: [
              { name: { contains: pattern, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: pattern, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      query.sort === 'name_asc'
        ? [{ name: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'asc' }];
    const [total, rows] = await this.prisma.$transaction(
      [
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where,
          select: summarySelect,
          orderBy,
          skip: skipOf(query),
          take: query.pageSize,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return toPage(rows.map(toSummary), total, query);
  }

  async findById(id: string): Promise<AdminProductDetail> {
    const row = await this.prisma.product.findUnique({ where: { id }, select: detailSelect });
    if (!row) throw new NotFoundException('Không tìm thấy sản phẩm');
    return {
      ...toSummary(row),
      contentVersion: row.contentVersion,
      adminContentFields: row.adminContentFields,
      description: row.description,
      material: row.material,
      careInstructions: row.careInstructions,
      isFeatured: row.isFeatured,
      audience: row.audience,
      updatedAt: row.updatedAt.toISOString(),
      variants: row.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        colorId: v.colorId,
        sizeId: v.sizeId,
        isActive: v.isActive,
        isCustom: v.isCustom ?? false,
        adminManagedFields: v.adminManagedFields ?? [],
        updatedAt: v.updatedAt
          ? v.updatedAt instanceof Date
            ? v.updatedAt.toISOString()
            : String(v.updatedAt)
          : new Date().toISOString(),
        listPrice: v.listPrice.toString(),
        salePrice: v.salePrice?.toString() ?? null,
        color: v.color,
        sizeCode: v.size?.code ?? (v as { sizeCode?: string }).sizeCode ?? '',
      })),
      images: row.images,
    };
  }
}
