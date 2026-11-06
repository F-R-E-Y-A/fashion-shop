/**
 * Nap du lieu cho kiem thu E2E (Playwright o apps/web/e2e): xoa sach CSDL KIEM THU roi tao
 * mot khach, mot admin, dia chi mac dinh, phi van chuyen va ton kho cho mot bien the fixture.
 *
 *   npm run e2e:seed -w apps/api
 *
 * Chi chay tren DATABASE_URL_TEST, giong test/setup-env.ts: resetDatabase() xoa moi bang.
 * In ra mot dong JSON mo ta fixture (email, mat khau, slug, mau, co) de Playwright doc,
 * nen bai E2E khong go lai hang so cua seed.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { config as loadEnv } from 'dotenv';

import { seedShipping } from '../../prisma/seed/shipping.seed.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { prismaConnection } from '../../src/infra/prisma/connection.js';
import { grantAdminRole } from '../../src/modules/auth/grant-admin-role.js';
import { resetDatabase } from '../helpers/db.js';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) throw new Error('Thieu DATABASE_URL_TEST. Chay: npm run db:test:prepare');
if (testUrl === process.env.DATABASE_URL && process.env.CI !== 'true')
  throw new Error('DATABASE_URL_TEST trung DATABASE_URL: seed E2E se xoa sach du lieu that.');

const PASSWORD = 'E2e-Password-123';
const fixture = {
  customer: { email: 'e2e-khach@fixture.test', password: PASSWORD },
  admin: { email: 'e2e-admin@fixture.test', password: PASSWORD },
  product: { slug: 'ao-thun-co-tron-basic', color: 'den', size: 'M', stock: 5 },
};

async function activeUser(prisma: PrismaClient, email: string, fullName: string) {
  const customerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'CUSTOMER' } });
  return prisma.user.create({
    data: {
      email,
      // Cost 4 cho nhanh; bcrypt.compare doc cost tu chuoi bam nen dang nhap that van khop.
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      fullName,
      phone: '0901234567',
      userRoles: { create: { roleId: customerRole.id } },
    },
  });
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(prismaConnection(testUrl!)) });
  try {
    await resetDatabase(prisma);

    const customer = await activeUser(prisma, fixture.customer.email, 'Khach E2E');
    await activeUser(prisma, fixture.admin.email, 'Admin E2E');
    const granted = await grantAdminRole(prisma, fixture.admin.email);
    if (granted.outcome !== 'GRANTED') throw new Error(`Khong cap duoc ADMIN: ${granted.outcome}`);

    const province = await prisma.administrativeArea.create({
      data: { code: 'E2E01', name: 'Tỉnh E2E', level: 'PROVINCE' },
    });
    const commune = await prisma.administrativeArea.create({
      data: { code: 'E2E0101', name: 'Phường E2E', level: 'COMMUNE', parentId: province.id },
    });
    // Sau khi co xa: seedShipping chi gan bieu phi cho xa da ton tai.
    await seedShipping(prisma);
    await prisma.address.create({
      data: {
        userId: customer.id,
        administrativeAreaId: commune.id,
        recipientName: 'Khách E2E',
        phone: '0901234567',
        detailAddress: '1 Đường Kiểm Thử',
        isDefault: true,
      },
    });

    const { slug, color, size, stock } = fixture.product;
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { product: { slug }, color: { code: color }, size: { code: size } },
    });
    await prisma.inventory.create({
      data: { productVariantId: variant.id, quantityOnHand: stock },
    });

    console.log(JSON.stringify({ ...fixture, variantId: variant.id }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Loi khong xac dinh');
  process.exitCode = 1;
});
