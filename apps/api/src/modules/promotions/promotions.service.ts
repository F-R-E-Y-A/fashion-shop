import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  DiscountType,
  OrderStatus,
  PromotionStatus,
  VoucherStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CreateVoucherDto } from './dto/create-voucher.dto.js';
import {
  EvaluatedPromotionItem,
  EvaluatePromotionsDto,
  EvaluatePromotionsResponse,
} from './dto/evaluate-promotions.dto.js';
import { ListPromotionsQuery } from './dto/list-promotions.query.js';
import { ListVouchersQuery } from './dto/list-vouchers.query.js';
import {
  CreatePromotionDto,
  PromotionListResponse,
  PromotionResponse,
  UpdatePromotionDto,
} from './dto/promotion.dto.js';
import { UpdateVoucherDto } from './dto/update-voucher.dto.js';
import {
  VoucherApplyResult,
  VoucherListResponse,
  VoucherResponse,
} from './dto/voucher.response.js';
import {
  type CustomerMetrics,
  CustomerSegment,
  CustomerSegmentRule,
  type PromotionContext,
  PromotionEvaluatorService,
} from './engine/index.js';
import { lockPromotion } from './promotion-concurrency.js';
import { lockVoucher, toIsoString, type VoucherLockedRow } from './voucher-concurrency.js';

