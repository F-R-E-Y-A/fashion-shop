import type {
  PersistenceSummary,
  ProductState,
  StagingProductPair,
  StagingStore,
  StagingTransaction,
} from './staging-contracts.ts';

interface ProductWriteResult {
  raw: 'created' | 'updated';
  candidate: 'created' | 'updated' | 'skipped-imported';
}

function increment(summary: PersistenceSummary, result: ProductWriteResult): void {
  if (result.raw === 'created') summary.createdRaw += 1;
  else summary.updatedRaw += 1;

  if (result.candidate === 'created') summary.createdCandidates += 1;
  else if (result.candidate === 'updated') summary.updatedCandidates += 1;
  else summary.skippedImported += 1;
}

function plannedResult(state: ProductState): ProductWriteResult {
  return {
    raw: state.raw ? 'updated' : 'created',
    candidate:
      state.candidate?.status === 'IMPORTED'
        ? 'skipped-imported'
        : state.candidate
          ? 'updated'
          : 'created',
  };
}

async function persistProduct(
  transaction: StagingTransaction,
  pair: StagingProductPair,
): Promise<ProductWriteResult> {
  const existingRaw = await transaction.findRaw(pair.raw.source, pair.raw.sourceProductId);
  const raw = existingRaw
    ? await transaction.updateRaw(existingRaw.id, pair.raw)
    : await transaction.createRaw(pair.raw);
  const existingCandidate = await transaction.findCandidate(raw.id);
  if (existingCandidate?.status === 'IMPORTED') {
    return { raw: existingRaw ? 'updated' : 'created', candidate: 'skipped-imported' };
  }
  if (existingCandidate) {
    await transaction.updateCandidate(existingCandidate.id, pair.candidate);
    return { raw: existingRaw ? 'updated' : 'created', candidate: 'updated' };
  }
  await transaction.createCandidate(raw.id, pair.candidate);
  return { raw: existingRaw ? 'updated' : 'created', candidate: 'created' };
}

export async function persistStagingProducts(
  pairs: StagingProductPair[],
  store: StagingStore,
  dryRun: boolean,
): Promise<PersistenceSummary> {
  const summary: PersistenceSummary = {
    mode: dryRun ? 'dry-run' : 'write',
    total: pairs.length,
    createdRaw: 0,
    updatedRaw: 0,
    createdCandidates: 0,
    updatedCandidates: 0,
    skippedImported: 0,
    failed: 0,
    failures: [],
  };

  for (const pair of pairs) {
    try {
      const result = dryRun
        ? plannedResult(await store.inspect(pair.raw.source, pair.raw.sourceProductId))
        : await store.transaction((transaction) => persistProduct(transaction, pair));
      increment(summary, result);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        source: pair.raw.source,
        sourceProductId: pair.raw.sourceProductId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
