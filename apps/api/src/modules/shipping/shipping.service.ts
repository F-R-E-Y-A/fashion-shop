import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(areaId: string, subtotal: string, tx?: Prisma.TransactionClient) {
    const row = await (tx ?? this.prisma).shippingRate.findFirst({
      where: {
        isActive: true,
        minWeightGrams: null,
        maxWeightGrams: null,
        shippingZone: {
          isActive: true,
          shippingZoneAreas: { some: { administrativeAreaId: areaId } },
        },
      },
      orderBy: { id: 'asc' },
    });
    if (!row) throw new UnprocessableEntityException('Địa chỉ này chưa có biểu phí giao hàng.');
    return {
      rateId: row.id,
      fee: new Decimal(subtotal).gte(500_000) ? '0.00' : row.fee.toFixed(2),
    };
  }
}