export function isComplexConditions(conditions: unknown): boolean {
  if (conditions === null || conditions === undefined) return false;
  if (typeof conditions === 'object' && !Array.isArray(conditions)) {
    return Object.keys(conditions as Record<string, unknown>).length > 0;
  }
  return true;
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluator: PromotionEvaluatorService = new PromotionEvaluatorService(),
  ) {}

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

    if (voucher.code === 'CHAOBANMOI') {
      if (userId) {
        const metrics = await this.getCustomerMetrics(userId);
        const segmentRule = new CustomerSegmentRule({ segment: CustomerSegment.NEW_CUSTOMER });
        const result = segmentRule.isSatisfiedBy({
          userId,
          subtotal,
          now,
          customerMetrics: metrics,
        });
        if (!result.passed) {
          throw new BadRequestException(
            result.reason ?? 'Mã CHAOBANMOI chỉ áp dụng cho đơn hàng đầu tiên của khách hàng mới',
          );
        }
      }
    } else if (voucher.code === 'FREYAVIP') {
      if (!userId) {
        throw new BadRequestException('Vui lòng đăng nhập tài khoản VIP để áp dụng mã FREYAVIP');
      }
      const metrics = await this.getCustomerMetrics(userId);
      const segmentRule = new CustomerSegmentRule({ segment: CustomerSegment.VIP_CUSTOMER });
      const result = segmentRule.isSatisfiedBy({
        userId,
        subtotal,
        now,
        customerMetrics: metrics,
      });
      if (!result.passed) {
        throw new BadRequestException(
          result.reason ??
            'Mã FREYAVIP chỉ áp dụng cho khách hàng hạng VIP (chi tiêu từ 2.000.000đ hoặc từ 3 đơn hàng)',
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
    const execute = async (db: Prisma.TransactionClient) => {
      const vouchers = await db.$queryRaw<
        Array<{
          id: string;
          code: string;
          status: string;
          usageLimit: number | null;
          perUserLimit: number | null;
          startsAt: Date | null;
          endsAt: Date | null;
        }>
      >`
        SELECT
          "id"::text AS "id",
          "code",
          "status"::text AS "status",
          "usage_limit" AS "usageLimit",
          "per_user_limit" AS "perUserLimit",
          "starts_at" AS "startsAt",
          "ends_at" AS "endsAt"
        FROM "vouchers"
        WHERE "id" = ${params.voucherId}::uuid
        FOR UPDATE
      `;

      const voucher = vouchers[0];
      if (!voucher) {
        throw new NotFoundException('Không tìm thấy mã giảm giá');
      }

      if (voucher.status !== 'ACTIVE') {
        throw new BadRequestException('Mã giảm giá hiện không khả dụng');
      }

      const now = new Date();
      if (voucher.startsAt && now < voucher.startsAt) {
        throw new BadRequestException('Mã giảm giá chưa đến ngày bắt đầu có hiệu lực');
      }
      if (voucher.endsAt && now > voucher.endsAt) {
        throw new BadRequestException('Mã giảm giá đã hết thời hạn sử dụng');
      }

      if (voucher.usageLimit !== null && voucher.usageLimit !== undefined) {
        const totalUsages = await db.voucherUsage.count({
          where: { voucherId: params.voucherId },
        });
        if (totalUsages >= voucher.usageLimit) {
          throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng trên hệ thống');
        }
      }

      if (params.userId && voucher.perUserLimit !== null && voucher.perUserLimit !== undefined) {
        const userUsages = await db.voucherUsage.count({
          where: {
            voucherId: params.voucherId,
            userId: params.userId,
          },
        });
        if (userUsages >= voucher.perUserLimit) {
          throw new BadRequestException('Bạn đã dùng hết số lượt cho phép của mã giảm giá này');
        }
      }

      return db.voucherUsage.create({
        data: {
          voucherId: params.voucherId,
          orderId: params.orderId,
          userId: params.userId ?? null,
          discountAmount: new Decimal(params.discountAmount),
        },
      });
    };

    if (tx) {
      return execute(tx);
    }
    return this.prisma.$transaction((innerTx) => execute(innerTx));
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

    const { total, vouchers } = await this.prisma.$transaction(
      async (tx) => {
        const [total, vouchers] = await Promise.all([
          tx.voucher.count({ where }),
          tx.voucher.findMany({
            where,
            skip: skipOf(query),
            take: query.pageSize,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: {
              _count: {
                select: { usages: true },
              },
            },
          }),
        ]);
        return { total, vouchers };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

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

    let maxDiscountAmount: Decimal | null = null;
    if (dto.maxDiscountAmount !== undefined && dto.maxDiscountAmount !== null) {
      maxDiscountAmount = new Decimal(dto.maxDiscountAmount);
      if (maxDiscountAmount.lte(0)) {
        throw new BadRequestException('Mức giảm tối đa phải lớn hơn 0');
      }
    }

    let minOrderAmount: Decimal | null = null;
    if (dto.minOrderAmount !== undefined && dto.minOrderAmount !== null) {
      minOrderAmount = new Decimal(dto.minOrderAmount);
      if (minOrderAmount.lt(0)) {
        throw new BadRequestException('Giá trị đơn tối thiểu không được âm');
      }
    }

    if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
    }

    try {
      const voucher = await this.prisma.voucher.create({
        data: {
          code: normalizedCode,
          status: dto.status ?? VoucherStatus.ACTIVE,
          discountType: dto.discountType,
          discountValue,
          maxDiscountAmount,
          minOrderAmount,
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
    } catch (err: unknown) {
      const errorObj =
        typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
      if (
        errorObj?.code === 'P2002' ||
        (typeof errorObj?.message === 'string' && errorObj.message.includes('Unique constraint'))
      ) {
        throw new ConflictException(`Mã giảm giá ${normalizedCode} đã tồn tại trong hệ thống`);
      }
      throw err;
    }
  }

  async updateVoucher(id: string, dto: UpdateVoucherDto): Promise<VoucherResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existing: (VoucherLockedRow & { _count?: { usages: number } }) | null =
        '$queryRaw' in tx && typeof tx.$queryRaw === 'function'
          ? await lockVoucher(tx as Parameters<typeof lockVoucher>[0], id)
          : await tx.voucher.findUnique({
              where: { id },
              include: {
                _count: {
                  select: { usages: true },
                },
              },
            });

      if (!existing) {
        throw new NotFoundException('Không tìm thấy mã giảm giá');
      }

      const currentIso = toIsoString(existing.updatedAt);

      if (dto.expectedUpdatedAt !== undefined) {
        if (currentIso !== dto.expectedUpdatedAt) {
          throw new ConflictException(
            'Mã giảm giá đã được thay đổi trên máy chủ. Tải lại và xác nhận lại.',
          );
        }
      }

      let normalizedCode: string | undefined = undefined;
      if (dto.code) {
        normalizedCode = dto.code.trim().toUpperCase();
        if (normalizedCode !== existing.code) {
          const dup = await tx.voucher.findUnique({ where: { code: normalizedCode } });
          if (dup) {
            throw new ConflictException(`Mã giảm giá ${normalizedCode} đã tồn tại`);
          }
        }
      }

      const mergedDiscountType = dto.discountType ?? existing.discountType;
      const mergedDiscountValue =
        dto.discountValue !== undefined
          ? new Decimal(dto.discountValue)
          : new Decimal(existing.discountValue);

      if (mergedDiscountValue.lte(0)) {
        throw new BadRequestException('Giá trị giảm phải lớn hơn 0');
      }
      if (mergedDiscountType === DiscountType.PERCENTAGE && mergedDiscountValue.gt(100)) {
        throw new BadRequestException('Giá trị phần trăm không thể vượt quá 100%');
      }

      let mergedMaxDiscountAmount = existing.maxDiscountAmount
        ? new Decimal(existing.maxDiscountAmount)
        : null;
      if (dto.maxDiscountAmount !== undefined) {
        mergedMaxDiscountAmount = dto.maxDiscountAmount ? new Decimal(dto.maxDiscountAmount) : null;
      }
      if (mergedMaxDiscountAmount && mergedMaxDiscountAmount.lte(0)) {
        throw new BadRequestException('Mức giảm tối đa phải lớn hơn 0');
      }

      let mergedMinOrderAmount = existing.minOrderAmount
        ? new Decimal(existing.minOrderAmount)
        : null;
      if (dto.minOrderAmount !== undefined) {
        mergedMinOrderAmount = dto.minOrderAmount ? new Decimal(dto.minOrderAmount) : null;
      }
      if (mergedMinOrderAmount && mergedMinOrderAmount.lt(0)) {
        throw new BadRequestException('Giá trị đơn tối thiểu không được âm');
      }

      const mergedStartsAt =
        dto.startsAt !== undefined
          ? dto.startsAt
            ? new Date(dto.startsAt)
            : null
          : existing.startsAt
            ? new Date(existing.startsAt)
            : null;
      const mergedEndsAt =
        dto.endsAt !== undefined
          ? dto.endsAt
            ? new Date(dto.endsAt)
            : null
          : existing.endsAt
            ? new Date(existing.endsAt)
            : null;
      if (mergedStartsAt && mergedEndsAt && mergedEndsAt <= mergedStartsAt) {
        throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
      }

      const targetStatus = dto.status ?? existing.status;
      const targetUsageLimit = dto.usageLimit !== undefined ? dto.usageLimit : existing.usageLimit;
      const targetPerUserLimit =
        dto.perUserLimit !== undefined ? dto.perUserLimit : existing.perUserLimit;

      // No-op check
      const codeMatches = !normalizedCode || normalizedCode === existing.code;
      const statusMatches = targetStatus === existing.status;
      const typeMatches = mergedDiscountType === existing.discountType;
      const valueMatches = mergedDiscountValue.eq(new Decimal(existing.discountValue));
      const maxMatches =
        (mergedMaxDiscountAmount === null && existing.maxDiscountAmount === null) ||
        (mergedMaxDiscountAmount !== null &&
          existing.maxDiscountAmount !== null &&
          mergedMaxDiscountAmount.eq(new Decimal(existing.maxDiscountAmount)));
      const minMatches =
        (mergedMinOrderAmount === null && existing.minOrderAmount === null) ||
        (mergedMinOrderAmount !== null &&
          existing.minOrderAmount !== null &&
          mergedMinOrderAmount.eq(new Decimal(existing.minOrderAmount)));
      const usageLimitMatches = targetUsageLimit === existing.usageLimit;
      const perUserMatches = targetPerUserLimit === existing.perUserLimit;
      const startsMatches =
        (mergedStartsAt === null && existing.startsAt === null) ||
        (mergedStartsAt !== null &&
          existing.startsAt !== null &&
          mergedStartsAt.getTime() === new Date(existing.startsAt).getTime());
      const endsMatches =
        (mergedEndsAt === null && existing.endsAt === null) ||
        (mergedEndsAt !== null &&
          existing.endsAt !== null &&
          mergedEndsAt.getTime() === new Date(existing.endsAt).getTime());

      const usagesCount =
        existing._count?.usages ?? (await tx.voucherUsage.count({ where: { voucherId: id } }));

      if (
        codeMatches &&
        statusMatches &&
        typeMatches &&
        valueMatches &&
        maxMatches &&
        minMatches &&
        usageLimitMatches &&
        perUserMatches &&
        startsMatches &&
        endsMatches
      ) {
        return this.mapVoucherToResponse(existing, usagesCount);
      }

      // Monotonic update
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : Date.now();
      const monotonicDate = new Date(Math.max(Date.now(), existingTime + 1));

      const data: Prisma.VoucherUpdateInput = {
        updatedAt: monotonicDate,
      };
      if (dto.code) data.code = normalizedCode;
      if (dto.status) data.status = targetStatus;
      if (dto.discountType) data.discountType = mergedDiscountType;
      if (dto.discountValue !== undefined) data.discountValue = mergedDiscountValue;
      if (dto.maxDiscountAmount !== undefined) data.maxDiscountAmount = mergedMaxDiscountAmount;
      if (dto.minOrderAmount !== undefined) data.minOrderAmount = mergedMinOrderAmount;
      if (dto.usageLimit !== undefined) data.usageLimit = targetUsageLimit ?? null;
      if (dto.perUserLimit !== undefined) data.perUserLimit = targetPerUserLimit ?? null;
      if (dto.startsAt !== undefined) data.startsAt = mergedStartsAt;
      if (dto.endsAt !== undefined) data.endsAt = mergedEndsAt;

      try {
        const updated = await tx.voucher.update({
          where: { id },
          data,
          include: {
            _count: {
              select: { usages: true },
            },
          },
        });

        return this.mapVoucherToResponse(updated, updated._count.usages);
      } catch (err: unknown) {
        const errorObj =
          typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
        if (
          errorObj?.code === 'P2002' ||
          (typeof errorObj?.message === 'string' && errorObj.message.includes('Unique constraint'))
        ) {
          throw new ConflictException(`Mã giảm giá ${normalizedCode ?? dto.code} đã tồn tại`);
        }
        throw err;
      }
    });
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

  async listPromotions(query: ListPromotionsQuery): Promise<PromotionListResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const [total, promotions] = await Promise.all([
          tx.promotion.count(),
          tx.promotion.findMany({
            skip: skipOf(query),
            take: query.pageSize,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
        ]);

        const items = promotions.map((p) => this.mapPromotionToResponse(p));
        return toPage(items, total, query);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async createPromotion(dto: CreatePromotionDto): Promise<PromotionResponse> {
    const discountValue = new Decimal(dto.discountValue);
    if (discountValue.lte(0)) {
      throw new BadRequestException('Giá trị giảm phải lớn hơn 0');
    }

    if (dto.discountType === DiscountType.PERCENTAGE && discountValue.gt(100)) {
      throw new BadRequestException('Giá trị phần trăm không thể vượt quá 100%');
    }

    let maxDiscountAmount: Decimal | null = null;
    if (dto.maxDiscountAmount !== undefined && dto.maxDiscountAmount !== null) {
      maxDiscountAmount = new Decimal(dto.maxDiscountAmount);
      if (maxDiscountAmount.lte(0)) {
        throw new BadRequestException('Mức giảm tối đa phải lớn hơn 0');
      }
    }

    let minOrderAmount: Decimal | null = null;
    if (dto.minOrderAmount !== undefined && dto.minOrderAmount !== null) {
      minOrderAmount = new Decimal(dto.minOrderAmount);
      if (minOrderAmount.lt(0)) {
        throw new BadRequestException('Giá trị đơn tối thiểu không được âm');
      }
    }

    if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
    }

    const trimmedName = dto.name.trim();

    const runCreate = async () => {
      return this.prisma.$transaction(async (tx) => {
        if (dto.id) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.id}))`;

          const existing = await tx.promotion.findUnique({ where: { id: dto.id } });
          if (existing) {
            if (
              this.doesPromotionMatchPayload(
                existing,
                dto,
                trimmedName,
                discountValue,
                maxDiscountAmount,
                minOrderAmount,
              )
            ) {
              return this.mapPromotionToResponse(existing);
            }
            throw new ConflictException(
              'Mã định danh chương trình khuyến mãi đã tồn tại với nội dung khác.',
            );
          }
        }

        const promotion = await tx.promotion.create({
          data: {
            ...(dto.id ? { id: dto.id } : {}),
            name: trimmedName,
            discountType: dto.discountType,
            discountValue,
            maxDiscountAmount,
            minOrderAmount,
            conditions: (dto.conditions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            status: dto.status ?? PromotionStatus.ACTIVE,
            startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
            endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          },
        });

        return this.mapPromotionToResponse(promotion);
      });
    };

    try {
      return await runCreate();
    } catch (err: unknown) {
      const errorObj =
        typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
      const isUniqueError =
        errorObj?.code === 'P2002' ||
        (typeof errorObj?.message === 'string' && errorObj.message.includes('Unique constraint'));

      if (dto.id && isUniqueError) {
        // Query committed row outside aborted transaction
        const existing = await this.prisma.promotion.findUnique({ where: { id: dto.id } });
        if (existing) {
          if (
            this.doesPromotionMatchPayload(
              existing,
              dto,
              trimmedName,
              discountValue,
              maxDiscountAmount,
              minOrderAmount,
            )
          ) {
            return this.mapPromotionToResponse(existing);
          }
          throw new ConflictException(
            'Mã định danh chương trình khuyến mãi đã tồn tại với nội dung khác.',
          );
        }
      }

      throw err;
    }
  }

  private doesPromotionMatchPayload(
    existing: {
      name: string;
      discountType: DiscountType;
      discountValue: Decimal;
      maxDiscountAmount: Decimal | null;
      minOrderAmount: Decimal | null;
      conditions: Prisma.JsonValue | null;
      status: PromotionStatus;
      startsAt: Date | null;
      endsAt: Date | null;
    },
    dto: CreatePromotionDto,
    trimmedName: string,
    discountValue: Decimal,
    maxDiscountAmount: Decimal | null,
    minOrderAmount: Decimal | null,
  ): boolean {
    if (existing.name !== trimmedName) return false;
    if (existing.discountType !== dto.discountType) return false;
    if (!existing.discountValue.equals(discountValue)) return false;

    if (existing.maxDiscountAmount === null && maxDiscountAmount !== null) return false;
    if (existing.maxDiscountAmount !== null && maxDiscountAmount === null) return false;
    if (
      existing.maxDiscountAmount !== null &&
      maxDiscountAmount !== null &&
      !existing.maxDiscountAmount.equals(maxDiscountAmount)
    ) {
      return false;
    }

    if (existing.minOrderAmount === null && minOrderAmount !== null) return false;
    if (existing.minOrderAmount !== null && minOrderAmount === null) return false;
    if (
      existing.minOrderAmount !== null &&
      minOrderAmount !== null &&
      !existing.minOrderAmount.equals(minOrderAmount)
    ) {
      return false;
    }

    const expectedStatus = dto.status ?? PromotionStatus.ACTIVE;
    if (existing.status !== expectedStatus) return false;

    const existingStartsAt = existing.startsAt ? existing.startsAt.getTime() : null;
    const dtoStartsAt = dto.startsAt ? new Date(dto.startsAt).getTime() : null;
    if (existingStartsAt !== dtoStartsAt) return false;

    const existingEndsAt = existing.endsAt ? existing.endsAt.getTime() : null;
    const dtoEndsAt = dto.endsAt ? new Date(dto.endsAt).getTime() : null;
    if (existingEndsAt !== dtoEndsAt) return false;

    const existingCondStr = JSON.stringify(existing.conditions ?? null);
    const dtoCondStr = JSON.stringify(dto.conditions ?? null);
    if (existingCondStr !== dtoCondStr) return false;

    return true;
  }

  async updatePromotion(id: string, dto: UpdatePromotionDto): Promise<PromotionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lockPromotion(tx, id);
      if (!locked) {
        throw new NotFoundException('Không tìm thấy chương trình khuyến mãi');
      }

      const existing = await tx.promotion.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Không tìm thấy chương trình khuyến mãi');
      }

      if (isComplexConditions(existing.conditions)) {
        if (dto.conditions !== undefined) {
          throw new BadRequestException(
            'Chương trình khuyến mãi có cấu hình phức tạp (chỉ xem), không thể sửa hoặc xóa điều kiện.',
          );
        }
        if (dto.status !== undefined && dto.status !== existing.status) {
          throw new BadRequestException(
            'Chương trình khuyến mãi có cấu hình phức tạp (chỉ xem), không thể thay đổi trạng thái.',
          );
        }
      }

      if (dto.expectedUpdatedAt !== undefined) {
        const existingIso = existing.updatedAt.toISOString();
        if (existingIso !== dto.expectedUpdatedAt) {
          throw new ConflictException(
            'Dữ liệu chương trình khuyến mãi đã bị thay đổi bởi phiên làm việc khác. Vui lòng tải lại trước khi cập nhật.',
          );
        }
      }

      const mergedDiscountType = dto.discountType ?? existing.discountType;
      const mergedDiscountValue =
        dto.discountValue !== undefined ? new Decimal(dto.discountValue) : existing.discountValue;

      if (mergedDiscountValue.lte(0)) {
        throw new BadRequestException('Giá trị giảm phải lớn hơn 0');
      }
      if (mergedDiscountType === DiscountType.PERCENTAGE && mergedDiscountValue.gt(100)) {
        throw new BadRequestException('Giá trị phần trăm không thể vượt quá 100%');
      }

      let mergedMaxDiscountAmount = existing.maxDiscountAmount;
      if (dto.maxDiscountAmount !== undefined) {
        mergedMaxDiscountAmount = dto.maxDiscountAmount ? new Decimal(dto.maxDiscountAmount) : null;
      }
      if (mergedMaxDiscountAmount && mergedMaxDiscountAmount.lte(0)) {
        throw new BadRequestException('Mức giảm tối đa phải lớn hơn 0');
      }

      let mergedMinOrderAmount = existing.minOrderAmount;
      if (dto.minOrderAmount !== undefined) {
        mergedMinOrderAmount = dto.minOrderAmount ? new Decimal(dto.minOrderAmount) : null;
      }
      if (mergedMinOrderAmount && mergedMinOrderAmount.lt(0)) {
        throw new BadRequestException('Giá trị đơn tối thiểu không được âm');
      }

      const mergedStartsAt =
        dto.startsAt !== undefined
          ? dto.startsAt
            ? new Date(dto.startsAt)
            : null
          : existing.startsAt;
      const mergedEndsAt =
        dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : existing.endsAt;
      if (mergedStartsAt && mergedEndsAt && mergedEndsAt <= mergedStartsAt) {
        throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
      }

      // Kiểm tra no-op (không có trường nào thay đổi giá trị)
      let isNoOp = true;
      if (dto.name !== undefined && dto.name.trim() !== existing.name) isNoOp = false;
      if (dto.discountType !== undefined && dto.discountType !== existing.discountType)
        isNoOp = false;
      if (
        dto.discountValue !== undefined &&
        !new Decimal(dto.discountValue).equals(existing.discountValue)
      ) {
        isNoOp = false;
      }
      if (dto.maxDiscountAmount !== undefined) {
        if (existing.maxDiscountAmount === null && dto.maxDiscountAmount !== null) isNoOp = false;
        else if (existing.maxDiscountAmount !== null && dto.maxDiscountAmount === null)
          isNoOp = false;
        else if (
          existing.maxDiscountAmount !== null &&
          dto.maxDiscountAmount !== null &&
          !existing.maxDiscountAmount.equals(new Decimal(dto.maxDiscountAmount))
        ) {
          isNoOp = false;
        }
      }
      if (dto.minOrderAmount !== undefined) {
        if (existing.minOrderAmount === null && dto.minOrderAmount !== null) isNoOp = false;
        else if (existing.minOrderAmount !== null && dto.minOrderAmount === null) isNoOp = false;
        else if (
          existing.minOrderAmount !== null &&
          dto.minOrderAmount !== null &&
          !existing.minOrderAmount.equals(new Decimal(dto.minOrderAmount))
        ) {
          isNoOp = false;
        }
      }
      if (dto.status !== undefined && dto.status !== existing.status) isNoOp = false;
      if (dto.startsAt !== undefined) {
        const t1 = existing.startsAt ? existing.startsAt.getTime() : null;
        const t2 = dto.startsAt ? new Date(dto.startsAt).getTime() : null;
        if (t1 !== t2) isNoOp = false;
      }
      if (dto.endsAt !== undefined) {
        const t1 = existing.endsAt ? existing.endsAt.getTime() : null;
        const t2 = dto.endsAt ? new Date(dto.endsAt).getTime() : null;
        if (t1 !== t2) isNoOp = false;
      }
      if (dto.conditions !== undefined) {
        if (JSON.stringify(dto.conditions) !== JSON.stringify(existing.conditions)) {
          isNoOp = false;
        }
      }

      if (isNoOp) {
        return this.mapPromotionToResponse(existing);
      }

      const existingTime = existing.updatedAt.getTime();
      const monotonicUpdatedAt = new Date(Math.max(Date.now(), existingTime + 1));

      const data: Prisma.PromotionUpdateInput = {
        updatedAt: monotonicUpdatedAt,
      };
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.discountType !== undefined) data.discountType = dto.discountType;
      if (dto.discountValue !== undefined) data.discountValue = mergedDiscountValue;
      if (dto.maxDiscountAmount !== undefined) data.maxDiscountAmount = mergedMaxDiscountAmount;
      if (dto.minOrderAmount !== undefined) data.minOrderAmount = mergedMinOrderAmount;
      if (dto.conditions !== undefined) {
        data.conditions = (dto.conditions as Prisma.InputJsonValue) ?? Prisma.JsonNull;
      }
      if (dto.startsAt !== undefined) data.startsAt = mergedStartsAt;
      if (dto.endsAt !== undefined) data.endsAt = mergedEndsAt;

      const updated = await tx.promotion.update({
        where: { id },
        data,
      });

      return this.mapPromotionToResponse(updated);
    });
  }

  async getPromotionById(id: string): Promise<PromotionResponse> {
    const promo = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promo) {
      throw new NotFoundException('Không tìm thấy chương trình khuyến mãi');
    }
    return this.mapPromotionToResponse(promo);
  }

  async deletePromotion(id: string): Promise<{ ok: boolean; message: string }> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lockPromotion(tx, id);
      if (!locked) {
        throw new NotFoundException('Không tìm thấy chương trình khuyến mãi');
      }
      const promo = await tx.promotion.findUnique({ where: { id } });
      if (!promo) {
        throw new NotFoundException('Không tìm thấy chương trình khuyến mãi');
      }
      await tx.promotion.update({
        where: { id },
        data: { status: PromotionStatus.INACTIVE },
      });
      return {
        ok: true,
        message: 'Đã chuyển trạng thái chương trình khuyến mãi sang ngưng hoạt động (INACTIVE)',
      };
    });
  }

  /**
   * Tính toán các chỉ số khách hàng phục vụ phân khúc (NEW, VIP, LOYAL).
   */
  async getCustomerMetrics(userId: string): Promise<CustomerMetrics> {
    const [orderCount, sumAggregate] = await Promise.all([
      this.prisma.order.count({
        where: {
          userId,
          status: {
            in: [
              OrderStatus.CONFIRMED,
              OrderStatus.PROCESSING,
              OrderStatus.SHIPPED,
              OrderStatus.DELIVERED,
            ],
          },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          userId,
          status: {
            in: [
              OrderStatus.CONFIRMED,
              OrderStatus.PROCESSING,
              OrderStatus.SHIPPED,
              OrderStatus.DELIVERED,
            ],
          },
        },
        _sum: {
          totalAmount: true,
        },
      }),
    ]);

    const totalSpent = sumAggregate._sum.totalAmount ?? new Decimal(0);
    const isNewCustomer = orderCount === 0;
    const isVipCustomer = totalSpent.gte(2_000_000) || orderCount >= 3;

    return {
      orderCount,
      totalSpent,
      isNewCustomer,
      isVipCustomer,
    };
  }

  /**
   * Đánh giá toàn bộ chương trình khuyến mãi động khả dụng cho giỏ hàng.
   */
  async evaluateCart(
    dto: EvaluatePromotionsDto,
    userId?: string,
  ): Promise<EvaluatePromotionsResponse> {
    const subtotal = new Decimal(dto.subtotal);
    if (subtotal.lte(0)) {
      throw new BadRequestException('Giá trị giỏ hàng phải lớn hơn 0 để tính toán khuyến mãi');
    }

    const now = new Date();
    let customerMetrics: CustomerMetrics | undefined;
    if (userId) {
      customerMetrics = await this.getCustomerMetrics(userId);
    }

    const context: PromotionContext = {
      userId,
      subtotal,
      items: dto.items?.map((item) => ({
        variantId: item.variantId,
        categorySlug: item.categorySlug,
        price: new Decimal(item.price),
        quantity: item.quantity,
      })),
      now,
      customerMetrics,
    };

    const activePromotions = await this.prisma.promotion.findMany({
      where: {
        status: PromotionStatus.ACTIVE,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });

    const applicablePromotions: EvaluatedPromotionItem[] = [];

    for (const promo of activePromotions) {
      const evalResult = await this.evaluator.evaluateCandidate(
        {
          id: promo.id,
          name: promo.name,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          maxDiscountAmount: promo.maxDiscountAmount,
          minOrderAmount: promo.minOrderAmount,
          conditions: promo.conditions as Record<string, unknown> | null,
        },
        context,
      );

      if (evalResult.eligible && evalResult.evaluated) {
        applicablePromotions.push({
          promotionId: evalResult.evaluated.promotionId,
          name: evalResult.evaluated.name,
          discountType: evalResult.evaluated.discountType,
          discountAmount: evalResult.evaluated.discountAmount.toFixed(0),
          finalAmount: evalResult.evaluated.finalAmount.toFixed(0),
          breakdown: evalResult.evaluated.breakdown,
        });
      }
    }

    let bestPromotion: EvaluatedPromotionItem | null = null;
    if (applicablePromotions.length > 0) {
      bestPromotion = applicablePromotions.reduce((prev, curr) =>
        new Decimal(curr.discountAmount).gt(new Decimal(prev.discountAmount)) ? curr : prev,
      );
    }

    return {
      subtotal: subtotal.toFixed(0),
      applicablePromotions,
      bestPromotion,
    };
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
