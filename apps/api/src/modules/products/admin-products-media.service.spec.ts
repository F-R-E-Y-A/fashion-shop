import 'reflect-metadata';

import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { UploadsService } from '../uploads/index.js';
import { AdminProductsService } from './admin-products.service.js';
import type { UpdateProductImagesDto } from './dto/update-product-images.dto.js';

describe('AdminProductsService — Quản trị Ảnh Sản Phẩm (Đợt 3, UC-04.2/AC41-AC49)', () => {
  let service: AdminProductsService;
  let tx: {
    $queryRaw: ReturnType<typeof vi.fn>;
    $executeRaw: ReturnType<typeof vi.fn>;
    product: Record<string, ReturnType<typeof vi.fn>>;
    productImage: Record<string, ReturnType<typeof vi.fn>>;
  };
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    product: Record<string, ReturnType<typeof vi.fn>>;
  };
  let uploads: {
    ticket: ReturnType<typeof vi.fn>;
    resolveMedia: ReturnType<typeof vi.fn>;
    attach: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };

  const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const productId = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp';
  const img1Id = '11111111-1111-4111-8111-111111111111';
  const img2Id = '22222222-2222-4222-8222-222222222222';
  const newImgId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn().mockResolvedValue(1),
      product: {
        update: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      productImage: {
        findMany: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    prisma = {
      $transaction: vi.fn(async (cb: (txClient: unknown) => unknown) => cb(tx)),
      product: {
        findUnique: vi.fn(),
      },
    };
    uploads = {
      ticket: vi.fn().mockResolvedValue({
        uploadUrl: 'https://upload.test/image/upload',
        fields: { public_id: `freya/products/${adminId}/k1` },
        key: `freya/products/${adminId}/k1`,
        expiresAt: '2026-11-19T15:00:00.000Z',
        maxBytes: 5_242_880,
        formats: ['jpg', 'png', 'webp'],
      }),
      resolveMedia: vi.fn(async (_uid: string, _purpose: string, keys: readonly string[]) =>
        keys.map((key) => ({
          key,
          url: `https://cdn.test/${key}.jpg`,
          thumbnailUrl: `https://cdn.test/thumb/${key}.jpg`,
        })),
      ),
      attach: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };

    service = new AdminProductsService(
      prisma as unknown as PrismaService,
      uploads as unknown as UploadsService,
    );
  });

  it('UC-04.2/AC41,AC42 createUploadTicket gọi uploads.ticket(actorId, "product")', async () => {
    const res = await service.createUploadTicket(adminId);
    expect(uploads.ticket).toHaveBeenCalledWith(adminId, 'product');
    expect(res.key).toBe(`freya/products/${adminId}/k1`);
  });

  it('UC-04.2/AC47 CAS conflict: kiểm tra expectedVersion trước no-op -> lệch phiên bản trả 409', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id: productId,
        isActive: true,
        adminDisabled: false,
        statusVersion: 0,
        contentVersion: 0,
        adminContentFields: [],
        imagesVersion: 2,
        imagesManagedByAdmin: true,
      },
    ]);

    const dto: UpdateProductImagesDto = {
      expectedVersion: 1,
      items: [{ id: img1Id, alt: 'Ảnh 1' }],
    };

    await expect(service.updateImages(productId, adminId, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.productImage.findMany).not.toHaveBeenCalled();
  });

  it('UC-04.2/AC47 No-op: không có ảnh mới, cùng danh sách id theo thứ tự và cùng alt -> không ghi DB, giữ nguyên version và imagesManagedByAdmin', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id: productId,
        isActive: true,
        adminDisabled: false,
        statusVersion: 0,
        contentVersion: 0,
        adminContentFields: [],
        imagesVersion: 0,
        imagesManagedByAdmin: false,
      },
    ]);
    const existingImages = [
      {
        id: img1Id,
        url: 'https://cdn.test/1.jpg',
        alt: 'Ảnh 1',
        sortOrder: 0,
        colorId: null,
        color: null,
      },
      {
        id: img2Id,
        url: 'https://cdn.test/2.jpg',
        alt: null,
        sortOrder: 1,
        colorId: 'c1',
        color: { code: 'den', name: 'Đen', hex: '#000000' },
      },
    ];
    tx.productImage.findMany.mockResolvedValue(existingImages);

    const dto: UpdateProductImagesDto = {
      expectedVersion: 0,
      items: [
        { id: img1Id, alt: 'Ảnh 1' },
        { id: img2Id, alt: null },
      ],
    };

    const res = await service.updateImages(productId, adminId, dto);
    expect(res.imagesVersion).toBe(0);
    expect(res.imagesManagedByAdmin).toBe(false);
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.productImage.update).not.toHaveBeenCalled();
    expect(uploads.resolveMedia).not.toHaveBeenCalled();
  });

  it('UC-04.2/AC44 Giới hạn 8 ảnh: từ chối khi có thêm ảnh mới và tổng vượt 8, nhưng cho phép sắp xếp/sửa/gỡ bộ ảnh legacy > 8 ảnh', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id: productId,
        isActive: true,
        adminDisabled: false,
        statusVersion: 0,
        contentVersion: 0,
        adminContentFields: [],
        imagesVersion: 0,
        imagesManagedByAdmin: false,
      },
    ]);
    const nineLegacyImages = Array.from({ length: 9 }, (_, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      url: `https://cdn.test/${i + 1}.jpg`,
      alt: `Legacy ${i + 1}`,
      sortOrder: i,
      colorId: null,
      color: null,
    }));
    tx.productImage.findMany.mockResolvedValue(nineLegacyImages);

    // 1. Thử thêm 1 ảnh mới khi tổng > 8 -> 422 IMAGE_LIMIT_EXCEEDED
    const dtoWithNew: UpdateProductImagesDto = {
      expectedVersion: 0,
      items: [
        ...nineLegacyImages.slice(0, 8).map((img) => ({ id: img.id, alt: img.alt })),
        { id: newImgId, key: `freya/products/${adminId}/new1`, alt: 'Mới' },
      ],
    };
    await expect(service.updateImages(productId, adminId, dtoWithNew)).rejects.toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ error: 'IMAGE_LIMIT_EXCEEDED' }),
      }),
    );

    // 2. Sửa alt / đổi thứ tự 9 ảnh legacy hiện có (không thêm ảnh mới) -> thành công 200
    tx.product.update.mockResolvedValue({
      id: productId,
      imagesVersion: 1,
      imagesManagedByAdmin: true,
    });
    const reversed = [...nineLegacyImages].reverse();
    tx.productImage.findMany
      .mockResolvedValueOnce(nineLegacyImages)
      .mockResolvedValueOnce(reversed.map((img, idx) => ({ ...img, sortOrder: idx })));

    const dtoReorderLegacy: UpdateProductImagesDto = {
      expectedVersion: 0,
      items: reversed.map((img) => ({ id: img.id, alt: img.alt })),
    };
    const res = await service.updateImages(productId, adminId, dtoReorderLegacy);
    expect(res.imagesVersion).toBe(1);
    expect(res.imagesManagedByAdmin).toBe(true);
    expect(res.images).toHaveLength(9);
  });

  it('UC-04.2/AC46 Chặn gỡ ảnh cuối cùng khi sản phẩm đang mở bán (isActive = true) bằng 422 LAST_IMAGE_OF_ACTIVE_PRODUCT', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id: productId,
        isActive: true,
        adminDisabled: false,
        statusVersion: 0,
        contentVersion: 0,
        adminContentFields: [],
        imagesVersion: 0,
        imagesManagedByAdmin: false,
      },
    ]);
    tx.productImage.findMany.mockResolvedValue([
      { id: img1Id, url: 'https://cdn.test/1.jpg', alt: null, sortOrder: 0, color: null },
    ]);

    await expect(
      service.updateImages(productId, adminId, { expectedVersion: 0, items: [] }),
    ).rejects.toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ error: 'LAST_IMAGE_OF_ACTIVE_PRODUCT' }),
      }),
    );
  });

  it('UC-04.2/AC42,AC45,AC49 Lưu bộ ảnh mới + đổi thứ tự + gỡ ảnh cũ: nhận ticket attach trong transaction, giữ asset cũ (không gọi release), tăng imagesVersion và bật imagesManagedByAdmin', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id: productId,
        isActive: true,
        adminDisabled: false,
        statusVersion: 0,
        contentVersion: 0,
        adminContentFields: [],
        imagesVersion: 0,
        imagesManagedByAdmin: false,
      },
    ]);
    const existing = [
      {
        id: img1Id,
        url: 'https://cdn.test/1.jpg',
        alt: 'Ảnh 1',
        sortOrder: 0,
        colorId: null,
        color: null,
      },
      {
        id: img2Id,
        url: 'https://cdn.test/2.jpg',
        alt: 'Ảnh 2',
        sortOrder: 1,
        colorId: 'c1',
        color: { code: 'den', name: 'Đen', hex: '#000000' },
      },
    ];
    const newKey = `freya/products/${adminId}/new-photo`;
    const finalImages = [
      {
        id: img2Id,
        url: 'https://cdn.test/2.jpg',
        alt: 'Ảnh 2 đã sửa',
        sortOrder: 0,
        color: { code: 'den', name: 'Đen', hex: '#000000' },
      },
      {
        id: newImgId,
        url: `https://cdn.test/${newKey}.jpg`,
        alt: 'Ảnh mới tải',
        sortOrder: 1,
        color: null,
      },
    ];
    tx.productImage.findMany.mockResolvedValueOnce(existing).mockResolvedValueOnce(finalImages);
    tx.product.update.mockResolvedValue({
      id: productId,
      imagesVersion: 1,
      imagesManagedByAdmin: true,
    });

    const res = await service.updateImages(productId, adminId, {
      expectedVersion: 0,
      items: [
        { id: img2Id, alt: 'Ảnh 2 đã sửa' },
        { id: newImgId, key: newKey, alt: 'Ảnh mới tải' },
      ],
    });

    expect(uploads.resolveMedia).toHaveBeenCalledWith(adminId, 'product', [newKey]);
    expect(uploads.attach).toHaveBeenCalledWith(adminId, [newKey], tx, { purpose: 'product' });
    // Không bao giờ gọi uploads.release khi gỡ ảnh khỏi sản phẩm để bảo toàn snapshot đơn cũ
    expect(uploads.release).not.toHaveBeenCalled();
    expect(tx.productImage.deleteMany).toHaveBeenCalledWith({
      where: { productId, id: { in: [img1Id] } },
    });
    expect(tx.productImage.create).toHaveBeenCalledWith({
      data: {
        id: newImgId,
        productId,
        url: `https://cdn.test/${newKey}.jpg`,
        alt: 'Ảnh mới tải',
        sortOrder: 1,
        colorId: null,
      },
    });
    expect(res).toEqual({
      id: productId,
      imagesVersion: 1,
      imagesManagedByAdmin: true,
      imageUrl: 'https://cdn.test/2.jpg',
      images: finalImages,
    });
  });

  it('UC-04.2/AC46 Từ chối trùng id, trùng key, hoặc id ảnh cũ không thuộc sản phẩm', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id: productId,
        isActive: true,
        adminDisabled: false,
        statusVersion: 0,
        contentVersion: 0,
        adminContentFields: [],
        imagesVersion: 0,
        imagesManagedByAdmin: false,
      },
    ]);
    tx.productImage.findMany.mockResolvedValue([
      { id: img1Id, url: 'https://cdn.test/1.jpg', alt: null, sortOrder: 0, color: null },
    ]);

    // Trùng ID
    await expect(
      service.updateImages(productId, adminId, {
        expectedVersion: 0,
        items: [
          { id: img1Id, alt: null },
          { id: img1Id, alt: 'Trùng' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // ID ảnh cũ không thuộc sản phẩm (không có key)
    await expect(
      service.updateImages(productId, adminId, {
        expectedVersion: 0,
        items: [{ id: img2Id, alt: null }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UC-04.2/AC43 (hồi quy P2-2) gọi uploads.resolveMedia trước khi mở prisma.$transaction để kho ảnh chậm không làm hết hạn giao dịch', async () => {
    const events: string[] = [];
    const newKey = `freya/products/${adminId}/slow-photo`;

    uploads.resolveMedia.mockImplementationOnce(async () => {
      events.push('resolveMedia:start');
      await Promise.resolve();
      events.push('resolveMedia:end');
      return [
        {
          key: newKey,
          url: `https://cdn.test/${newKey}.jpg`,
          thumbnailUrl: `https://cdn.test/thumb/${newKey}.jpg`,
        },
      ];
    });
    prisma.$transaction.mockImplementationOnce(async (cb: (txClient: unknown) => unknown) => {
      events.push('transaction:start');
      const result = await cb(tx);
      events.push('transaction:end');
      return result;
    });
    uploads.attach.mockImplementationOnce(async () => {
      events.push('attach');
    });

    tx.$queryRaw.mockResolvedValue([
      {
        id: productId,
        isActive: true,
        adminDisabled: false,
        statusVersion: 0,
        contentVersion: 0,
        adminContentFields: [],
        imagesVersion: 0,
        imagesManagedByAdmin: false,
      },
    ]);
    const existing = [
      {
        id: img1Id,
        url: 'https://cdn.test/1.jpg',
        alt: 'Ảnh 1',
        sortOrder: 0,
        colorId: null,
        color: null,
      },
    ];
    const finalImages = [
      ...existing,
      {
        id: newImgId,
        url: `https://cdn.test/${newKey}.jpg`,
        alt: 'Chậm',
        sortOrder: 1,
        color: null,
      },
    ];
    tx.productImage.findMany.mockResolvedValueOnce(existing).mockResolvedValueOnce(finalImages);
    tx.product.update.mockResolvedValue({
      id: productId,
      imagesVersion: 1,
      imagesManagedByAdmin: true,
    });

    await service.updateImages(productId, adminId, {
      expectedVersion: 0,
      items: [
        { id: img1Id, alt: 'Ảnh 1' },
        { id: newImgId, key: newKey, alt: 'Chậm' },
      ],
    });

    expect(events).toEqual([
      'resolveMedia:start',
      'resolveMedia:end',
      'transaction:start',
      'attach',
      'transaction:end',
    ]);
    expect(uploads.attach).toHaveBeenCalledWith(adminId, [newKey], tx, { purpose: 'product' });
  });
});
