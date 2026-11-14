import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { prismaConnection } from '../src/infra/prisma/connection.js';
import type { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { ReportingAggregatorService } from '../src/modules/reporting/reporting-aggregator.service.js';
import { OrdersSourceReader } from '../src/modules/reporting/source-readers/orders-source.reader.js';
import { PaymentsSourceReader } from '../src/modules/reporting/source-readers/payments-source.reader.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Thieu bien moi truong DATABASE_URL');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(prismaConnection(connectionString)),
  });

  try {
    const prismaService = prisma as unknown as PrismaService;
    const paymentsReader = new PaymentsSourceReader(prismaService);
    const ordersReader = new OrdersSourceReader(prismaService);
    const aggregator = new ReportingAggregatorService(prismaService, paymentsReader, ordersReader);

    console.warn('Bat dau tong hop bao cao thong ke...');
    const result = await aggregator.refreshSnapshot();

    if (result.success) {
      console.warn(
        `Tong hop thanh cong! Snapshot version: ${result.snapshotVersion}, asOf: ${result.asOf}`,
      );
      console.warn(`- Daily revenue records: ${result.dailyRevenueCount}`);
      console.warn(`- Orders by status records: ${result.ordersByStatusCount}`);
      console.warn(`- Top selling products records: ${result.topSellingProductCount}`);
      process.exit(0);
    } else if (result.skippedDueToLock) {
      console.warn('Bo qua: Mot tien trinh khac dang thuc hien tong hop.');
      process.exit(0);
    } else {
      console.error('Tong hop that bai:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Loi bat ngo khi chay CLI refresh-reports:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
