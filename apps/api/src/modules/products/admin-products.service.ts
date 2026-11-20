import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { type ResolvedMedia, UploadsService, type UploadTicketResponse } from '../uploads/index.js';
import {
  CategoryLockSetChangedError,
  isUniqueViolationError,
  lockCategoriesOrdered,
  lockCategory,
  runCategoryTxWithRetry,
  slugifyCategoryName,
} from './category-visibility.js';
import type { AdminCreateOptionsResponse } from './dto/admin-create-options.response.js';
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
import { CATEGORY_SLUG_REGEX } from './dto/create-category.dto.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { CreateProductVariantDto } from './dto/create-product-variant.dto.js';
import type { ListAdminProductsQuery } from './dto/list-admin-products.query.js';
import {
  type AdminProductImagesResponse,
  MAX_PRODUCT_IMAGES,
  type UpdateProductImagesDto,
} from './dto/update-product-images.dto.js';
import type { UpdateProductVariantDto } from './dto/update-product-variant.dto.js';
import { adminContentChange, CONTENT_FIELDS } from './product-content.js';
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
  imagesVersion: true,
  imagesManagedByAdmin: true,
  isCustom: true,
  createPayloadHash: true,
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly uploads?: UploadsService,
  ) {}

  async createUploadTicket(actorId: string): Promise<UploadTicketResponse> {
    if (!this.uploads) {
      throw new Error('UploadsService chưa được cấu hình');
    }
    return this.uploads.ticket(actorId, 'product');
  }

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

  async getCreateOptions(): Promise<AdminCreateOptionsResponse> {
    const [brands, colors, sizes] = await Promise.all([
      this.prisma.brand.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.color.findMany({
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, hex: true },
      }),
      this.prisma.size.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, code: true, sortOrder: true },
      }),
    ]);
    return { brands, colors, sizes };
  }

  async createProduct(actorId: string, input: CreateProductDto): Promise<AdminProductDetail> {
    const normalizedName = input.name.trim();
    const normalizedSlug = input.slug ?? slugifyCategoryName(normalizedName);
    if (
      normalizedSlug.length < 2 ||
      normalizedSlug.length > 120 ||
      !CATEGORY_SLUG_REGEX.test(normalizedSlug)
    ) {
      throw new BadRequestException(
        'Không thể sinh slug hợp lệ từ tên sản phẩm; vui lòng nhập slug rõ ràng.',
      );
    }

    const normalizedBrandId = input.brandId ?? null;
    const normalizedDescription = input.description ?? null;
    const normalizedMaterial = input.material ?? null;
    const normalizedCare = input.careInstructions ?? null;
    const normalizedAudience = input.audience ?? null;
    const normalizedFeatured = input.isFeatured ?? false;

    if (!Array.isArray(input.variants) || input.variants.length === 0) {
      throw new BadRequestException('Sản phẩm phải có ít nhất một biến thể');
    }

    const seenVariantIds = new Set<string>();
    const seenSkus = new Set<string>();
    const seenCombos = new Set<string>();
    const normalizedVariants = input.variants.map((v) => {
      if (seenVariantIds.has(v.id)) {
        throw new BadRequestException('Danh sách biến thể chứa id trùng lặp');
      }
      seenVariantIds.add(v.id);
      if (seenSkus.has(v.sku)) {
        throw new BadRequestException(`Mã SKU "${v.sku}" bị lặp trong cùng yêu cầu`);
      }
      seenSkus.add(v.sku);
      const comboKey = `${v.colorId}:${v.sizeId}`;
      if (seenCombos.has(comboKey)) {
        throw new BadRequestException('Danh sách biến thể chứa cặp màu và cỡ trùng lặp');
      }
      seenCombos.add(comboKey);

      const listPrice = parseMoney(v.listPrice, 'listPrice');
      let salePrice: Prisma.Decimal | null = null;
      if (v.salePrice !== undefined && v.salePrice !== null) {
        salePrice = parseMoney(v.salePrice, 'salePrice');
        if (salePrice.equals(listPrice)) {
          salePrice = null;
        } else if (salePrice.gt(listPrice)) {
          throw new BadRequestException('salePrice phải nhỏ hơn listPrice');
        }
      }
      return {
        id: v.id,
        colorId: v.colorId,
        sizeId: v.sizeId,
        sku: v.sku,
        listPrice,
        salePrice,
        isActive: v.isActive ?? true,
      };
    });

    const rawImages = input.images ?? [];
    if (rawImages.length > MAX_PRODUCT_IMAGES) {
      throw new UnprocessableEntityException({
        error: 'IMAGE_LIMIT_EXCEEDED',
        message: `Chỉ được đính kèm tối đa ${MAX_PRODUCT_IMAGES} ảnh khi tạo sản phẩm`,
      });
    }
    const seenImageIds = new Set<string>();
    const seenImageKeys = new Set<string>();
    const normalizedImages = rawImages.map((img) => {
      if (seenImageIds.has(img.id)) {
        throw new BadRequestException('Danh sách ảnh chứa id trùng lặp');
      }
      seenImageIds.add(img.id);
      if (seenImageKeys.has(img.key)) {
        throw new BadRequestException('Danh sách ảnh chứa khóa tải lên trùng lặp');
      }
      seenImageKeys.add(img.key);
      return {
        id: img.id,
        key: img.key,
        alt: img.alt ?? null,
      };
    });

    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          id: input.id,
          name: normalizedName,
          slug: normalizedSlug,
          categoryId: input.categoryId,
          brandId: normalizedBrandId,
          description: normalizedDescription,
          material: normalizedMaterial,
          careInstructions: normalizedCare,
          audience: normalizedAudience,
          isFeatured: normalizedFeatured,
          variants: normalizedVariants.map((v) => ({
            id: v.id,
            colorId: v.colorId,
            sizeId: v.sizeId,
            sku: v.sku,
            listPrice: v.listPrice.toString(),
            salePrice: v.salePrice?.toString() ?? null,
            isActive: v.isActive,
          })),
          images: normalizedImages,
        }),
      )
      .digest('hex');

    // Đối chiếu UUID với dấu vết bất biến TRƯỚC khi gọi UploadsService.resolveMedia
    const prior = await this.prisma.product.findUnique({
      where: { id: input.id },
      select: { id: true, createPayloadHash: true },
    });
    if (prior) {
      if (prior.createPayloadHash === requestHash) {
        return this.findById(input.id);
      }
      throw new ConflictException({
        error: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        message: 'ID sản phẩm đã tồn tại với thông tin tạo ban đầu khác.',
      });
    }

    const imageKeys = normalizedImages.map((img) => img.key);
    let resolvedMedia: ResolvedMedia[] = [];
    if (imageKeys.length > 0) {
      if (!this.uploads) {
        throw new ServiceUnavailableException('Dịch vụ lưu trữ ảnh chưa được cấu hình');
      }
      resolvedMedia = await this.uploads.resolveMedia(actorId, 'product', imageKeys);
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtextextended(${`product-create:${input.id}`}, 0))
          `;

          const existingInTx = await tx.product.findUnique({
            where: { id: input.id },
            select: { id: true, createPayloadHash: true },
          });
          if (existingInTx) {
            if (existingInTx.createPayloadHash === requestHash) {
              return this.findDetailInTx(tx, input.id);
            }
            throw new ConflictException({
              error: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
              message: 'ID sản phẩm đã tồn tại với thông tin tạo ban đầu khác.',
            });
          }

          const category = await lockCategory(tx, input.categoryId);
          if (!category) {
            throw new NotFoundException('Không tìm thấy danh mục');
          }
          const childCount = await tx.category.count({ where: { parentId: input.categoryId } });
          if (childCount > 0) {
            throw new UnprocessableEntityException({
              error: 'CATEGORY_NOT_LEAF',
              message: 'Chỉ được gắn sản phẩm vào danh mục lá (danh mục không có danh mục con).',
            });
          }

          if (normalizedBrandId) {
            const brand = await tx.brand.findUnique({
              where: { id: normalizedBrandId },
              select: { id: true },
            });
            if (!brand) throw new NotFoundException('Không tìm thấy thương hiệu');
          }

          const uniqueColorIds = [...new Set(normalizedVariants.map((v) => v.colorId))];
          const uniqueSizeIds = [...new Set(normalizedVariants.map((v) => v.sizeId))];
          const [colors, sizes] = await Promise.all([
            tx.color.findMany({ where: { id: { in: uniqueColorIds } }, select: { id: true } }),
            tx.size.findMany({ where: { id: { in: uniqueSizeIds } }, select: { id: true } }),
          ]);
          if (colors.length !== uniqueColorIds.length) {
            throw new NotFoundException('Không tìm thấy màu sắc');
          }
          if (sizes.length !== uniqueSizeIds.length) {
            throw new NotFoundException('Không tìm thấy kích cỡ');
          }

          const [slugConflict, skuConflict, variantIdConflict, imageIdConflict] = await Promise.all(
            [
              tx.product.findUnique({ where: { slug: normalizedSlug }, select: { id: true } }),
              tx.productVariant.findFirst({
                where: { sku: { in: [...seenSkus] } },
                select: { id: true, sku: true },
              }),
              tx.productVariant.findFirst({
                where: { id: { in: [...seenVariantIds] } },
                select: { id: true },
              }),
              seenImageIds.size > 0
                ? tx.productImage.findFirst({
                    where: { id: { in: [...seenImageIds] } },
                    select: { id: true },
                  })
                : Promise.resolve(null),
            ],
          );
          if (slugConflict) {
            throw new ConflictException({
              error: 'SLUG_EXISTS',
              message: 'Slug sản phẩm đã tồn tại trên hệ thống.',
            });
          }
          if (skuConflict) {
            throw new ConflictException({
              error: 'SKU_EXISTS',
              message: `Mã SKU "${skuConflict.sku}" đã tồn tại trên hệ thống.`,
            });
          }
          if (variantIdConflict) {
            throw new ConflictException({
              error: 'VARIANT_ID_EXISTS',
              message: 'ID biến thể đã tồn tại trên hệ thống.',
            });
          }
          if (imageIdConflict) {
            throw new ConflictException({
              error: 'IMAGE_ID_EXISTS',
              message: 'ID ảnh đã tồn tại trên hệ thống.',
            });
          }

          const activeVariants = normalizedVariants.filter((v) => v.isActive);
          const priceSource = activeVariants.length > 0 ? activeVariants : normalizedVariants;
          const priceFrom = Prisma.Decimal.min(
            ...priceSource.map((v) => v.salePrice ?? v.listPrice),
          );

          await tx.product.create({
            data: {
              id: input.id,
              categoryId: input.categoryId,
              brandId: normalizedBrandId,
              name: normalizedName,
              slug: normalizedSlug,
              description: normalizedDescription,
              material: normalizedMaterial,
              careInstructions: normalizedCare,
              audience: normalizedAudience,
              isFeatured: normalizedFeatured,
              priceFrom,
              isActive: false,
              adminDisabled: true,
              statusVersion: 0,
              contentVersion: 0,
              adminContentFields: [...CONTENT_FIELDS],
              imagesVersion: resolvedMedia.length > 0 ? 1 : 0,
              imagesManagedByAdmin: resolvedMedia.length > 0,
              isCustom: true,
              createPayloadHash: requestHash,
            },
          });

          await tx.productVariant.createMany({
            data: normalizedVariants.map((v) => ({
              id: v.id,
              productId: input.id,
              colorId: v.colorId,
              sizeId: v.sizeId,
              sku: v.sku,
              listPrice: v.listPrice,
              salePrice: v.salePrice,
              isActive: v.isActive,
              isCustom: true,
              adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
            })),
          });

          if (resolvedMedia.length > 0) {
            await this.uploads!.attach(actorId, imageKeys, tx, { purpose: 'product' });
            await tx.productImage.createMany({
              data: normalizedImages.map((img, sortOrder) => ({
                id: img.id,
                productId: input.id,
                colorId: null,
                url: resolvedMedia[sortOrder]!.url,
                alt: img.alt,
                sortOrder,
              })),
            });
          }

          return this.findDetailInTx(tx, input.id);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (isUniqueViolationError(error)) {
        const existingById = await this.prisma.product.findUnique({
          where: { id: input.id },
          select: { id: true, createPayloadHash: true },
        });
        if (existingById) {
          if (existingById.createPayloadHash === requestHash) {
            return this.findById(input.id);
          }
          throw new ConflictException({
            error: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            message: 'ID sản phẩm đã tồn tại với thông tin tạo ban đầu khác.',
          });
        }
        const slugConflict = await this.prisma.product.findUnique({
          where: { slug: normalizedSlug },
          select: { id: true },
        });
        if (slugConflict) {
          throw new ConflictException({
            error: 'SLUG_EXISTS',
            message: 'Slug sản phẩm đã tồn tại trên hệ thống.',
          });
        }
        const skuConflict = await this.prisma.productVariant.findFirst({
          where: { sku: { in: [...seenSkus] } },
          select: { sku: true },
        });
        if (skuConflict) {
          throw new ConflictException({
            error: 'SKU_EXISTS',
            message: `Mã SKU "${skuConflict.sku}" đã tồn tại trên hệ thống.`,
          });
        }
        throw new ConflictException({
          error: 'CONFLICT',
          message: 'Thông tin sản phẩm hoặc biến thể bị trùng lặp.',
        });
      }
      throw error;
    }
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
    return runCategoryTxWithRetry(this.prisma, async (tx) => {
      let lockedCategories: Awaited<ReturnType<typeof lockCategoriesOrdered>> = [];
      let expectedCategoryId: string | null = null;
      if (!input.adminDisabled && typeof tx.product?.findUnique === 'function') {
        const hint = await tx.product.findUnique({
          where: { id },
          select: {
            isCustom: true,
            categoryId: true,
            category: { select: { parentId: true } },
          },
        });
        if (hint?.isCustom) {
          expectedCategoryId = hint.categoryId;
          lockedCategories = await lockCategoriesOrdered(tx, [
            hint.categoryId,
            hint.category?.parentId,
          ]);
        }
      }

      const before = await lockProductStatus(tx, id);
      if (!before) throw new NotFoundException('Không tìm thấy sản phẩm');

      if (!input.adminDisabled && before.isCustom) {
        if (expectedCategoryId !== before.categoryId) {
          throw new CategoryLockSetChangedError();
        }
        const lockedMap = new Map(lockedCategories.map((c) => [c.id, c]));
        const leaf = lockedMap.get(before.categoryId);
        if (!leaf) {
          throw new CategoryLockSetChangedError();
        }
        if (leaf.parentId && !lockedMap.has(leaf.parentId)) {
          throw new CategoryLockSetChangedError();
        }
      }

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

      const imageCount = await tx.productImage.count({ where: { productId: id } });
      const hasImages = imageCount > 0;

      if (!input.adminDisabled && before.isCustom) {
        if (!hasImages) {
          throw new UnprocessableEntityException({
            error: 'NO_IMAGES_FOR_ACTIVE_PRODUCT',
            message:
              'Không thể công bố sản phẩm tạo tay khi chưa có ảnh. Vui lòng tải lên ít nhất một ảnh trước.',
          });
        }
        const lockedMap = new Map(lockedCategories.map((c) => [c.id, c]));
        const leaf = lockedMap.get(before.categoryId);
        const parent = leaf?.parentId ? lockedMap.get(leaf.parentId) : undefined;
        if (!leaf?.isActive || (parent && !parent.isActive)) {
          const hiddenName = !leaf?.isActive ? (leaf?.name ?? 'danh mục') : parent!.name;
          throw new UnprocessableEntityException({
            error: 'CATEGORY_HIDDEN_FOR_ACTIVE_PRODUCT',
            message: `Không thể công bố sản phẩm vì danh mục "${hiddenName}" đang bị ẩn ngoài cửa hàng.`,
          });
        }
      }

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

  async updateImages(
    productId: string,
    actorId: string,
    input: UpdateProductImagesDto,
  ): Promise<AdminProductImagesResponse> {
    const normalizeAlt = (val: string | null | undefined): string | null => {
      if (typeof val !== 'string') return null;
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const items = input.items.map((item) => ({
      id: item.id,
      key: item.key?.trim() || undefined,
      alt: normalizeAlt(item.alt),
    }));

    // Kiểm tra trùng ID, trùng key và giới hạn 8 ảnh khi thêm mới trước khi gọi kho ảnh (không giữ khóa DB khi I/O mạng)
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    const newKeys: string[] = [];

    for (const item of items) {
      if (seenIds.has(item.id)) {
        throw new BadRequestException('Danh sách ảnh có ID bị trùng lặp.');
      }
      seenIds.add(item.id);

      if (item.key !== undefined) {
        if (seenKeys.has(item.key)) {
          throw new BadRequestException('Một khóa ảnh mới bị gửi lặp nhiều lần.');
        }
        seenKeys.add(item.key);
        newKeys.push(item.key);
      }
    }

    // Giới hạn 8 ảnh chỉ áp dụng khi thêm ảnh mới (bộ ảnh legacy > 8 vẫn sửa alt, đổi thứ tự, gỡ được)
    if (newKeys.length > 0 && items.length > MAX_PRODUCT_IMAGES) {
      throw new UnprocessableEntityException({
        error: 'IMAGE_LIMIT_EXCEEDED',
        message: `Mỗi sản phẩm tối đa ${MAX_PRODUCT_IMAGES} ảnh khi tải thêm ảnh mới.`,
      });
    }

    // Xác thực tệp trên kho ảnh NGOÀI transaction để kho phản hồi chậm không làm hết hạn transaction lưu
    const resolvedByKey = new Map<string, string>();
    if (newKeys.length > 0) {
      if (!this.uploads) {
        throw new Error('UploadsService chưa được cấu hình');
      }
      const resolved = await this.uploads.resolveMedia(actorId, 'product', newKeys);
      for (const r of resolved) {
        resolvedByKey.set(r.key, r.url);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await lockProductStatus(tx, productId);
      if (!before) throw new NotFoundException('Không tìm thấy sản phẩm');

      // CAS Check trước no-op
      if ((before.imagesVersion ?? 0) !== input.expectedVersion) {
        throw new ConflictException({
          error: 'CONCURRENT_MODIFICATION',
          message: 'Bộ ảnh sản phẩm đã thay đổi trên máy chủ. Vui lòng tải bản mới trước khi lưu.',
        });
      }

      const existingImages = await tx.productImage.findMany({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          url: true,
          alt: true,
          sortOrder: true,
          colorId: true,
          color: { select: colorSelect },
        },
      });
      const existingById = new Map(existingImages.map((img) => [img.id, img]));

      for (const item of items) {
        if (item.key !== undefined) {
          if (existingById.has(item.id)) {
            throw new BadRequestException('ID của ảnh mới trùng với ảnh đã tồn tại của sản phẩm.');
          }
        } else if (!existingById.has(item.id)) {
          throw new BadRequestException('Ảnh hiện hữu không thuộc sản phẩm này hoặc đã bị gỡ.');
        }
      }

      // Chặn gỡ hết ảnh của sản phẩm đang mở bán
      if (items.length === 0 && before.isActive) {
        throw new UnprocessableEntityException({
          error: 'LAST_IMAGE_OF_ACTIVE_PRODUCT',
          message:
            'Không thể gỡ ảnh cuối cùng khi sản phẩm đang mở bán. Vui lòng chuyển sản phẩm sang Ngừng bán trước.',
        });
      }

      // Kiểm tra No-op: không có ảnh mới, số lượng bằng nhau, từng vị trí có cùng id và cùng alt
      const isNoOp =
        newKeys.length === 0 &&
        items.length === existingImages.length &&
        items.every(
          (item, index) =>
            existingImages[index]?.id === item.id &&
            (existingImages[index]?.alt ?? null) === item.alt,
        );

      if (isNoOp) {
        return {
          id: productId,
          imagesVersion: before.imagesVersion ?? 0,
          imagesManagedByAdmin: before.imagesManagedByAdmin ?? false,
          imageUrl: existingImages[0]?.url ?? null,
          images: existingImages.map((img) => ({
            id: img.id,
            url: img.url,
            alt: img.alt,
            sortOrder: img.sortOrder,
            color: img.color,
          })),
        };
      }

      // Nhận ticket của các ảnh mới trong cùng transaction (siết thời hạn ticket product 1 giờ)
      if (newKeys.length > 0) {
        await this.uploads!.attach(actorId, newKeys, tx, { purpose: 'product' });
      }

      // Xóa các ảnh cũ không còn trong danh sách (chỉ gỡ khỏi catalog, giữ asset cho snapshot đơn cũ)
      const removedIds = existingImages.filter((img) => !seenIds.has(img.id)).map((img) => img.id);
      if (removedIds.length > 0) {
        await tx.productImage.deleteMany({
          where: { productId, id: { in: removedIds } },
        });
      }

      // Dịch tạm sortOrder của các ảnh cũ được giữ lại (+1000) để không đụng unique (product_id, sort_order) và sort_order >= 0
      const keptExistingItems = items.filter((item) => item.key === undefined);
      if (keptExistingItems.length > 0) {
        await tx.$executeRaw`
          UPDATE public.product_images
          SET sort_order = sort_order + 1000
          WHERE product_id = ${productId}::uuid
        `;
      }

      // Cập nhật sortOrder chuẩn 0..N-1 và alt cho ảnh giữ lại, hoặc tạo bản ghi cho ảnh mới
      for (const [sortOrder, item] of items.entries()) {
        if (item.key === undefined) {
          await tx.productImage.update({
            where: { id: item.id },
            data: {
              sortOrder,
              alt: item.alt,
            },
          });
        } else {
          const url = resolvedByKey.get(item.key);
          if (!url) {
            throw new BadRequestException('Không xác định được URL của ảnh mới tải lên.');
          }
          try {
            await tx.productImage.create({
              data: {
                id: item.id,
                productId,
                url,
                alt: item.alt,
                sortOrder,
                colorId: null,
              },
            });
          } catch (error) {
            if (!isUniqueViolationError(error)) throw error;
            throw new ConflictException({
              error: 'PRODUCT_IMAGE_CONFLICT',
              message: 'Mã hoặc vị trí của ảnh mới bị trùng. Không thể lưu bộ ảnh.',
            });
          }
        }
      }

      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: {
          imagesManagedByAdmin: true,
          imagesVersion: { increment: 1 },
        },
        select: {
          id: true,
          imagesVersion: true,
          imagesManagedByAdmin: true,
        },
      });

      const finalImages = await tx.productImage.findMany({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          url: true,
          alt: true,
          sortOrder: true,
          color: { select: colorSelect },
        },
      });

      return {
        id: updatedProduct.id,
        imagesVersion: updatedProduct.imagesVersion,
        imagesManagedByAdmin: updatedProduct.imagesManagedByAdmin,
        imageUrl: finalImages[0]?.url ?? null,
        images: finalImages,
      };
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

  private toDetail(
    row: Prisma.ProductGetPayload<{ select: typeof detailSelect }>,
  ): AdminProductDetail {
    return {
      ...toSummary(row),
      contentVersion: row.contentVersion,
      adminContentFields: row.adminContentFields,
      imagesVersion: row.imagesVersion ?? 0,
      imagesManagedByAdmin: row.imagesManagedByAdmin ?? false,
      isCustom: row.isCustom ?? false,
      createPayloadHash: row.createPayloadHash ?? null,
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

  private async findDetailInTx(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<AdminProductDetail> {
    const row = await tx.product.findUniqueOrThrow({ where: { id }, select: detailSelect });
    return this.toDetail(row);
  }

  async findById(id: string): Promise<AdminProductDetail> {
    const row = await this.prisma.product.findUnique({ where: { id }, select: detailSelect });
    if (!row) throw new NotFoundException('Không tìm thấy sản phẩm');
    return this.toDetail(row);
  }
}
