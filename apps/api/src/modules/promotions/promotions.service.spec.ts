import { ConflictException, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscountType, VoucherStatus } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PromotionsService } from './promotions.service.js';

function makePrisma() {
  const prisma = {
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

  describe('recordVoucherUsage (Tích hợp tạo đơn hàng)', () => {
    it('lưu bản ghi voucher usage thành công', async () => {
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
  });
});
