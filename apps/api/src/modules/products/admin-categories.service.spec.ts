import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { AdminCategoriesService } from './admin-categories.service.js';
import {
  CategoryLockSetChangedError,
  isRetryableTxError,
  isUniqueViolationError,
  runCategoryTxWithRetry,
  slugifyCategoryName,
} from './category-visibility.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

describe('admin-categories unit tests', () => {
  describe('DTO validation & slugifyCategoryName', () => {
    it('slugifyCategoryName normalizes Vietnamese diacritics and đ/Đ', () => {
      expect(slugifyCategoryName('  Áo khoác Đầm Nữ  ')).toBe('ao-khoac-dam-nu');
      expect(slugifyCategoryName('Phụ kiện & Túi xách')).toBe('phu-kien-tui-xach');
    });

    it('CreateCategoryDto accepts valid UUID v4 and rejects non-v4 UUID', async () => {
      const valid = new CreateCategoryDto();
      valid.id = '550e8400-e29b-41d4-a716-446655440000';
      valid.name = 'Áo sơ mi';
      valid.slug = 'ao-so-mi';
      valid.sortOrder = 10;
      expect(await validate(valid)).toHaveLength(0);

      const invalid = new CreateCategoryDto();
      invalid.id = '550e8400-e29b-11d4-a716-446655440000'; // v1 UUID, not v4
      invalid.name = 'Áo sơ mi';
      const errors = await validate(invalid);
      expect(errors.some((e) => e.property === 'id')).toBe(true);
    });

    it('CreateCategoryDto rejects invalid slug and out-of-range sortOrder', async () => {
      const dto = new CreateCategoryDto();
      dto.id = '550e8400-e29b-41d4-a716-446655440000';
      dto.name = 'Áo';
      dto.slug = 'Ao-So-Mi!';
      dto.sortOrder = -1;
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toEqual(expect.arrayContaining(['slug', 'sortOrder']));
    });

    it('UpdateCategoryDto validates expectedUpdatedAt strict ISO UTC', async () => {
      const dto = new UpdateCategoryDto();
      dto.name = 'Tên mới';
      dto.expectedUpdatedAt = '2026-11-14T08:00:00Z'; // missing ms
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'expectedUpdatedAt')).toBe(true);
    });

    it('CODEX rejects null for nonnullable patch fields', async () => {
      for (const field of ['name', 'sortOrder']) {
        const dto = Object.assign(new UpdateCategoryDto(), {
          [field]: null,
          expectedUpdatedAt: '2026-11-10T08:00:00.000Z',
        });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === field)).toBe(true);
      }
    });
  });

  describe('error classification & runCategoryTxWithRetry', () => {
    it('detects retryable tx errors across Prisma/pg/driverAdapterError shapes', () => {
      expect(isRetryableTxError(new CategoryLockSetChangedError())).toBe(true);
      expect(isRetryableTxError({ code: 'P2034' })).toBe(true);
      expect(isRetryableTxError({ cause: { sqlState: '40P01' } })).toBe(true);
      expect(isRetryableTxError({ driverAdapterError: { code: '40001' } })).toBe(true);
      expect(isRetryableTxError({ code: 'P2002' })).toBe(false);
    });

    it('detects unique violation errors P2002 and 23505', () => {
      expect(isUniqueViolationError({ code: 'P2002' })).toBe(true);
      expect(isUniqueViolationError({ cause: { code: '23505' } })).toBe(true);
      expect(isUniqueViolationError({ code: '40P01' })).toBe(false);
    });

    it('retries full transaction on retryable errors up to maxAttempts', async () => {
      let calls = 0;
      const prisma = {
        $transaction: vi.fn(async (cb: (tx: unknown) => Promise<string>) => {
          calls += 1;
          return cb({});
        }),
      };

      const result = await runCategoryTxWithRetry(
        prisma as never,
        async () => {
          if (calls < 3) {
            throw { code: '40P01' };
          }
          return 'ok';
        },
        3,
      );

      expect(result).toBe('ok');
      expect(calls).toBe(3);
    });

    it('does not retry non-retryable errors', async () => {
      let calls = 0;
      const prisma = {
        $transaction: vi.fn(async (cb: (tx: unknown) => Promise<string>) => {
          calls += 1;
          return cb({});
        }),
      };

      await expect(
        runCategoryTxWithRetry(
          prisma as never,
          async () => {
            throw new UnprocessableEntityException('Invalid hierarchy');
          },
          3,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(calls).toBe(1);
    });
  });

  describe('AdminCategoriesService create & update', () => {
    it('handles P2002 outside failed transaction and returns idempotent record when payload matches', async () => {
      const id = '550e8400-e29b-41d4-a716-446655440001';
      const now = new Date('2026-11-14T10:00:00.000Z');
      const existingRow = {
        id,
        name: 'Áo mới',
        slug: 'ao-moi',
        parentId: null,
        sortOrder: 5,
        isActive: false,
        updatedAt: now,
        parent: null,
        children: [],
        _count: { products: 0 },
      };

      const tx = {
        category: {
          findUnique: vi.fn(async () => existingRow),
        },
        product: {
          groupBy: vi.fn(async () => []),
        },
      };
      const prisma = {
        $transaction: vi
          .fn()
          .mockRejectedValueOnce({ code: 'P2002' })
          .mockImplementationOnce(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
        category: {
          findUnique: vi.fn(async () => existingRow),
        },
      };

      const service = new AdminCategoriesService(prisma as never);

      const res = await service.create({
        id,
        name: 'Áo mới',
        slug: 'ao-moi',
        sortOrder: 5,
      });

      expect(res.id).toBe(id);
      expect(res.isActive).toBe(false);
    });

    it('throws 409 ConflictException on P2002 when existing UUID has different payload', async () => {
      const id = '550e8400-e29b-41d4-a716-446655440002';
      const prisma = {
        $transaction: vi.fn(async () => {
          throw { code: 'P2002' };
        }),
        category: {
          findUnique: vi.fn(async () => ({
            id,
            name: 'Tên khác',
            slug: 'ten-khac',
            parentId: null,
            sortOrder: 0,
            isActive: false,
            updatedAt: new Date('2026-11-14T10:00:00.000Z'),
          })),
        },
      };

      const service = new AdminCategoriesService(prisma as never);

      await expect(
        service.create({
          id,
          name: 'Tên mới',
          slug: 'ten-moi',
          sortOrder: 0,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('checks expectedUpdatedAt CAS before no-op in update', async () => {
      const id = '550e8400-e29b-41d4-a716-446655440003';
      const serverUpdatedAt = new Date('2026-11-14T10:05:00.000Z');
      const tx = {
        category: {
          findUnique: vi.fn(async () => ({
            id,
            name: 'Áo khoác',
            slug: 'ao-khoac',
            parentId: null,
            sortOrder: 1,
            isActive: true,
            adminManagedFields: [],
            updatedAt: serverUpdatedAt,
          })),
        },
        $queryRaw: vi.fn(async () => [
          {
            id,
            name: 'Áo khoác',
            slug: 'ao-khoac',
            parentId: null,
            sortOrder: 1,
            isActive: true,
            adminManagedFields: [],
            updatedAt: serverUpdatedAt,
          },
        ]),
      };
      const prisma = {
        $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
      };

      const service = new AdminCategoriesService(prisma as never);

      await expect(
        service.update(id, {
          name: 'Áo khoác', // identical field!
          expectedUpdatedAt: '2026-11-14T10:00:00.000Z', // stale!
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('CODEX null name must not reach internal TypeError', async () => {
      const row = {
        id: 'c1000000-0000-4000-8000-000000000001',
        name: 'Old',
        slug: 'old',
        parentId: null,
        sortOrder: 0,
        isActive: false,
        adminManagedFields: [],
        updatedAt: new Date('2026-11-10T08:00:00.000Z'),
      };
      const tx = {
        category: { findUnique: async () => ({ parentId: null }) },
        $queryRaw: async () => [row],
      };
      const db = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
      const service = new AdminCategoriesService(db as never);
      try {
        await service.update(row.id, {
          name: null,
          expectedUpdatedAt: row.updatedAt.toISOString(),
        } as never);
        throw new Error('Expected error');
      } catch (e) {
        expect(e).not.toBeInstanceOf(TypeError);
      }
    });
  });
});
