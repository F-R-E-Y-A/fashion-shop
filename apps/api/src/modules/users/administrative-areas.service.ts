import { Injectable } from '@nestjs/common';

import { AdministrativeAreaLevel, type Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { AdministrativeAreaResponse } from './dto/administrative-area.dto.js';

const areaSelect = {
  id: true,
  code: true,
  name: true,
  level: true,
  parentId: true,
} satisfies Prisma.AdministrativeAreaSelect;

/**
 * Dieu kien de mot khu vuc duoc dung lam dia chi giao hang: bac XA, dang hoat dong, va thuoc mot TINH
 * dang hoat dong. Mo hinh hai bac Tinh -> Xa, khong co bac huyen (docs/shared/data-model.md).
 */
export const deliverableCommuneWhere = {
  level: AdministrativeAreaLevel.COMMUNE,
  isActive: true,
  parent: { is: { level: AdministrativeAreaLevel.PROVINCE, isActive: true } },
} satisfies Prisma.AdministrativeAreaWhereInput;

/** Du lieu tham chieu cho form dia chi: chi doc, chi ban ghi dang hoat dong. */
@Injectable()
export class AdministrativeAreasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Danh sach co gioi han tu nhien (vai chuc tinh, vai tram xa moi tinh) nen tra mang, khong phan trang,
   * theo tien le cay danh muc cua products. parentId khong ton tai, khong phai tinh hay da ngung hoat
   * dong thi tra mang rong.
   */
  list(parentId?: string): Promise<AdministrativeAreaResponse[]> {
    const where: Prisma.AdministrativeAreaWhereInput = parentId
      ? {
          ...deliverableCommuneWhere,
          parentId,
        }
      : { level: AdministrativeAreaLevel.PROVINCE, isActive: true };

    return this.prisma.administrativeArea.findMany({
      where,
      select: areaSelect,
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });
  }
}
