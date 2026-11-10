import { PrismaClient } from '../../src/generated/prisma/client.js';
import { DiscountType, PromotionStatus, VoucherStatus } from '../../src/generated/prisma/enums.js';

export const SAMPLE_VOUCHERS = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    code: 'FREYA10',
    status: VoucherStatus.ACTIVE,
    discountType: DiscountType.PERCENTAGE,
    discountValue: '10',
    maxDiscountAmount: '50000',
    minOrderAmount: '200000',
    usageLimit: 100,
    perUserLimit: 2,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    code: 'GIAM50K',
    status: VoucherStatus.ACTIVE,
    discountType: DiscountType.FIXED_AMOUNT,
    discountValue: '50000',
    maxDiscountAmount: null,
    minOrderAmount: '300000',
    usageLimit: 50,
    perUserLimit: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    code: 'CHAOBANMOI',
    status: VoucherStatus.ACTIVE,
    discountType: DiscountType.FIXED_AMOUNT,
    discountValue: '30000',
    maxDiscountAmount: null,
    minOrderAmount: '150000',
    usageLimit: 500,
    perUserLimit: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    code: 'FREYAVIP',
    status: VoucherStatus.ACTIVE,
    discountType: DiscountType.PERCENTAGE,
    discountValue: '20',
    maxDiscountAmount: '100000',
    minOrderAmount: '400000',
    usageLimit: 20,
    perUserLimit: 1,
  },
];

export const SAMPLE_PROMOTIONS = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    name: 'Khuyến mãi Khai trương mùa thu Freya 2026',
    discountType: DiscountType.PERCENTAGE,
    discountValue: '15',
    maxDiscountAmount: '100000',
    minOrderAmount: '300000',
    status: PromotionStatus.ACTIVE,
  },
];

export async function seedPromotions(
  prisma: PrismaClient,
): Promise<{ vouchers: number; promotions: number }> {
  for (const v of SAMPLE_VOUCHERS) {
    await prisma.voucher.upsert({
      where: { code: v.code },
      update: {
        status: v.status,
        discountType: v.discountType,
        discountValue: v.discountValue,
        maxDiscountAmount: v.maxDiscountAmount,
        minOrderAmount: v.minOrderAmount,
        usageLimit: v.usageLimit,
        perUserLimit: v.perUserLimit,
      },
      create: v,
    });
  }

  for (const p of SAMPLE_PROMOTIONS) {
    await prisma.promotion.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        discountType: p.discountType,
        discountValue: p.discountValue,
        maxDiscountAmount: p.maxDiscountAmount,
        minOrderAmount: p.minOrderAmount,
        status: p.status,
      },
      create: p,
    });
  }

  return { vouchers: SAMPLE_VOUCHERS.length, promotions: SAMPLE_PROMOTIONS.length };
}
