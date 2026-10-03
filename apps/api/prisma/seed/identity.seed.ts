import type { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Danh muc vai (CUSTOMER, ADMIN) KHONG nap o day nua ma do migration 20260930120000_ph3_role_catalog
 * nap, vi production khong chay seed ma dang ky van can vai CUSTOMER (ADR-018).
 *
 * Seed cung khong the upsert lai tu RoleCode: tep nay chay ca trong image API (SEED_ON_START o
 * staging), noi chi co src/generated chu khong co src/modules. Chep ma vai sang day se thanh nguon thu
 * hai de lech. Ham chi dem vai hien co de dong log cua seed van noi dung.
 */
export async function seedIdentity(prisma: PrismaClient): Promise<{ roles: number }> {
  return { roles: await prisma.role.count() };
}
