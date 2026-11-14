import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { prismaConnection } from '../src/infra/prisma/connection.js';
import { assertTestDatabaseConnection } from '../src/infra/prisma/database-url-safety.js';
import type { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { ReportingAggregatorService } from '../src/modules/reporting/reporting-aggregator.service.js';
import { OrdersSourceReader } from '../src/modules/reporting/source-readers/orders-source.reader.js';
import { PaymentsSourceReader } from '../src/modules/reporting/source-readers/payments-source.reader.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });

async function main() {
  const connectionString = assertTestDatabaseConnection(
    process.env.DATABASE_URL_TEST,
    process.env.DATABASE_URL,
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg(prismaConnection(connectionString)),
  });

  try {
    const prismaService = prisma as unknown as PrismaService;
    const paymentsReader = new PaymentsSourceReader(prismaService);
    const ordersReader = new OrdersSourceReader(prismaService);
    const aggregator = new ReportingAggregatorService(prismaService, paymentsReader, ordersReader);

    // Tim customer va variant tu E2E fixture
    const customer = await prisma.user.findFirst({
      where: { email: 'e2e-khach@fixture.test' },
    });
    if (!customer) {
      throw new Error('Khong tim thay customer E2E fixture: can chay e2e:seed truoc.');
    }

    const variant = await prisma.productVariant.findFirstOrThrow({
      include: { product: true },
    });

    const existingOrder = await prisma.order.findFirst({
      where: { orderCode: 'ORD-E2E-REPORT-01' },
    });

    if (!existingOrder) {
      const order = await prisma.order.create({
        data: {
          userId: customer.id,
          customerEmail: customer.email,
          orderCode: 'ORD-E2E-REPORT-01',
          status: 'DELIVERED',
          totalAmount: '450000.00',
          subtotalAmount: '420000.00',
          shippingFeeAmount: '30000.00',
          discountAmount: '0.00',
          checkoutFingerprint: randomUUID(),
          shippingAddressSnapshot: { recipientName: 'Khách E2E' },
          items: {
            create: [
              {
                productVariantId: variant.id,
                quantity: 2,
                unitPrice: '210000.00',
                productSnapshot: { name: variant.product.name },
              },
            ],
          },
          statusHistory: {
            create: [
              { status: 'PENDING_CONFIRMATION', createdAt: new Date() },
              { status: 'DELIVERED', createdAt: new Date() },
            ],
          },
        },
      });

      await prisma.payment.create({
        data: {
          orderId: order.id,
          method: 'COD',
          gateway: 'COD',
          status: 'SUCCEEDED',
          amount: '450000.00',
          reference: `REF-COD-${randomUUID()}`,
          transactions: {
            create: [
              {
                gateway: 'COD',
                externalTransactionId: `COD:${order.orderCode}:del01`,
                status: 'PROCESSED',
                createdAt: new Date(),
                payload: { collectedAt: new Date().toISOString() },
              },
            ],
          },
        },
      });
    }

    // Chay tong hop snapshot
    const refreshResult = await aggregator.refreshSnapshot();
    if (!refreshResult.success) {
      throw new Error(`Refresh failed: ${refreshResult.error}`);
    }

    console.warn('Seed reporting E2E thanh cong!');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
