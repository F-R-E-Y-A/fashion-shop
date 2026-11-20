import 'reflect-metadata';

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { UploadsService } from '../uploads/index.js';
import { AdminProductsService } from './admin-products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';

describe('AdminProductsService — Tạo sản phẩm mới (Đợt 4, UC-04.2/AC53-AC59)', () => {
  let service: AdminProductsService;
  let tx: {
    $executeRaw: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
    product: Record<string, ReturnType<typeof vi.fn>>;
    productVariant: Record<string, ReturnType<typeof vi.fn>>;
    productImage: Record<string, ReturnType<typeof vi.fn>>;
    category: Record<string, ReturnType<typeof vi.fn>>;
    brand: Record<string, ReturnType<typeof vi.fn>>;
    color: Record<string, ReturnType<typeof vi.fn>>;
    size: Record<string, ReturnType<typeof vi.fn>>;
  };
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    product: Record<string, ReturnType<typeof vi.fn>>;
    productVariant: Record<string, ReturnType<typeof vi.fn>>;
    brand: Record<string, ReturnType<typeof vi.fn>>;
    color: Record<string, ReturnType<typeof vi.fn>>;
    size: Record<string, ReturnType<typeof vi.fn>>;
  };
  let uploads: {
    ticket: ReturnType<typeof vi.fn>;
    resolveMedia: ReturnType<typeof vi.fn>;
    attach: ReturnType<typeof vi.fn>;
  };

  const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const productId = '11111111-1111-4111-8111-111111111111';
  const categoryId = '22222222-2222-4222-8222-222222222222';
  const brandId = '33333333-3333-4333-8333-333333333333';
  const colorId = '44444444-4444-4444-8444-444444444444';
  const sizeId = '55555555-5555-4555-8555-555555555555';
  const variantId = '66666666-6666-4666-8666-666666666666';
  const imageId = '77777777-7777-4777-8777-777777777777';

  const baseDto = (): CreateProductDto => ({
    id: productId,
    name: 'Áo sơ mi lụa Đợt 4',
    slug: 'ao-so-mi-lua-dot-4',
    categoryId,
    brandId,
    description: 'Mô tả',
    material: 'Lụa',
    careInstructions: 'Giặt tay',
    audience: 'nu',
    isFeatured: false,
    variants: [
      {
        id: variantId,
        colorId,
        sizeId,
        sku: 'DOT4-LUA-001',
        listPrice: '450000',
        salePrice: '390000',
        isActive: true,
      },
    ],
    images: [{ id: imageId, key: `freya/products/${actorId}/img-1`, alt: 'Ảnh 1' }],
  });

  const detailRow = (overrides: Record<string, unknown> = {}) => ({
    id: productId,
    name: 'Áo sơ mi lụa Đợt 4',
    slug: 'ao-so-mi-lua-dot-4',
    priceFrom: new Prisma.Decimal('390000'),
    isActive: false,
    adminDisabled: true,
    statusVersion: 0,
    contentVersion: 0,
    adminContentFields: ['name', 'description', 'material', 'careInstructions'],
    imagesVersion: 1,
    imagesManagedByAdmin: true,
    isCustom: true,
    createPayloadHash: 'hash',
    description: 'Mô tả',
    material: 'Lụa',
    careInstructions: 'Giặt tay',
    isFeatured: false,
    audience: 'nu',
    createdAt: new Date('2026-11-20T00:00:00Z'),
    updatedAt: new Date('2026-11-20T00:00:00Z'),
    category: { id: categoryId, name: 'Áo sơ mi', slug: 'ao-so-mi', isActive: true },
    brand: { id: brandId, name: 'Freya Basic' },
    images: [
      {
        id: imageId,
        url: 'https://cdn.test/img-1.jpg',
        alt: 'Ảnh 1',
        sortOrder: 0,
        color: null,
      },
    ],
    variants: [
      {
        id: variantId,
        sku: 'DOT4-LUA-001',
        colorId,
        sizeId,
        isActive: true,
        isCustom: true,
        adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
        updatedAt: new Date('2026-11-20T00:00:00Z'),
        listPrice: new Prisma.Decimal('450000'),
        salePrice: new Prisma.Decimal('390000'),
        color: { code: 'den', name: 'Đen', hex: '#111111' },
        size: { code: 'M' },
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn(),
      product: {
        findUnique: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue(detailRow()),
        create: vi.fn().mockResolvedValue({ id: productId }),
        update: vi.fn(),
      },
      productVariant: {
        findFirst: vi.fn().mockResolvedValue(null),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
      },
      productImage: {
        findFirst: vi.fn().mockResolvedValue(null),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
      },
      category: {
        count: vi.fn().mockResolvedValue(0),
      },
      brand: {
        findUnique: vi.fn().mockResolvedValue({ id: brandId }),
      },
      color: {
        findMany: vi.fn().mockResolvedValue([{ id: colorId }]),
      },
      size: {
        findMany: vi.fn().mockResolvedValue([{ id: sizeId }]),
      },
    };
    prisma = {
      $transaction: vi.fn(async (fn: (txClient: unknown) => unknown) => fn(tx)),
      product: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      productVariant: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      brand: { findMany: vi.fn().mockResolvedValue([]) },
      color: { findMany: vi.fn().mockResolvedValue([]) },
      size: { findMany: vi.fn().mockResolvedValue([]) },
    };
    uploads = {
      ticket: vi.fn(),
      resolveMedia: vi.fn().mockResolvedValue([
        {
          key: `freya/products/${actorId}/img-1`,
          url: 'https://cdn.test/img-1.jpg',
          thumbnailUrl: 'https://cdn.test/img-1-thumb.jpg',
        },
      ]),
      attach: vi.fn().mockResolvedValue(undefined),
    };
    service = new AdminProductsService(
      prisma as unknown as PrismaService,
      uploads as unknown as UploadsService,
    );
  });

  it('UC-04.2/AC53 getCreateOptions trả về brands, colors và sizes theo thứ tự chuẩn', async () => {
    prisma.brand.findMany.mockResolvedValue([{ id: brandId, name: 'Freya Basic', slug: 'freya' }]);
    prisma.color.findMany.mockResolvedValue([
      { id: colorId, code: 'den', name: 'Đen', hex: '#111111' },
    ]);
    prisma.size.findMany.mockResolvedValue([{ id: sizeId, code: 'M', sortOrder: 30 }]);

    const res = await service.getCreateOptions();
    expect(res).toEqual({
      brands: [{ id: brandId, name: 'Freya Basic', slug: 'freya' }],
      colors: [{ id: colorId, code: 'den', name: 'Đen', hex: '#111111' }],
      sizes: [{ id: sizeId, code: 'M', sortOrder: 30 }],
    });
  });

  it('UC-04.2/AC54,AC57 tạo sản phẩm ẩn mặc định, gọi resolveMedia trước tx và attach với { purpose: "product" }', async () => {
    const order: string[] = [];
    uploads.resolveMedia.mockImplementation(async () => {
      order.push('resolveMedia');
      return [
        {
          key: `freya/products/${actorId}/img-1`,
          url: 'https://cdn.test/img-1.jpg',
          thumbnailUrl: 'https://cdn.test/img-1-thumb.jpg',
        },
      ];
    });
    prisma.$transaction.mockImplementation(async (fn: (txClient: unknown) => unknown) => {
      order.push('transaction');
      return fn(tx);
    });
    tx.$queryRaw.mockResolvedValue([
      {
        id: categoryId,
        name: 'Áo sơ mi',
        slug: 'ao-so-mi',
        parentId: 'parent-1',
        sortOrder: 1,
        isActive: true,
        adminManagedFields: [],
        updatedAt: new Date(),
      },
    ]);

    const res = await service.createProduct(actorId, baseDto());

    expect(order).toEqual(['resolveMedia', 'transaction']);
    expect(uploads.attach).toHaveBeenCalledWith(actorId, [`freya/products/${actorId}/img-1`], tx, {
      purpose: 'product',
    });
    expect(tx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: productId,
        isActive: false,
        adminDisabled: true,
        isCustom: true,
        createPayloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        imagesManagedByAdmin: true,
        imagesVersion: 1,
      }),
    });
    expect(res.isActive).toBe(false);
    expect(res.adminDisabled).toBe(true);
    expect(res.isCustom).toBe(true);
  });

  it('UC-04.2/AC55 gửi lại cùng UUID và payload khớp createPayloadHash bỏ qua resolveMedia để replay ngay cả khi ticket đã attach và sản phẩm đã sửa', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id: categoryId,
        name: 'Áo sơ mi',
        slug: 'ao-so-mi',
        parentId: 'parent-1',
        sortOrder: 1,
        isActive: true,
        adminManagedFields: [],
        updatedAt: new Date(),
      },
    ]);
    await service.createProduct(actorId, baseDto());
    const storedHash = tx.product.create.mock.calls[0]![0].data.createPayloadHash as string;

    // Lần gọi lại sau timeout: sản phẩm đã tồn tại (kèm tên đã sửa sau đó), ticket đã attach
    uploads.resolveMedia.mockClear();
    prisma.product.findUnique
      .mockResolvedValueOnce({ id: productId, createPayloadHash: storedHash })
      .mockResolvedValueOnce(
        detailRow({ name: 'Tên đã sửa bởi admin khác', createPayloadHash: storedHash }),
      );

    const replayed = await service.createProduct(actorId, baseDto());

    expect(uploads.resolveMedia).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // chỉ từ lần tạo đầu
    expect(replayed.name).toBe('Tên đã sửa bởi admin khác');
    expect(replayed.createPayloadHash).toBe(storedHash);
  });

  it('UC-04.2/AC55 cùng UUID nhưng khác payload ném 409 IDEMPOTENCY_PAYLOAD_MISMATCH trước khi gọi kho ảnh', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: productId,
      createPayloadHash: '0'.repeat(64),
    });

    await expect(service.createProduct(actorId, baseDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(uploads.resolveMedia).not.toHaveBeenCalled();
  });

  it('UC-04.2/AC56 danh mục có con trả 422 CATEGORY_NOT_LEAF', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id: categoryId,
        name: 'Áo',
        slug: 'ao',
        parentId: null,
        sortOrder: 1,
        isActive: true,
        adminManagedFields: [],
        updatedAt: new Date(),
      },
    ]);
    tx.category.count.mockResolvedValue(2);

    await expect(service.createProduct(actorId, baseDto())).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('UC-04.2/AC54 kho ảnh chưa bật vẫn tạo được sản phẩm không ảnh và chặn khi gửi kèm ảnh', async () => {
    const noImageService = new AdminProductsService(prisma as unknown as PrismaService, undefined);
    tx.$queryRaw.mockResolvedValue([
      {
        id: categoryId,
        name: 'Áo sơ mi',
        slug: 'ao-so-mi',
        parentId: 'parent-1',
        sortOrder: 1,
        isActive: true,
        adminManagedFields: [],
        updatedAt: new Date(),
      },
    ]);

    await expect(noImageService.createProduct(actorId, baseDto())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const withoutImages = { ...baseDto(), images: [] };
    await noImageService.createProduct(actorId, withoutImages);
    expect(tx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ imagesManagedByAdmin: false, imagesVersion: 0 }),
    });
  });

  it('UC-04.2/AC58 changeStatus với isCustom = true chặn thiếu ảnh hoặc danh mục ẩn, còn isCustom = false giữ hành vi cũ', async () => {
    // 1. isCustom = true nhưng thiếu ảnh -> 422 NO_IMAGES_FOR_ACTIVE_PRODUCT
    tx.product.findUnique.mockResolvedValue({
      isCustom: true,
      categoryId,
      category: { parentId: 'parent-1' },
    });
    tx.$queryRaw
      .mockResolvedValueOnce([
        {
          id: categoryId,
          name: 'Áo sơ mi',
          slug: 'ao-so-mi',
          parentId: 'parent-1',
          sortOrder: 1,
          isActive: true,
          adminManagedFields: [],
          updatedAt: new Date(),
        },
        {
          id: 'parent-1',
          name: 'Áo',
          slug: 'ao',
          parentId: null,
          sortOrder: 1,
          isActive: true,
          adminManagedFields: [],
          updatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: productId,
          categoryId,
          isCustom: true,
          isActive: false,
          adminDisabled: true,
          statusVersion: 0,
          contentVersion: 0,
          adminContentFields: [],
          imagesVersion: 0,
          imagesManagedByAdmin: false,
        },
      ]);
    tx.productVariant.count.mockResolvedValue(1);
    tx.productImage.count.mockResolvedValue(0);

    await expect(
      service.changeStatus(productId, { adminDisabled: false, expectedVersion: 0 }),
    ).rejects.toThrow(/chưa có ảnh/);

    // 2. isCustom = true nhưng danh mục cha ẩn -> 422 CATEGORY_HIDDEN_FOR_ACTIVE_PRODUCT
    tx.$queryRaw
      .mockResolvedValueOnce([
        {
          id: categoryId,
          name: 'Áo sơ mi',
          slug: 'ao-so-mi',
          parentId: 'parent-1',
          sortOrder: 1,
          isActive: true,
          adminManagedFields: [],
          updatedAt: new Date(),
        },
        {
          id: 'parent-1',
          name: 'Áo',
          slug: 'ao',
          parentId: null,
          sortOrder: 1,
          isActive: false,
          adminManagedFields: [],
          updatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: productId,
          categoryId,
          isCustom: true,
          isActive: false,
          adminDisabled: true,
          statusVersion: 0,
          contentVersion: 0,
          adminContentFields: [],
          imagesVersion: 0,
          imagesManagedByAdmin: false,
        },
      ]);
    tx.productImage.count.mockResolvedValue(1);

    await expect(
      service.changeStatus(productId, { adminDisabled: false, expectedVersion: 0 }),
    ).rejects.toThrow(/đang bị ẩn ngoài cửa hàng/);

    // 3. isCustom = false: giữ hành vi cũ (UC-04.2/AC14) không khóa/chặn danh mục
    tx.product.findUnique.mockResolvedValue({
      isCustom: false,
      categoryId,
      category: { parentId: null },
    });
    tx.$queryRaw.mockResolvedValueOnce([
      {
        id: productId,
        categoryId,
        isCustom: false,
        isActive: false,
        adminDisabled: true,
        statusVersion: 0,
        contentVersion: 0,
        adminContentFields: [],
        imagesVersion: 0,
        imagesManagedByAdmin: false,
      },
    ]);
    tx.product.update.mockResolvedValue({
      id: productId,
      name: 'Sản phẩm import',
      isActive: true,
      adminDisabled: false,
      statusVersion: 1,
    });
    const legacy = await service.changeStatus(productId, {
      adminDisabled: false,
      expectedVersion: 0,
    });
    expect(legacy.isActive).toBe(true);
  });

  it('DTO từ chối payload sai định dạng (variants rỗng, >8 ảnh, slug sai)', async () => {
    const emptyVariants = plainToInstance(CreateProductDto, { ...baseDto(), variants: [] });
    expect((await validate(emptyVariants)).length).toBeGreaterThan(0);

    const tooManyImages = plainToInstance(CreateProductDto, {
      ...baseDto(),
      images: Array.from({ length: 9 }, (_, i) => ({
        id: `88888888-8888-4888-8888-88888888880${i}`,
        key: `freya/products/${actorId}/i-${i}`,
      })),
    });
    expect((await validate(tooManyImages)).length).toBeGreaterThan(0);

    const badSlug = plainToInstance(CreateProductDto, { ...baseDto(), slug: 'Slug Khong Hop Le' });
    expect((await validate(badSlug)).length).toBeGreaterThan(0);

    await expect(
      service.createProduct(actorId, {
        ...baseDto(),
        variants: [
          ...baseDto().variants,
          {
            id: '99999999-9999-4999-8999-999999999999',
            colorId,
            sizeId,
            sku: 'KHAC-SKU',
            listPrice: '200000',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UC-04.2/AC57 biến thể hoặc danh mục thiếu ném NotFoundException', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.createProduct(actorId, baseDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
