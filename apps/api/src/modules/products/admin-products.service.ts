import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  AdminProductDetail,
  AdminProductPage,
  AdminProductSummary,
} from './dto/admin-product.response.js';
import type {
  AdminProductStatus,
  ChangeProductStatusDto,
} from './dto/change-product-status.dto.js';
import type { ListAdminProductsQuery } from './dto/list-admin-products.query.js';
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
      listPrice: true,
      salePrice: true,
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

@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async changeStatus(id: string, input: ChangeProductStatusDto): Promise<AdminProductStatus> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockProductStatus(tx, id);
      if (!before) throw new NotFoundException('Không tìm thấy sản phẩm');
      if (before.statusVersion !== input.expectedVersion)
        throw new ConflictException('Trạng thái đã thay đổi. Tải lại và xác nhận lại.');
      const hasImages = (await tx.productImage.count({ where: { productId: id } })) > 0;
      const data = productStatusChange(before, input.adminDisabled, hasImages);
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

  async list(query: ListAdminProductsQuery): Promise<AdminProductPage> {
    // contains dung LIKE: escape wildcard, Prisma van tham so hoa gia tri. some dung EXISTS nen khong trung product.
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
    // Cung snapshot cho count va rows khi co import chay song song; khong ghi DB qua luong doc.
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
      description: row.description,
      material: row.material,
      careInstructions: row.careInstructions,
      isFeatured: row.isFeatured,
      audience: row.audience,
      updatedAt: row.updatedAt.toISOString(),
      variants: row.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        isActive: v.isActive,
        listPrice: v.listPrice.toString(),
        salePrice: v.salePrice?.toString() ?? null,
        color: v.color,
        sizeCode: v.size.code,
      })),
      images: row.images,
    };
  }
}
