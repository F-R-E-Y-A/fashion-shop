import type { PrismaClient } from '../../src/generated/prisma/client.js';

const zoneId = '11000000-0000-4000-8000-000000000001';
const rateId = '11000000-0000-4000-8000-000000000002';

/** Chinh sach Freya: 30k/ don noi dia; giu nguyen rate nguoi da chinh. Khong seed ton gia. */
export async function seedShipping(prisma: PrismaClient) {
  await prisma.shippingZone.upsert({
    where: { id: zoneId },
    create: { id: zoneId, code: 'FREYA-DOMESTIC', name: 'Giao hàng trong nước' },
    update: {},
  });
  await prisma.shippingRate.upsert({
    where: { id: rateId },
    create: { id: rateId, shippingZoneId: zoneId, fee: '30000' },
    update: {},
  });
  const areas = await prisma.administrativeArea.findMany({
    where: { level: 'COMMUNE', isActive: true, parent: { isActive: true } },
    select: { id: true },
  });
  await prisma.shippingZoneArea.createMany({
    data: areas.map((area) => ({ shippingZoneId: zoneId, administrativeAreaId: area.id })),
    skipDuplicates: true,
  });
}
