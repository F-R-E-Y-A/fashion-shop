import { Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { deliverableCommuneWhere } from './administrative-areas.service.js';

@Injectable()
export class CheckoutAddressService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, id: string, tx?: Prisma.TransactionClient) {
    const row = await (tx ?? this.prisma).address.findFirst({
      where: { id, userId, administrativeArea: deliverableCommuneWhere },
      include: { administrativeArea: { include: { parent: true } } },
    });
    if (!row) throw new NotFoundException('Địa chỉ không tồn tại hoặc không còn hỗ trợ giao hàng.');
    return {
      id: row.id,
      recipientName: row.recipientName,
      phone: row.phone,
      administrativeAreaId: row.administrativeAreaId,
      commune: row.administrativeArea.name,
      province: row.administrativeArea.parent!.name,
      detailAddress: row.detailAddress,
      postalCode: row.postalCode,
    };
  }
}
