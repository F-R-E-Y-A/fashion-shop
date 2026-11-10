import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { deliverableCommuneWhere } from './administrative-areas.service.js';
import type {
  AddressResponse,
  CreateAddressRequest,
  UpdateAddressRequest,
} from './dto/address.dto.js';

/** Allowlist cot tra ve: khong co userId. Khu vuc kem tinh cha de giao dien khong phai goi them. */
const addressSelect = {
  id: true,
  recipientName: true,
  phone: true,
  administrativeAreaId: true,
  detailAddress: true,
  postalCode: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
  administrativeArea: {
    select: {
      id: true,
      code: true,
      name: true,
      parent: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.AddressSelect;

type AddressRow = Prisma.AddressGetPayload<{ select: typeof addressSelect }>;
type Tx = Prisma.TransactionClient;

type Outcome<T> =
  | { status: 'OK'; value: T }
  | { status: 'NOT_FOUND' }
  | { status: 'INVALID_AREA' }
  | { status: 'DEFAULT_REQUIRED' };

/** Thu tu hien thi: mac dinh truoc, roi cu truoc moi; id pha hoa de on dinh. */
const listOrder: Prisma.AddressOrderByWithRelationInput[] = [
  { isDefault: 'desc' },
  { createdAt: 'asc' },
  { id: 'asc' },
];

/** Thu tu chon dia chi len thay khi xoa dia chi mac dinh: cu nhat truoc, id pha hoa (ADR-023). */
const promotionOrder: Prisma.AddressOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

/**
 * So dia chi cua CHINH nguoi dang dang nhap. Moi truy van deu loc theo `userId` cua CurrentUser: dia chi
 * cua nguoi khac va dia chi khong ton tai deu la 404 giong het nhau, khong lo dia chi nao ton tai.
 *
 * Bat bien: co it nhat mot dia chi thi co DUNG mot dia chi mac dinh. Moi thao tac ghi giu khoa advisory
 * theo tung user trong giao dich (xem lockAddressBook), nen cac thao tac cua cung mot nguoi xep hang va
 * doc duoc trang thai moi nhat; chi muc duy nhat mot mac dinh moi user o CSDL la chot chan cuoi.
 * Khong nem loi HTTP trong giao dich: tra ket qua roi map sau khi commit (cung ky luat voi AuthService).
 */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AddressResponse[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      select: addressSelect,
      orderBy: listOrder,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async create(userId: string, request: CreateAddressRequest): Promise<AddressResponse> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<Outcome<AddressRow>> => {
      await this.lockAddressBook(tx, userId);
      if (!(await this.isDeliverableCommune(tx, request.administrativeAreaId))) {
        return { status: 'INVALID_AREA' };
      }

      const existing = await tx.address.count({ where: { userId } });
      const makeDefault = existing === 0 || request.isDefault === true;
      if (makeDefault && existing > 0) await this.clearDefault(tx, userId);

      const created = await tx.address.create({
        data: {
          userId,
          recipientName: request.recipientName,
          phone: request.phone,
          administrativeAreaId: request.administrativeAreaId,
          detailAddress: request.detailAddress,
          postalCode: request.postalCode ?? null,
          isDefault: makeDefault,
        },
        select: addressSelect,
      });
      return { status: 'OK', value: created };
    });
    return this.toResponse(this.unwrap(outcome));
  }

  async update(
    userId: string,
    id: string,
    request: UpdateAddressRequest,
  ): Promise<AddressResponse> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<Outcome<AddressRow>> => {
      await this.lockAddressBook(tx, userId);
      const current = await tx.address.findFirst({
        where: { id, userId },
        select: { isDefault: true },
      });
      if (!current) return { status: 'NOT_FOUND' };
      if (request.isDefault === false && current.isDefault) return { status: 'DEFAULT_REQUIRED' };
      if (
        request.administrativeAreaId !== undefined &&
        !(await this.isDeliverableCommune(tx, request.administrativeAreaId))
      ) {
        return { status: 'INVALID_AREA' };
      }

      const becomesDefault = request.isDefault === true && !current.isDefault;
      if (becomesDefault) await this.clearDefault(tx, userId);

      // Chep tung truong duoc phep; khong bao gio rai ca request vao `data`.
      const data: Prisma.AddressUpdateInput = {
        ...(request.recipientName !== undefined ? { recipientName: request.recipientName } : {}),
        ...(request.phone !== undefined ? { phone: request.phone } : {}),
        ...(request.administrativeAreaId !== undefined
          ? { administrativeArea: { connect: { id: request.administrativeAreaId } } }
          : {}),
        ...(request.detailAddress !== undefined ? { detailAddress: request.detailAddress } : {}),
        ...(request.postalCode !== undefined ? { postalCode: request.postalCode } : {}),
        ...(becomesDefault ? { isDefault: true } : {}),
      };
      const updated =
        Object.keys(data).length === 0
          ? await tx.address.findFirstOrThrow({ where: { id, userId }, select: addressSelect })
          : await tx.address.update({ where: { id, userId }, data, select: addressSelect });
      return { status: 'OK', value: updated };
    });
    return this.toResponse(this.unwrap(outcome));
  }

  async remove(userId: string, id: string): Promise<void> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<Outcome<null>> => {
      await this.lockAddressBook(tx, userId);
      const current = await tx.address.findFirst({
        where: { id, userId },
        select: { isDefault: true },
      });
      if (!current) return { status: 'NOT_FOUND' };

      await tx.address.delete({ where: { id, userId } });
      if (current.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: promotionOrder,
          select: { id: true },
        });
        if (next) {
          await tx.address.update({ where: { id: next.id, userId }, data: { isDefault: true } });
        }
      }
      return { status: 'OK', value: null };
    });
    this.unwrap(outcome);
  }

  /**
   * Khoa advisory theo giao dich, khoa theo user: moi thao tac ghi so dia chi cua cung mot nguoi chay lan
   * luot, tu nhả khi commit hay rollback. Dung khoa rieng thay vi khoa dong `users` de khong cho doi dang
   * nhap hay refresh (hai thao tac do khoa dong `users`, ADR-022). Khoa trong Postgres nen dung duoc khi
   * nhieu ban sao API cung chay; khong dung mutex trong bo nho tien trinh.
   */
  private async lockAddressBook(tx: Tx, userId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`user-addresses:${userId}`}, 0))`;
  }

  private async clearDefault(tx: Tx, userId: string): Promise<void> {
    await tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async isDeliverableCommune(tx: Tx, areaId: string): Promise<boolean> {
    const area = await tx.administrativeArea.findFirst({
      where: { id: areaId, ...deliverableCommuneWhere },
      select: { id: true },
    });
    return area !== null;
  }

  private unwrap<T>(outcome: Outcome<T>): T {
    switch (outcome.status) {
      case 'OK':
        return outcome.value;
      case 'NOT_FOUND':
        throw new NotFoundException('Khong tim thay dia chi');
      case 'INVALID_AREA':
        throw new UnprocessableEntityException({
          error: 'INVALID_ADMINISTRATIVE_AREA',
          message:
            'administrativeAreaId phai la mot xa dang hoat dong thuoc mot tinh dang hoat dong',
        });
      case 'DEFAULT_REQUIRED':
        throw new ConflictException({
          error: 'DEFAULT_ADDRESS_REQUIRED',
          message: 'Phai luon co mot dia chi mac dinh; hay dat dia chi khac lam mac dinh',
        });
    }
  }

  private toResponse(row: AddressRow): AddressResponse {
    const { administrativeArea: area } = row;
    return {
      id: row.id,
      recipientName: row.recipientName,
      phone: row.phone,
      administrativeAreaId: row.administrativeAreaId,
      administrativeArea: {
        id: area.id,
        code: area.code,
        name: area.name,
        province: area.parent,
      },
      detailAddress: row.detailAddress,
      postalCode: row.postalCode,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
