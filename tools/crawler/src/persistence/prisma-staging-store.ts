import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from '../../../../apps/api/src/generated/prisma/client.ts';
import type { NormalizedCandidateOutput } from '../contracts/normalized-product.ts';
import type { RawProductEnvelope } from '../contracts/raw-product.ts';
import type {
  CandidateRecordState,
  ProductState,
  RawRecordState,
  StagingStore,
  StagingTransaction,
  StagingVerification,
} from './staging-contracts.ts';
import { rawPayload } from './staging-input.ts';

function candidateData(candidate: NormalizedCandidateOutput) {
  return {
    name: candidate.name,
    categoryName: candidate.categoryName,
    price: candidate.price,
    attributes: candidate.attributes as unknown as Prisma.InputJsonValue,
    imageHash: candidate.imageHash,
    normalizationStatus: candidate.normalizationStatus,
  };
}

class PrismaStagingTransaction implements StagingTransaction {
  private readonly transaction: Prisma.TransactionClient;

  constructor(transaction: Prisma.TransactionClient) {
    this.transaction = transaction;
  }

  async findRaw(source: string, sourceProductId: string): Promise<RawRecordState | null> {
    return this.transaction.rawProductRecord.findUnique({
      where: { source_sourceProductId: { source, sourceProductId } },
      select: { id: true },
    });
  }

  async createRaw(raw: RawProductEnvelope): Promise<RawRecordState> {
    return this.transaction.rawProductRecord.create({
      data: {
        source: raw.source,
        sourceProductId: raw.sourceProductId,
        sourceUrl: raw.sourceUrl,
        rawPayload: rawPayload(raw) as Prisma.InputJsonValue,
        collectedAt: new Date(raw.collectedAt),
      },
      select: { id: true },
    });
  }

  async updateRaw(id: string, raw: RawProductEnvelope): Promise<RawRecordState> {
    return this.transaction.rawProductRecord.update({
      where: { id },
      data: {
        sourceUrl: raw.sourceUrl,
        rawPayload: rawPayload(raw) as Prisma.InputJsonValue,
        collectedAt: new Date(raw.collectedAt),
      },
      select: { id: true },
    });
  }

  async findCandidate(rawProductRecordId: string): Promise<CandidateRecordState | null> {
    return this.transaction.normalizedProductCandidate
      .findUnique({
        where: { rawProductRecordId },
        select: { id: true, normalizationStatus: true },
      })
      .then((candidate) =>
        candidate ? { id: candidate.id, status: candidate.normalizationStatus } : null,
      );
  }

  async createCandidate(
    rawProductRecordId: string,
    candidate: NormalizedCandidateOutput,
  ): Promise<CandidateRecordState> {
    const created = await this.transaction.normalizedProductCandidate.create({
      data: { rawProductRecordId, ...candidateData(candidate) },
      select: { id: true, normalizationStatus: true },
    });
    return { id: created.id, status: created.normalizationStatus };
  }

  async updateCandidate(
    id: string,
    candidate: NormalizedCandidateOutput,
  ): Promise<CandidateRecordState> {
    const updated = await this.transaction.normalizedProductCandidate.update({
      where: { id },
      data: candidateData(candidate),
      select: { id: true, normalizationStatus: true },
    });
    return { id: updated.id, status: updated.normalizationStatus };
  }
}

export class PrismaStagingStore implements StagingStore {
  readonly client: PrismaClient;

  constructor(connectionString: string) {
    this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }

  async connect(): Promise<void> {
    await this.client.$connect();
  }

  async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }

  async inspect(source: string, sourceProductId: string): Promise<ProductState> {
    const raw = await this.client.rawProductRecord.findUnique({
      where: { source_sourceProductId: { source, sourceProductId } },
      select: {
        id: true,
        normalizedCandidate: { select: { id: true, normalizationStatus: true } },
      },
    });
    return {
      raw: raw ? { id: raw.id } : null,
      candidate: raw?.normalizedCandidate
        ? {
            id: raw.normalizedCandidate.id,
            status: raw.normalizedCandidate.normalizationStatus,
          }
        : null,
    };
  }

  async transaction<T>(work: (transaction: StagingTransaction) => Promise<T>): Promise<T> {
    return this.client.$transaction((transaction) =>
      work(new PrismaStagingTransaction(transaction)),
    );
  }

  async verifySource(source: string): Promise<StagingVerification> {
    const [
      rawCount,
      candidateCount,
      statusGroups,
      importedCount,
      nonNullImportedAtCount,
      duplicateRaw,
      duplicateCandidates,
    ] = await Promise.all([
      this.client.rawProductRecord.count({ where: { source } }),
      this.client.normalizedProductCandidate.count({ where: { rawProductRecord: { source } } }),
      this.client.normalizedProductCandidate.groupBy({
        by: ['normalizationStatus'],
        where: { rawProductRecord: { source } },
        _count: { _all: true },
      }),
      this.client.normalizedProductCandidate.count({
        where: { rawProductRecord: { source }, normalizationStatus: 'IMPORTED' },
      }),
      this.client.normalizedProductCandidate.count({
        where: { rawProductRecord: { source }, importedAt: { not: null } },
      }),
      this.client.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT source, source_product_id
          FROM staging.raw_product_records
          WHERE source = ${source}
          GROUP BY source, source_product_id
          HAVING COUNT(*) > 1
        ) duplicate_raw
      `,
      this.client.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT raw_product_record_id
          FROM staging.normalized_product_candidates
          GROUP BY raw_product_record_id
          HAVING COUNT(*) > 1
        ) duplicate_candidates
      `,
    ]);
    return {
      source,
      rawCount,
      candidateCount,
      candidateStatusCounts: Object.fromEntries(
        statusGroups.map((group) => [group.normalizationStatus, group._count._all]),
      ),
      importedCount,
      nonNullImportedAtCount,
      duplicateRawIdentities: Number(duplicateRaw[0]?.count ?? 0),
      duplicateCandidateRelations: Number(duplicateCandidates[0]?.count ?? 0),
    };
  }
}
