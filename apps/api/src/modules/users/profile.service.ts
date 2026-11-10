import { Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ProfileResponse, UpdateProfileRequest } from './dto/profile.dto.js';

/** Allowlist cot cua ho so: them truong vao response thi them o day, co chu y. */
const profileSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
} satisfies Prisma.UserSelect;

/**
 * Ho so cua CHINH nguoi dang dang nhap. userId luon lay tu CurrentUser (AuthGuard da xac minh), khong
 * bao gio tu than, query hay header, nen khong co cach nao doc hay sua ho so nguoi khac qua day.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<ProfileResponse> {
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });
    // AuthGuard vua thay tai khoan nay; khong co API xoa user, nen nhanh nay chi la phong ve.
    if (!profile) throw new NotFoundException('Khong tim thay nguoi dung');
    return profile;
  }

  async update(userId: string, request: UpdateProfileRequest): Promise<ProfileResponse> {
    // Chep tung truong duoc phep, khong rai ca doi tuong request vao `data`.
    const data: Prisma.UserUpdateInput = {
      ...(request.fullName !== undefined ? { fullName: request.fullName } : {}),
      ...(request.phone !== undefined ? { phone: request.phone } : {}),
    };
    if (Object.keys(data).length === 0) return this.get(userId);

    return this.prisma.user.update({ where: { id: userId }, data, select: profileSelect });
  }
}
