import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_FORMATS, IMAGE_MAX_BYTES } from '../../infra/storage/image-storage.js';
import {
  PRODUCT_MEDIA_ROOT,
  REVIEW_MEDIA_ROOT,
  UPLOAD_TICKET_TTL_MS,
  UploadsService,
} from './uploads.service.js';

describe('UploadsService — product upload purpose (UC-04.2/AC41, AC42, AC43)', () => {
  let prisma: {
    mediaUpload: {
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
  };
  let storage: {
    enabled: boolean;
    createUploadTicket: ReturnType<typeof vi.fn>;
    inspect: ReturnType<typeof vi.fn>;
    deliveryUrl: ReturnType<typeof vi.fn>;
    thumbnailUrl: ReturnType<typeof vi.fn>;
  };
  let limiter: {
    consume: ReturnType<typeof vi.fn>;
  };
  let config: {
    get: ReturnType<typeof vi.fn>;
  };
  let service: UploadsService;

  const adminId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    prisma = {
      mediaUpload: {
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    storage = {
      enabled: true,
      createUploadTicket: vi.fn((folder: string) => ({
        uploadUrl: 'https://upload.test/image/upload',
        fields: { public_id: `${folder}/img1`, signature: 'sig' },
        key: `${folder}/img1`,
        expiresAt: '2026-11-19T15:00:00.000Z',
      })),
      inspect: vi.fn().mockResolvedValue({
        key: `${PRODUCT_MEDIA_ROOT}/${adminId}/img1`,
        format: 'jpg',
        bytes: 120_000,
        width: 800,
        height: 1000,
      }),
      deliveryUrl: vi.fn((key: string) => `https://cdn.test/${key}.jpg`),
      thumbnailUrl: vi.fn((key: string) => `https://cdn.test/thumb/${key}.jpg`),
    };
    limiter = {
      consume: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    };
    config = {
      get: vi.fn().mockReturnValue('test-pepper'),
    };
    service = new UploadsService(
      prisma as never,
      storage as never,
      limiter as never,
      config as never,
    );
  });

  it('UC-04.2/AC42 ticket("product") tạo phiếu dưới thư mục freya/products/<adminId> và ghi sổ PENDING', async () => {
    expect(PRODUCT_MEDIA_ROOT).toBe('freya/products');
    const res = await service.ticket(adminId, 'product');

    expect(storage.createUploadTicket).toHaveBeenCalledWith(`freya/products/${adminId}`);
    expect(prisma.mediaUpload.create).toHaveBeenCalledWith({
      data: {
        storageKey: `freya/products/${adminId}/img1`,
        ownerId: adminId,
      },
    });
    expect(res).toEqual({
      uploadUrl: 'https://upload.test/image/upload',
      fields: { public_id: `freya/products/${adminId}/img1`, signature: 'sig' },
      key: `freya/products/${adminId}/img1`,
      expiresAt: '2026-11-19T15:00:00.000Z',
      maxBytes: IMAGE_MAX_BYTES,
      formats: [...IMAGE_FORMATS],
    });
  });

  it('UC-04.2/AC42 resolveMedia("product") chấp nhận khóa đúng chủ sở hữu và mục đích product', async () => {
    const key = `freya/products/${adminId}/img1`;
    const resolved = await service.resolveMedia(adminId, 'product', [key]);

    expect(storage.inspect).toHaveBeenCalledWith(key);
    expect(resolved).toEqual([
      {
        key,
        url: `https://cdn.test/${key}.jpg`,
        thumbnailUrl: `https://cdn.test/thumb/${key}.jpg`,
      },
    ]);
  });

  it('UC-04.2/AC43 resolveMedia("product") từ chối khóa sai mục đích (review/return) hoặc sai chủ sở hữu bằng 422 INVALID_MEDIA', async () => {
    const reviewKey = `${REVIEW_MEDIA_ROOT}/${adminId}/img1`;
    await expect(service.resolveMedia(adminId, 'product', [reviewKey])).rejects.toThrow(
      UnprocessableEntityException,
    );

    const otherUserKey = `freya/products/22222222-2222-4222-8222-222222222222/img1`;
    await expect(service.resolveMedia(adminId, 'product', [otherUserKey])).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(storage.inspect).not.toHaveBeenCalled();
  });

  it('UC-04.2/AC43 resolveMedia("product") đẩy ảnh quá 5MB hoặc sai định dạng vào hàng xóa DISCARDED và ném 422', async () => {
    const key = `freya/products/${adminId}/img1`;
    storage.inspect.mockResolvedValueOnce({
      key,
      format: 'jpg',
      bytes: IMAGE_MAX_BYTES + 1,
      width: 1000,
      height: 1000,
    });

    await expect(service.resolveMedia(adminId, 'product', [key])).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(prisma.mediaUpload.updateMany).toHaveBeenCalledWith({
      where: { storageKey: { in: [key] }, status: 'PENDING' },
      data: { status: 'DISCARDED' },
    });
  });

  it('UC-04.2/AC43 ticket("product") và resolveMedia("product") trả 503 UPLOADS_DISABLED khi kho chưa cấu hình', async () => {
    storage.enabled = false;
    await expect(service.ticket(adminId, 'product')).rejects.toThrow(ServiceUnavailableException);
    await expect(
      service.resolveMedia(adminId, 'product', [`freya/products/${adminId}/img1`]),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('UC-04.2/AC43 attach với purpose="product" siết thời hạn ticket 1 giờ còn review/return giữ hợp đồng cũ', async () => {
    const key = `freya/products/${adminId}/img1`;
    const now = new Date('2026-11-19T12:00:00.000Z');
    const tx = { mediaUpload: prisma.mediaUpload };

    // Product: truyền điều kiện createdAt > now - UPLOAD_TICKET_TTL_MS
    prisma.mediaUpload.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.attach(adminId, [key], tx as never, { purpose: 'product', now }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.mediaUpload.deleteMany).toHaveBeenCalledWith({
      where: {
        storageKey: { in: [key] },
        ownerId: adminId,
        status: 'PENDING',
        createdAt: { gt: new Date(now.getTime() - UPLOAD_TICKET_TTL_MS) },
      },
    });

    // Review/Return (không truyền purpose): giữ nguyên truy vấn chỉ kiểm PENDING + owner
    const reviewKey = `${REVIEW_MEDIA_ROOT}/${adminId}/rev1`;
    prisma.mediaUpload.deleteMany.mockResolvedValueOnce({ count: 1 });
    await service.attach(adminId, [reviewKey], tx as never);
    expect(prisma.mediaUpload.deleteMany).toHaveBeenLastCalledWith({
      where: {
        storageKey: { in: [reviewKey] },
        ownerId: adminId,
        status: 'PENDING',
      },
    });
  });
});
