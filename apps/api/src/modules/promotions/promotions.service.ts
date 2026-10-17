import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { PageQuery } from '../../common/pagination/page.query.js';
import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import { DiscountType, PromotionStatus, VoucherStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CreateVoucherDto } from './dto/create-voucher.dto.js';
import { ListVouchersQuery } from './dto/list-vouchers.query.js';
import {
  CreatePromotionDto,
  PromotionListResponse,
  PromotionResponse,
} from './dto/promotion.dto.js';
import { UpdateVoucherDto } from './dto/update-voucher.dto.js';
import {
  VoucherApplyResult,
  VoucherListResponse,
  VoucherResponse,
} from './dto/voucher.response.js';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tinh toan so tien giam va kiem tra tinh hop le cua voucher (UC-07.2).
   */
  async validateVoucher(
    code: string,
    subtotalInput: string | number,
    userId?: string,
  ): Promise<VoucherApplyResult> {
    const normalizedCode = code.trim().toUpperCase();
    const subtotal = new Decimal(subtotalInput);

    if (subtotal.lte(0)) {
      throw new BadRequestException('Giá trị đơn hàng phải lớn hơn 0 để áp dụng mã giảm giá');
    }

    const voucher = await this.prisma.voucher.findUnique({
      where: { code: normalizedCode },
      include: {
        _count: {
          select: { usages: true },
        },
      },
    });

    if (!voucher || voucher.status !== VoucherStatus.ACTIVE) {
      throw new NotFoundException('Mã giảm giá không tồn tại hoặc đã ngừng kích hoạt');
    }

    const now = new Date();
    if (voucher.startsAt && now < voucher.startsAt) {
      throw new BadRequestException('Mã giảm giá chưa đến ngày bắt đầu có hiệu lực');
    }

    if (voucher.endsAt && now > voucher.endsAt) {
      throw new BadRequestException('Mã giảm giá đã hết thời hạn sử dụng');
    }

    if (voucher.minOrderAmount && subtotal.lt(voucher.minOrderAmount)) {
      throw new BadRequestException(
        `Đơn hàng chưa đạt giá trị tối thiểu ${voucher.minOrderAmount.toFixed(0)}đ để áp dụng mã này`,
      );
    }

    if (voucher.usageLimit !== null && voucher._count.usages >= voucher.usageLimit) {
      throw new BadRequestException('Mã giảm giá đã hết số lượt sử dụng toàn hệ thống');
    }

    if (userId && voucher.perUserLimit !== null) {
      const userUsageCount = await this.prisma.voucherUsage.count({
        where: {
          voucherId: voucher.id,
          userId,
        },
      });

      if (userUsageCount >= voucher.perUserLimit) {
        throw new BadRequestException(
          'Bạn đã dùng hết số lượt áp dụng cho phép của mã giảm giá này',
        );
      }
    }

    const calculatedDiscount =
      voucher.discountType === DiscountType.PERCENTAGE
        ? voucher.maxDiscountAmount
          ? Decimal.min(
              subtotal.mul(voucher.discountValue).div(100).round(),
              voucher.maxDiscountAmount,
            )
          : subtotal.mul(voucher.discountValue).div(100).round()
        : Decimal.min(voucher.discountValue, subtotal);

    const discountAmount = Decimal.min(calculatedDiscount, subtotal);
    const finalAmount = subtotal.sub(discountAmount);

    return {
      valid: true,
      voucherId: voucher.id,
      code: voucher.code,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue.toString(),
      discountAmount: discountAmount.toFixed(0),
      finalAmount: finalAmount.toFixed(0),
      minOrderAmount: voucher.minOrderAmount ? voucher.minOrderAmount.toFixed(0) : null,
      maxDiscountAmount: voucher.maxDiscountAmount ? voucher.maxDiscountAmount.toFixed(0) : null,
      message:
        voucher.discountType === DiscountType.PERCENTAGE
          ? `Áp dụng giảm ${voucher.discountValue.toFixed(0)}% thành công (-${discountAmount.toFixed(0)}đ)`
          : `Áp dụng giảm ${discountAmount.toFixed(0)}đ thành công`,
    };
  }

  /**
   * Lay danh sach cac voucher dang ACTIVE va con hieu luc (cho khach hang xem/chon nhanh).
   */
  async getAvailableVouchers(): Promise<VoucherResponse[]> {
    const now = new Date();
    const vouchers = await this.prisma.voucher.findMany({
      where: {
        status: VoucherStatus.ACTIVE,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      include: {
        _count: {
          select: { usages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return vouchers
      .filter((v) => v.usageLimit === null || v._count.usages < v.usageLimit)
      .map((v) => this.mapVoucherToResponse(v, v._count.usages));
  }

  /**
   * Lay danh sach chuong trinh khuyen mai dang ACTIVE (hien thi banner / trang chu).
   */
  async getActivePromotions(): Promise<PromotionResponse[]> {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        status: PromotionStatus.ACTIVE,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return promotions.map((p) => this.mapPromotionToResponse(p));
  }

  /**
   * Ghi nhan luot su dung voucher khi don hang tao thanh cong.
   * Ham nay duoc goi tu OrderModule trong transaction.
   */
  async recordVoucherUsage(
    params: {
      voucherId: string;
      orderId: string;
      userId?: string;
      discountAmount: string | Decimal;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    return db.voucherUsage.create({
      data: {
        voucherId: params.voucherId,
        orderId: params.orderId,
        userId: params.userId ?? null,
        discountAmount: new Decimal(params.discountAmount),
      },
    });
  }

  /**
   * Giai phong luot dung voucher khi don hang bi huy (ADR-025, Open decision T6).
   */
  async releaseVoucherUsage(orderId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    return db.voucherUsage.deleteMany({
      where: { orderId },
    });
  }

  // ================= ADMIN: QUẢN LÝ VOUCHER (UC-10.2) =================

  async listVouchers(query: ListVouchersQuery): Promise<VoucherListResponse> {
    const where: Prisma.VoucherWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.code = {
        contains: query.search.trim().toUpperCase(),
      };
    }

    const [total, vouchers] = await Promise.all([
      this.prisma.voucher.count({ where }),
      this.prisma.voucher.findMany({
        where,
        skip: skipOf(query),
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { usages: true },
          },
        },
      }),
    ]);

    const items = vouchers.map((v) => this.mapVoucherToResponse(v, v._count.usages));
    return toPage(items, total, query);
  }

  async getVoucherById(id: string): Promise<VoucherResponse> {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id },
      include: {
        _count: {
          select: { usages: true },
        },
      },
    });

    if (!voucher) {
      throw new NotFoundException('Không tìm thấy mã giảm giá');
    }

    return this.mapVoucherToResponse(voucher, voucher._count.usages);
  }

  async createVoucher(dto: CreateVoucherDto): Promise<VoucherResponse> {
    const normalizedCode = dto.code.trim().toUpperCase();

    const existing = await this.prisma.voucher.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw new ConflictException(`Mã giảm giá ${normalizedCode} đã tồn tại trong hệ thống`);
    }

    const discountValue = new Decimal(dto.discountValue);
    if (discountValue.lte(0)) {
      throw new BadRequestException('Giá trị giảm phải lớn hơn 0');
    }

    if (dto.discountType === DiscountType.PERCENTAGE && discountValue.gt(100)) {
      throw new BadRequestException('Giá trị phần trăm giảm giá không thể vượt quá 100%');
    }

    const voucher = await this.prisma.voucher.create({
      data: {
        code: normalizedCode,
        status: dto.status ?? VoucherStatus.ACTIVE,
        discountType: dto.discountType,
        discountValue,
        maxDiscountAmount: dto.maxDiscountAmount ? new Decimal(dto.maxDiscountAmount) : null,
        minOrderAmount: dto.minOrderAmount ? new Decimal(dto.minOrderAmount) : null,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
      include: {
        _count: {
          select: { usages: true },
        },
      },
    });

    return this.mapVoucherToResponse(voucher, voucher._count.usages);
  }

  async updateVoucher(id: string, dto: UpdateVoucherDto): Promise<VoucherResponse> {
    const existing = await this.prisma.voucher.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy mã giảm giá');
    }

    const data: Prisma.VoucherUpdateInput = {};

    if (dto.code) {
      const normalizedCode = dto.code.trim().toUpperCase();
      if (normalizedCode !== existing.code) {
        const dup = await this.prisma.voucher.findUnique({ where: { code: normalizedCode } });
        if (dup) {
          throw new ConflictException(`Mã giảm giá ${normalizedCode} đã tồn tại`);
        }
        data.code = normalizedCode;
      }
    }

    if (dto.status) data.status = dto.status;
    if (dto.discountType) data.discountType = dto.discountType;

    if (dto.discountValue) {
      const val = new Decimal(dto.discountValue);
      if (val.lte(0)) throw new BadRequestException('Giá trị giảm phải lớn hơn 0');
      const targetType = dto.discountType ?? existing.discountType;
      if (targetType === DiscountType.PERCENTAGE && val.gt(100)) {
        throw new BadRequestException('Giá trị phần trăm không thể vượt quá 100%');
      }
      data.discountValue = val;
    }

    if (dto.maxDiscountAmount !== undefined) {
      data.maxDiscountAmount = dto.maxDiscountAmount ? new Decimal(dto.maxDiscountAmount) : null;
    }

    if (dto.minOrderAmount !== undefined) {
      data.minOrderAmount = dto.minOrderAmount ? new Decimal(dto.minOrderAmount) : null;
    }

    if (dto.usageLimit !== undefined) data.usageLimit = dto.usageLimit ?? null;
    if (dto.perUserLimit !== undefined) data.perUserLimit = dto.perUserLimit ?? null;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    const updated = await this.prisma.voucher.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { usages: true },
        },
      },
    });

    return this.mapVoucherToResponse(updated, updated._count.usages);
  }

  async deleteVoucher(id: string): Promise<{ ok: boolean; message: string }> {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id },
      include: {
        _count: { select: { usages: true } },
      },
    });

    if (!voucher) {
      throw new NotFoundException('Không tìm thấy mã giảm giá');
    }

    if (voucher._count.usages > 0) {
      // Bảo vệ lịch sử: Voucher đã có đơn hàng dùng thì chuyển sang INACTIVE thay vì xóa cứng
      await this.prisma.voucher.update({
        where: { id },
        data: { status: VoucherStatus.INACTIVE },
      });
      return {
        ok: true,
        message:
          'Mã giảm giá đã có lượt sử dụng trong đơn hàng, hệ thống đã chuyển trạng thái sang ngưng hoạt động (INACTIVE) để bảo vệ toàn vẹn dữ liệu.',
      };
    }

    await this.prisma.voucher.delete({ where: { id } });
    return { ok: true, message: 'Đã xóa mã giảm giá thành công' };
  }

  // ================= ADMIN: QUẢN LÝ CHƯƠNG TRÌNH KM (UC-10.1) =================

  async listPromotions(query: PageQuery): Promise<PromotionListResponse> {
    const [total, promotions] = await Promise.all([
      this.prisma.promotion.count(),
      this.prisma.promotion.findMany({
        skip: skipOf(query),
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const items = promotions.map((p) => this.mapPromotionToResponse(p));
    return toPage(items, total, query);
  }

  async createPromotion(dto: CreatePromotionDto): Promise<PromotionResponse> {
    const discountValue = new Decimal(dto.discountValue);
    if (discountValue.lte(0)) {
      throw new BadRequestException('Giá trị giảm phải lớn hơn 0');
    }

    if (dto.discountType === DiscountType.PERCENTAGE && discountValue.gt(100)) {
      throw new BadRequestException('Giá trị phần trăm không thể vượt quá 100%');
    }

    const promotion = await this.prisma.promotion.create({
      data: {
        name: dto.name.trim(),
        discountType: dto.discountType,
        discountValue,
        maxDiscountAmount: dto.maxDiscountAmount ? new Decimal(dto.maxDiscountAmount) : null,
        minOrderAmount: dto.minOrderAmount ? new Decimal(dto.minOrderAmount) : null,
        conditions: (dto.conditions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        status: dto.status ?? PromotionStatus.ACTIVE,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });

    return this.mapPromotionToResponse(promotion);
  }

  async updatePromotion(id: string, dto: Partial<CreatePromotionDto>): Promise<PromotionResponse> {
    const existing = await this.prisma.promotion.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy chương trình khuyến mãi');
    }

    const data: Prisma.PromotionUpdateInput = {};
    if (dto.name) data.name = dto.name.trim();
    if (dto.status) data.status = dto.status;
    if (dto.discountType) data.discountType = dto.discountType;

    if (dto.discountValue) {
      const val = new Decimal(dto.discountValue);
      if (val.lte(0)) throw new BadRequestException('Giá trị giảm phải lớn hơn 0');
      data.discountValue = val;
    }

    if (dto.maxDiscountAmount !== undefined) {
      data.maxDiscountAmount = dto.maxDiscountAmount ? new Decimal(dto.maxDiscountAmount) : null;
    }
    if (dto.minOrderAmount !== undefined) {
      data.minOrderAmount = dto.minOrderAmount ? new Decimal(dto.minOrderAmount) : null;
    }
    if (dto.conditions !== undefined) {
      data.conditions = (dto.conditions as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    }
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    const updated = await this.prisma.promotion.update({
      where: { id },
      data,
    });

    return this.mapPromotionToResponse(updated);
  }

  // ================= HELPER FORMATTERS =================

  private mapVoucherToResponse(
    v: {
      id: string;
      code: string;
      status: VoucherStatus;
      discountType: DiscountType;
      discountValue: Decimal;
      maxDiscountAmount: Decimal | null;
      minOrderAmount: Decimal | null;
      usageLimit: number | null;
      perUserLimit: number | null;
      startsAt: Date | null;
      endsAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    usageCount = 0,
  ): VoucherResponse {
    return {
      id: v.id,
      code: v.code,
      status: v.status,
      discountType: v.discountType,
      discountValue: v.discountValue.toFixed(2),
      maxDiscountAmount: v.maxDiscountAmount ? v.maxDiscountAmount.toFixed(2) : null,
      minOrderAmount: v.minOrderAmount ? v.minOrderAmount.toFixed(2) : null,
      usageLimit: v.usageLimit,
      perUserLimit: v.perUserLimit,
      usageCount,
      startsAt: v.startsAt ? v.startsAt.toISOString() : null,
      endsAt: v.endsAt ? v.endsAt.toISOString() : null,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  }

  private mapPromotionToResponse(p: {
    id: string;
    name: string;
    discountType: DiscountType;
    discountValue: Decimal;
    maxDiscountAmount: Decimal | null;
    minOrderAmount: Decimal | null;
    conditions: Prisma.JsonValue | null;
    status: PromotionStatus;
    startsAt: Date | null;
    endsAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): PromotionResponse {
    return {
      id: p.id,
      name: p.name,
      discountType: p.discountType,
      discountValue: p.discountValue.toFixed(2),
      maxDiscountAmount: p.maxDiscountAmount ? p.maxDiscountAmount.toFixed(2) : null,
      minOrderAmount: p.minOrderAmount ? p.minOrderAmount.toFixed(2) : null,
      conditions: (p.conditions as Record<string, unknown>) ?? null,
      status: p.status,
      startsAt: p.startsAt ? p.startsAt.toISOString() : null,
      endsAt: p.endsAt ? p.endsAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
