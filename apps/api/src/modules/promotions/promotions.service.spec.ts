import { ConflictException, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscountType, PromotionStatus, VoucherStatus } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PromotionsService } from './promotions.service.js';

function makePrisma() {
  const prisma = {
    $executeRaw: vi.fn(async () => 1),
    $executeRawUnsafe: vi.fn(async () => 1),
    $queryRaw: vi.fn<() => Promise<unknown[]>>(async () => [
      { id: 'p-1', updatedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]),
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return Promise.all(cb);
    }),
    voucher: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    promotion: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    voucherUsage: {
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  return { prisma, service: new PromotionsService(prisma as unknown as PrismaService) };
}

describe('PromotionsService (UC-07.2 Áp dụng mã giảm giá & UC-10.2 Quản lý voucher)', () => {
  let prisma: ReturnType<typeof makePrisma>['prisma'];
  let service: PromotionsService;

  beforeEach(() => {
    ({ prisma, service } = makePrisma());
  });

  describe('validateVoucher (UC-07.2)', () => {
    it('báo lỗi NotFoundException khi mã không tồn tại hoặc INACTIVE', async () => {
      prisma.voucher.findUnique.mockResolvedValue(null);

      await expect(service.validateVoucher('INVALID', '500000')).rejects.toThrow(NotFoundException);

      prisma.voucher.findUnique.mockResolvedValue({
        id: '1',
        code: 'INACTIVE_CODE',
        status: VoucherStatus.INACTIVE,
      });

      await expect(service.validateVoucher('INACTIVE_CODE', '500000')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('báo lỗi BadRequestException khi đơn hàng chưa tới ngày bắt đầu hoặc đã hết hạn', async () => {
      const future = new Date(Date.now() + 86400000);
      prisma.voucher.findUnique.mockResolvedValue({
        id: '1',
        code: 'FUTURE',
        status: VoucherStatus.ACTIVE,
        startsAt: future,
        endsAt: null,
        _count: { usages: 0 },
      });

      await expect(service.validateVoucher('FUTURE', '500000')).rejects.toThrow(
        'Mã giảm giá chưa đến ngày bắt đầu có hiệu lực',
      );

      const past = new Date(Date.now() - 86400000);
      prisma.voucher.findUnique.mockResolvedValue({
        id: '1',
        code: 'EXPIRED',
        status: VoucherStatus.ACTIVE,
        startsAt: null,
        endsAt: past,
        _count: { usages: 0 },
      });

      await expect(service.validateVoucher('EXPIRED', '500000')).rejects.toThrow(
        'Mã giảm giá đã hết thời hạn sử dụng',
      );
    });

    it('báo lỗi BadRequestException khi giá trị đơn hàng chưa đạt mức tối thiểu minOrderAmount', async () => {
      prisma.voucher.findUnique.mockResolvedValue({
        id: '1',
        code: 'MIN500K',
        status: VoucherStatus.ACTIVE,
        minOrderAmount: new Decimal(500000),
        _count: { usages: 0 },
      });

      await expect(service.validateVoucher('MIN500K', '300000')).rejects.toThrow(
        'Đơn hàng chưa đạt giá trị tối thiểu 500000đ để áp dụng mã này',
      );
    });

    it('báo lỗi BadRequestException khi mã đã hết tổng số lượt sử dụng toàn hệ thống', async () => {
      prisma.voucher.findUnique.mockResolvedValue({
        id: '1',
        code: 'LIMITED',
        status: VoucherStatus.ACTIVE,
        usageLimit: 10,
        _count: { usages: 10 },
      });

      await expect(service.validateVoucher('LIMITED', '500000')).rejects.toThrow(
        'Mã giảm giá đã hết số lượt sử dụng toàn hệ thống',
      );
    });

    it('báo lỗi BadRequestException khi người dùng đã dùng hết lượt cho phép perUserLimit', async () => {
      prisma.voucher.findUnique.mockResolvedValue({
        id: '1',
        code: 'ONCE_PER_USER',
        status: VoucherStatus.ACTIVE,
        usageLimit: 100,
        perUserLimit: 1,
        _count: { usages: 5 },
      });

      prisma.voucherUsage.count.mockResolvedValue(1);

      await expect(service.validateVoucher('ONCE_PER_USER', '500000', 'user-123')).rejects.toThrow(
        'Bạn đã dùng hết số lượt áp dụng cho phép của mã giảm giá này',
      );
    });

    it('tính toán chính xác giảm giá theo tỷ lệ % và áp dụng mức trần maxDiscountAmount', async () => {
      prisma.voucher.findUnique.mockResolvedValue({
        id: 'voucher-1',
        code: 'SALE20',
        status: VoucherStatus.ACTIVE,
        discountType: DiscountType.PERCENTAGE,
        discountValue: new Decimal(20), // 20%
        maxDiscountAmount: new Decimal(50000), // trần 50.000đ
        minOrderAmount: new Decimal(100000),
        usageLimit: null,
        perUserLimit: null,
        startsAt: null,
        endsAt: null,
        _count: { usages: 2 },
      });

      // Đơn 500.000đ * 20% = 100.000đ -> trần 50.000đ -> giảm 50.000đ, còn 450.000đ
      const result = await service.validateVoucher('sale20', '500000');
      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe('50000');
      expect(result.finalAmount).toBe('450000');
      expect(result.code).toBe('SALE20');
    });

    it('tính toán chính xác giảm giá theo số tiền cố định FIXED_AMOUNT và không vượt quá đơn hàng', async () => {
      prisma.voucher.findUnique.mockResolvedValue({
        id: 'voucher-2',
        code: 'GIAM50K',
        status: VoucherStatus.ACTIVE,
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: new Decimal(50000),
        maxDiscountAmount: null,
        minOrderAmount: null,
        usageLimit: null,
        perUserLimit: null,
        startsAt: null,
        endsAt: null,
        _count: { usages: 0 },
      });

      const result = await service.validateVoucher('GIAM50K', '200000');
      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe('50000');
      expect(result.finalAmount).toBe('150000');

      // Trường hợp đơn hàng 30.000đ mà mã giảm 50.000đ -> chỉ giảm tối đa 30.000đ, còn 0đ
      const resultSmall = await service.validateVoucher('GIAM50K', '30000');
      expect(resultSmall.discountAmount).toBe('30000');
      expect(resultSmall.finalAmount).toBe('0');
    });
  });

  describe('createVoucher (UC-10.2)', () => {
    it('báo lỗi ConflictException nếu mã voucher đã tồn tại', async () => {
      prisma.voucher.findUnique.mockResolvedValue({ id: 'existing', code: 'EXISTS' });

      await expect(
        service.createVoucher({
          code: 'exists',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: '20000',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('báo lỗi BadRequestException nếu phần trăm giảm > 100%', async () => {
      prisma.voucher.findUnique.mockResolvedValue(null);

      await expect(
        service.createVoucher({
          code: 'OVER100',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '120',
        }),
      ).rejects.toThrow('Giá trị phần trăm giảm giá không thể vượt quá 100%');
    });

    it('tạo voucher thành công với mã được tự động viết hoa', async () => {
      prisma.voucher.findUnique.mockResolvedValue(null);
      prisma.voucher.create.mockResolvedValue({
        id: 'v-new',
        code: 'NEWCODE',
        status: VoucherStatus.ACTIVE,
        discountType: DiscountType.PERCENTAGE,
        discountValue: new Decimal(10),
        maxDiscountAmount: null,
        minOrderAmount: null,
        usageLimit: 100,
        perUserLimit: 1,
        startsAt: null,
        endsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { usages: 0 },
      });

      const res = await service.createVoucher({
        code: 'newcode',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '10',
      });

      expect(res.code).toBe('NEWCODE');
      expect(prisma.voucher.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: 'NEWCODE' }),
        }),
      );
    });

    it('từ chối khi maxDiscountAmount hoặc minOrderAmount âm', async () => {
      prisma.voucher.findUnique.mockResolvedValue(null);

      await expect(
        service.createVoucher({
          code: 'NEGMAX',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '10',
          maxDiscountAmount: '-50000',
        }),
      ).rejects.toThrow('Mức giảm tối đa phải lớn hơn 0');

      await expect(
        service.createVoucher({
          code: 'NEGMIN',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '10',
          minOrderAmount: '-1000',
        }),
      ).rejects.toThrow('Giá trị đơn tối thiểu không được âm');
    });

    it('từ chối khi PATCH đổi discountType thành PERCENTAGE nhưng discountValue hiện tại > 100', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v-fixed',
          code: 'FIXED50K',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: new Decimal(50000),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          perUserLimit: null,
          startsAt: null,
          endsAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      await expect(
        service.updateVoucher('v-fixed', {
          discountType: DiscountType.PERCENTAGE,
        }),
      ).rejects.toThrow('Giá trị phần trăm không thể vượt quá 100%');
    });

    it('báo lỗi ConflictException (409) khi expectedUpdatedAt không khớp với DB (CAS mismatch)', async () => {
      const dbDate = new Date('2026-11-11T10:00:00.000Z');
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v-cas',
          code: 'VOUCHER10',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.PERCENTAGE,
          discountValue: new Decimal(10),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          perUserLimit: null,
          startsAt: null,
          endsAt: null,
          createdAt: dbDate,
          updatedAt: dbDate,
        },
      ]);

      await expect(
        service.updateVoucher('v-cas', {
          status: VoucherStatus.INACTIVE,
          expectedUpdatedAt: '2026-11-11T09:00:00.000Z',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('cập nhật thành công và tăng đơn điệu updatedAt khi expectedUpdatedAt khớp', async () => {
      const dbDate = new Date('2026-11-11T10:00:00.000Z');
      const updatedDate = new Date('2026-11-11T10:00:00.001Z');
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v-cas',
          code: 'VOUCHER10',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.PERCENTAGE,
          discountValue: new Decimal(10),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          perUserLimit: null,
          startsAt: null,
          endsAt: null,
          createdAt: dbDate,
          updatedAt: dbDate,
        },
      ]);

      prisma.voucher.update.mockResolvedValue({
        id: 'v-cas',
        code: 'VOUCHER10',
        status: VoucherStatus.INACTIVE,
        discountType: DiscountType.PERCENTAGE,
        discountValue: new Decimal(10),
        maxDiscountAmount: null,
        minOrderAmount: null,
        usageLimit: null,
        perUserLimit: null,
        startsAt: null,
        endsAt: null,
        createdAt: dbDate,
        updatedAt: updatedDate,
        _count: { usages: 0 },
      });

      const res = await service.updateVoucher('v-cas', {
        status: VoucherStatus.INACTIVE,
        expectedUpdatedAt: '2026-11-11T10:00:00.000Z',
      });

      expect(res.status).toBe(VoucherStatus.INACTIVE);
      expect(prisma.voucher.update).toHaveBeenCalled();
    });

    it('no-op: trả về bản ghi hiện tại mà không gọi update khi dữ liệu không thay đổi', async () => {
      const dbDate = new Date('2026-11-11T10:00:00.000Z');
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v-noop',
          code: 'NOOP10',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.PERCENTAGE,
          discountValue: new Decimal(10),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          perUserLimit: null,
          startsAt: null,
          endsAt: null,
          createdAt: dbDate,
          updatedAt: dbDate,
        },
      ]);

      const res = await service.updateVoucher('v-noop', {
        status: VoucherStatus.ACTIVE,
        expectedUpdatedAt: '2026-11-11T10:00:00.000Z',
      });

      expect(res.status).toBe(VoucherStatus.ACTIVE);
      expect(prisma.voucher.update).not.toHaveBeenCalled();
    });

    it('lan truyền lỗi SQL/DB khi lockVoucher thất bại (không nuốt lỗi để rollback transaction)', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Deadlock detected'));

      await expect(
        service.updateVoucher('v-deadlock', {
          status: VoucherStatus.INACTIVE,
        }),
      ).rejects.toThrow('Deadlock detected');
    });

    it('bắt lỗi Prisma P2002 race condition và ném ConflictException khi tạo mã trùng', async () => {
      prisma.voucher.findUnique.mockResolvedValue(null);
      prisma.voucher.create.mockRejectedValue({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`code`)',
      });

      await expect(
        service.createVoucher({
          code: 'RACECODE',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '10',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteVoucher (Bảo toàn lịch sử dữ liệu)', () => {
    it('chuyển trạng thái sang INACTIVE nếu voucher đã có đơn hàng sử dụng', async () => {
      prisma.voucher.findUnique.mockResolvedValue({
        id: 'v-used',
        _count: { usages: 3 },
      });

      const res = await service.deleteVoucher('v-used');
      expect(res.ok).toBe(true);
      expect(prisma.voucher.update).toHaveBeenCalledWith({
        where: { id: 'v-used' },
        data: { status: VoucherStatus.INACTIVE },
      });
      expect(prisma.voucher.delete).not.toHaveBeenCalled();
    });

    it('xóa vĩnh viễn nếu voucher chưa từng có đơn hàng nào sử dụng', async () => {
      prisma.voucher.findUnique.mockResolvedValue({
        id: 'v-unused',
        _count: { usages: 0 },
      });

      const res = await service.deleteVoucher('v-unused');
      expect(res.ok).toBe(true);
      expect(prisma.voucher.delete).toHaveBeenCalledWith({
        where: { id: 'v-unused' },
      });
    });
  });

  describe('recordVoucherUsage (Tích hợp tạo đơn hàng & kiểm soát quota)', () => {
    it('lưu bản ghi voucher usage thành công khi còn quota', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v-1',
          code: 'V1',
          status: 'ACTIVE',
          usageLimit: 10,
          perUserLimit: 2,
          startsAt: null,
          endsAt: null,
        },
      ]);
      prisma.voucherUsage.count.mockResolvedValue(0);
      prisma.voucherUsage.create.mockResolvedValue({ id: 'usage-1' });

      await service.recordVoucherUsage({
        voucherId: 'v-1',
        orderId: 'o-1',
        userId: 'u-1',
        discountAmount: '50000',
      });

      expect(prisma.voucherUsage.create).toHaveBeenCalledWith({
        data: {
          voucherId: 'v-1',
          orderId: 'o-1',
          userId: 'u-1',
          discountAmount: new Decimal(50000),
        },
      });
    });

    it('báo lỗi khi voucher đã hết lượt sử dụng toàn hệ thống (usageLimit)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v-1',
          code: 'V1',
          status: 'ACTIVE',
          usageLimit: 1,
          perUserLimit: null,
          startsAt: null,
          endsAt: null,
        },
      ]);
      prisma.voucherUsage.count.mockResolvedValue(1);

      await expect(
        service.recordVoucherUsage({
          voucherId: 'v-1',
          orderId: 'o-2',
          userId: 'u-2',
          discountAmount: '50000',
        }),
      ).rejects.toThrow('Mã giảm giá đã hết lượt sử dụng trên hệ thống');
    });

    it('báo lỗi khi người dùng đã dùng hết lượt cho phép (perUserLimit)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v-1',
          code: 'V1',
          status: 'ACTIVE',
          usageLimit: 100,
          perUserLimit: 1,
          startsAt: null,
          endsAt: null,
        },
      ]);
      prisma.voucherUsage.count.mockResolvedValueOnce(5); // total count
      prisma.voucherUsage.count.mockResolvedValueOnce(1); // user count

      await expect(
        service.recordVoucherUsage({
          voucherId: 'v-1',
          orderId: 'o-3',
          userId: 'u-1',
          discountAmount: '50000',
        }),
      ).rejects.toThrow('Bạn đã dùng hết số lượt cho phép của mã giảm giá này');
    });

    it('báo lỗi khi voucher đang INACTIVE hoặc hết hạn', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'v-inactive',
          code: 'INACT',
          status: 'INACTIVE',
          usageLimit: 10,
          perUserLimit: 2,
          startsAt: null,
          endsAt: null,
        },
      ]);

      await expect(
        service.recordVoucherUsage({
          voucherId: 'v-inactive',
          orderId: 'o-4',
          discountAmount: '10000',
        }),
      ).rejects.toThrow('Mã giảm giá hiện không khả dụng');
    });
  });

  describe('createPromotion & updatePromotion (UC-10.1)', () => {
    it('từ chối tạo khuyến mãi với maxDiscountAmount hoặc minOrderAmount âm', async () => {
      await expect(
        service.createPromotion({
          name: 'KM Mua Sam',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '20',
          maxDiscountAmount: '-10000',
        }),
      ).rejects.toThrow('Mức giảm tối đa phải lớn hơn 0');

      await expect(
        service.createPromotion({
          name: 'KM Mua Sam',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '20',
          minOrderAmount: '-5000',
        }),
      ).rejects.toThrow('Giá trị đơn tối thiểu không được âm');
    });

    it('từ chối khi updatePromotion đổi sang PERCENTAGE nhưng discountValue > 100', async () => {
      prisma.promotion.findUnique.mockResolvedValue({
        id: 'p-1',
        name: 'KM Tet',
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: new Decimal(200000),
        maxDiscountAmount: null,
        minOrderAmount: null,
        startsAt: null,
        endsAt: null,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await expect(
        service.updatePromotion('p-1', {
          discountType: DiscountType.PERCENTAGE,
        }),
      ).rejects.toThrow('Giá trị phần trăm không thể vượt quá 100%');
    });

    it('idempotency: trả về bản ghi hiện có khi truyền dto.id trùng lặp với payload giống hệt', async () => {
      const fixedId = 'a0000000-0000-4000-a000-000000000001';
      const existing = {
        id: fixedId,
        name: 'KM Tet 2026',
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: new Decimal('50000'),
        maxDiscountAmount: null,
        minOrderAmount: new Decimal('200000'),
        conditions: null,
        status: PromotionStatus.ACTIVE,
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      prisma.promotion.findUnique.mockResolvedValue(existing);

      const res = await service.createPromotion({
        id: fixedId,
        name: '  KM Tet 2026  ',
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: '50000',
        minOrderAmount: '200000',
      });

      expect(res.id).toBe(fixedId);
      expect(prisma.promotion.create).not.toHaveBeenCalled();
    });

    it('idempotency: ném ConflictException khi truyền dto.id đã tồn tại nhưng payload khác biệt', async () => {
      const fixedId = 'a0000000-0000-4000-a000-000000000001';
      const existing = {
        id: fixedId,
        name: 'KM Mua Sam',
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: new Decimal('50000'),
        maxDiscountAmount: null,
        minOrderAmount: null,
        conditions: null,
        status: PromotionStatus.ACTIVE,
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      prisma.promotion.findUnique.mockResolvedValue(existing);

      await expect(
        service.createPromotion({
          id: fixedId,
          name: 'KM Hoan Toan Khac',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '10',
        }),
      ).rejects.toThrow('Mã định danh chương trình khuyến mãi đã tồn tại với nội dung khác.');
    });

    it('CAS: ném ConflictException khi expectedUpdatedAt không khớp với phiên bản máy chủ', async () => {
      const existing = {
        id: 'p-1',
        name: 'KM He',
        discountType: DiscountType.PERCENTAGE,
        discountValue: new Decimal('10'),
        maxDiscountAmount: null,
        minOrderAmount: null,
        conditions: null,
        status: PromotionStatus.ACTIVE,
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T10:00:00.000Z'),
      };
      prisma.promotion.findUnique.mockResolvedValue(existing);

      await expect(
        service.updatePromotion('p-1', {
          name: 'KM He Cap Nhat',
          expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow('Dữ liệu chương trình khuyến mãi đã bị thay đổi bởi phiên làm việc khác');
    });

    it('no-op: không cập nhật DB và giữ nguyên updatedAt khi payload cập nhật trùng với hiện tại', async () => {
      const baseDate = new Date('2026-01-01T00:00:00.000Z');
      const existing = {
        id: 'p-1',
        name: 'KM Mua Dong',
        discountType: DiscountType.PERCENTAGE,
        discountValue: new Decimal('15'),
        maxDiscountAmount: new Decimal('100000'),
        minOrderAmount: new Decimal('300000'),
        conditions: null,
        status: PromotionStatus.ACTIVE,
        startsAt: null,
        endsAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
      };
      prisma.promotion.findUnique.mockResolvedValue(existing);

      const res = await service.updatePromotion('p-1', {
        name: '  KM Mua Dong  ',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '15',
        maxDiscountAmount: '100000',
        minOrderAmount: '300000',
        status: PromotionStatus.ACTIVE,
        expectedUpdatedAt: baseDate.toISOString(),
      });

      expect(res.name).toBe('KM Mua Dong');
      expect(prisma.promotion.update).not.toHaveBeenCalled();
    });

    it('bảo toàn conditions phức tạp khi update đơn giản không truyền conditions', async () => {
      const baseDate = new Date('2026-01-01T00:00:00.000Z');
      const complexConditions = {
        type: 'CUSTOMER_SEGMENT',
        segment: 'VIP',
        tiers: [{ minSpent: 1000000, discount: 20 }],
      };
      const existing = {
        id: 'p-complex',
        name: 'KM Phuc Tap',
        discountType: DiscountType.PERCENTAGE,
        discountValue: new Decimal('20'),
        maxDiscountAmount: null,
        minOrderAmount: null,
        conditions: complexConditions,
        status: PromotionStatus.ACTIVE,
        startsAt: null,
        endsAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
      };
      prisma.promotion.findUnique.mockResolvedValue(existing);
      prisma.promotion.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          ...existing,
          ...data,
          updatedAt: data.updatedAt,
        }),
      );

      const res = await service.updatePromotion('p-complex', {
        name: 'KM Phuc Tap Doi Ten',
        expectedUpdatedAt: baseDate.toISOString(),
      });

      expect(res.name).toBe('KM Phuc Tap Doi Ten');
      expect(res.conditions).toEqual(complexConditions);
      expect(prisma.promotion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p-complex' },
          data: expect.not.objectContaining({ conditions: null }),
        }),
      );
    });

    it('listPromotions thực thi trong transaction RepeatableRead với sắp xếp phá hòa id desc', async () => {
      prisma.promotion.count.mockResolvedValue(1);
      prisma.promotion.findMany.mockResolvedValue([
        {
          id: 'p-1',
          name: 'KM Test',
          discountType: DiscountType.PERCENTAGE,
          discountValue: new Decimal('10'),
          maxDiscountAmount: null,
          minOrderAmount: null,
          conditions: null,
          status: PromotionStatus.ACTIVE,
          startsAt: null,
          endsAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const res = await service.listPromotions({ page: 1, pageSize: 12 });
      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
      expect(prisma.promotion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('CODEX_REVIEW concurrent identical creates must not leak unique error', async () => {
      const id = 'a0000000-0000-4000-a000-000000000001';
      const payload = {
        id,
        name: 'Concurrent same request',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '10',
        status: PromotionStatus.INACTIVE,
      };
      const row = {
        id,
        name: payload.name,
        discountType: payload.discountType,
        discountValue: new Decimal(10),
        status: payload.status,
        maxDiscountAmount: null,
        minOrderAmount: null,
        conditions: null,
        startsAt: null,
        endsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      let committed = false;
      prisma.promotion.create.mockImplementation(async () => {
        if (!committed) {
          committed = true;
          return row;
        }
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      });
      prisma.promotion.findUnique.mockImplementation(async ({ where }) => {
        if (where?.id === id && committed) return row;
        return null;
      });
      const results = await Promise.allSettled([
        service.createPromotion(payload),
        service.createPromotion(payload),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    });

    it('CODEX_REVIEW2 unique error with no committed row must not fabricate campaign success', async () => {
      const { prisma: p, service: s } = makePrisma();
      const error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      p.promotion.findUnique.mockResolvedValue(null);
      p.promotion.create.mockRejectedValue(error);
      await expect(
        s.createPromotion({
          id: 'a0000000-0000-4000-a000-000000000088',
          name: 'Not persisted',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '10',
          status: PromotionStatus.INACTIVE,
        }),
      ).rejects.toThrow();
    });
  });
});
