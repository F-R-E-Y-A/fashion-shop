import assert from 'node:assert/strict';
import test from 'node:test';

import type { NormalizedCandidateOutput } from '../src/contracts/normalized-product.ts';
import type { RawProductEnvelope } from '../src/contracts/raw-product.ts';
import type {
  CandidateRecordState,
  ProductState,
  RawRecordState,
  StagingStore,
  StagingTransaction,
} from '../src/persistence/staging-contracts.ts';
import { parseJsonLines, validateStagingInputValues } from '../src/persistence/staging-input.ts';
import { persistStagingProducts } from '../src/persistence/staging-persistence.ts';

function raw(
  sourceProductId = '1',
  sourceUrl = 'https://yody.vn/p/1',
  source = 'YODY',
): RawProductEnvelope {
  return {
    sourceVersion: 1,
    source,
    sourceProductId,
    sourceUrl,
    collectedAt: '2026-09-25T00:00:00.000Z',
    extraction: { kind: 'embedded-json', locator: 'self.PDPData' },
    product: { id: sourceProductId, name: `Product ${sourceProductId}` },
  };
}

function candidate(
  sourceProductId = '1',
  name = `Product ${sourceProductId}`,
  source = 'YODY',
): NormalizedCandidateOutput {
  return {
    rawProductRecord: { source, sourceProductId },
    name,
    categoryName: 'Áo thun',
    price: '100',
    attributes: {
      contractVersion: 2,
      currency: 'VND',
      scope: { status: 'IN_SCOPE', reasons: [] },
      categorySlug: 'ao-thun',
      description: null,
      material: null,
      careInstructions: null,
      sourceCategory: { id: null, slug: 'ao-thun', name: 'Áo thun' },
      brand: null,
      images: [],
      variants: [],
      originalValues: { name, category: null, material: null, prices: [], sizes: [], colors: [] },
    },
    imageHash: null,
    normalizationStatus: 'APPROVED',
    validation: { issues: [], warnings: [] },
  };
}

type StoredRaw = { id: string; value: RawProductEnvelope };
type StoredCandidate = {
  id: string;
  rawId: string;
  value: NormalizedCandidateOutput;
  status: CandidateRecordState['status'];
};

class MemoryStore implements StagingStore {
  rawRecords = new Map<string, StoredRaw>();
  candidates = new Map<string, StoredCandidate>();
  mutations = 0;
  failAfterRawSourceProductId: string | null = null;

  private key(source: string, sourceProductId: string): string {
    return `${source}:${sourceProductId}`;
  }

  async inspect(source: string, sourceProductId: string): Promise<ProductState> {
    const storedRaw = this.rawRecords.get(this.key(source, sourceProductId));
    const storedCandidate = storedRaw ? this.candidates.get(storedRaw.id) : undefined;
    return {
      raw: storedRaw ? { id: storedRaw.id } : null,
      candidate: storedCandidate
        ? { id: storedCandidate.id, status: storedCandidate.status }
        : null,
    };
  }

  async transaction<T>(work: (transaction: StagingTransaction) => Promise<T>): Promise<T> {
    const rawSnapshot = new Map(this.rawRecords);
    const candidateSnapshot = new Map(this.candidates);
    const mutations = this.mutations;
    try {
      return await work(this.transactionAdapter());
    } catch (error) {
      this.rawRecords = rawSnapshot;
      this.candidates = candidateSnapshot;
      this.mutations = mutations;
      throw error;
    }
  }

  setImported(sourceProductId: string): void {
    const storedRaw = this.rawRecords.get(this.key('YODY', sourceProductId));
    if (!storedRaw) throw new Error('Raw not found');
    const storedCandidate = this.candidates.get(storedRaw.id);
    if (!storedCandidate) throw new Error('Candidate not found');
    this.candidates.set(storedRaw.id, { ...storedCandidate, status: 'IMPORTED' });
  }

  private transactionAdapter(): StagingTransaction {
    return {
      findRaw: async (source, sourceProductId) => {
        const stored = this.rawRecords.get(this.key(source, sourceProductId));
        return stored ? { id: stored.id } : null;
      },
      createRaw: async (value) => this.saveRaw(value),
      updateRaw: async (id, value) => this.saveRaw(value, id),
      findCandidate: async (rawId) => {
        if (rawId === `raw-${this.failAfterRawSourceProductId}`)
          throw new Error('Injected failure');
        const stored = this.candidates.get(rawId);
        return stored ? { id: stored.id, status: stored.status } : null;
      },
      createCandidate: async (rawId, value) => this.saveCandidate(rawId, value),
      updateCandidate: async (id, value) => {
        const stored = [...this.candidates.values()].find((entry) => entry.id === id);
        if (!stored) throw new Error('Candidate not found');
        return this.saveCandidate(stored.rawId, value, id);
      },
    };
  }

  private async saveRaw(value: RawProductEnvelope, id = `raw-${value.sourceProductId}`) {
    this.mutations += 1;
    this.rawRecords.set(this.key(value.source, value.sourceProductId), { id, value });
    return { id } satisfies RawRecordState;
  }

  private async saveCandidate(
    rawId: string,
    value: NormalizedCandidateOutput,
    id = `candidate-${rawId}`,
  ) {
    this.mutations += 1;
    this.candidates.set(rawId, { id, rawId, value, status: value.normalizationStatus });
    return { id, status: value.normalizationStatus } satisfies CandidateRecordState;
  }
}

const pair = (sourceProductId = '1', name?: string) => ({
  raw: raw(sourceProductId),
  candidate: candidate(sourceProductId, name),
});

test('creates a raw staging record', async () => {
  const store = new MemoryStore();
  const summary = await persistStagingProducts([pair()], store, false);
  assert.equal(summary.createdRaw, 1);
  assert.equal(store.rawRecords.size, 1);
});

test('updates the same raw identity', async () => {
  const store = new MemoryStore();
  await persistStagingProducts([pair()], store, false);
  const changed = pair();
  changed.raw = raw('1', 'https://yody.vn/p/changed');
  const summary = await persistStagingProducts([changed], store, false);
  assert.equal(summary.updatedRaw, 1);
  assert.equal(store.rawRecords.get('YODY:1')?.value.sourceUrl, changed.raw.sourceUrl);
});

test('creates a normalized candidate linked to its raw record', async () => {
  const store = new MemoryStore();
  const summary = await persistStagingProducts([pair()], store, false);
  assert.equal(summary.createdCandidates, 1);
  assert.equal(store.candidates.get('raw-1')?.rawId, 'raw-1');
});

test('updates an existing non-imported candidate', async () => {
  const store = new MemoryStore();
  await persistStagingProducts([pair()], store, false);
  const summary = await persistStagingProducts([pair('1', 'Updated')], store, false);
  assert.equal(summary.updatedCandidates, 1);
  assert.equal(store.candidates.get('raw-1')?.value.name, 'Updated');
});

test('keeps one candidate per raw identity', async () => {
  const store = new MemoryStore();
  await persistStagingProducts([pair()], store, false);
  await persistStagingProducts([pair()], store, false);
  assert.equal(store.rawRecords.size, 1);
  assert.equal(store.candidates.size, 1);
});

test('protects an IMPORTED candidate from overwrite', async () => {
  const store = new MemoryStore();
  await persistStagingProducts([pair()], store, false);
  store.setImported('1');
  const summary = await persistStagingProducts([pair('1', 'Must not overwrite')], store, false);
  assert.equal(summary.skippedImported, 1);
  assert.equal(store.candidates.get('raw-1')?.value.name, 'Product 1');
});

test('rejects malformed, unsupported and orphan candidate inputs', () => {
  assert.throws(() => parseJsonLines('{bad json', 'normalized-candidates.jsonl'));
  const unsupported = structuredClone(candidate());
  (unsupported.attributes as { contractVersion: number }).contractVersion = 1;
  assert.throws(() => validateStagingInputValues([raw()], [unsupported]), /contract/iu);
  assert.throws(() => validateStagingInputValues([raw()], [candidate('2')]), /Orphan/iu);
});

test('accepts a generic non-empty source and requires matching raw/candidate identity', () => {
  const routineRaw = raw('routine-1', 'https://routine.vn/product/fixture', 'ROUTINE');
  const routineCandidate = candidate('routine-1', 'Routine fixture', 'ROUTINE');
  assert.equal(validateStagingInputValues([routineRaw], [routineCandidate]).length, 1);

  const emptySourceRaw = structuredClone(routineRaw);
  emptySourceRaw.source = ' ';
  assert.throws(
    () => validateStagingInputValues([emptySourceRaw], [routineCandidate]),
    /raw product envelope/iu,
  );
  const emptySourceCandidate = structuredClone(routineCandidate);
  emptySourceCandidate.rawProductRecord.source = ' ';
  assert.throws(
    () => validateStagingInputValues([routineRaw], [emptySourceCandidate]),
    /normalized candidate contract/iu,
  );
  assert.throws(
    () => validateStagingInputValues([routineRaw], [candidate('routine-1')]),
    /Orphan/iu,
  );
});

test('rejects duplicate raw, duplicate candidate and missing candidate identities', () => {
  assert.throws(() => validateStagingInputValues([raw(), raw()], [candidate()]), /Duplicate raw/iu);
  assert.throws(
    () => validateStagingInputValues([raw()], [candidate(), candidate()]),
    /Duplicate candidate/iu,
  );
  assert.throws(() => validateStagingInputValues([raw()], []), /Missing normalized/iu);
});

test('dry-run performs zero database writes', async () => {
  const store = new MemoryStore();
  const summary = await persistStagingProducts([pair()], store, true);
  assert.equal(summary.createdRaw, 1);
  assert.equal(summary.createdCandidates, 1);
  assert.equal(store.mutations, 0);
});

test('rolls back one bad product transaction without rolling back the batch', async () => {
  const store = new MemoryStore();
  store.failAfterRawSourceProductId = '1';
  const summary = await persistStagingProducts([pair('1'), pair('2')], store, false);
  assert.equal(summary.failed, 1);
  assert.equal(store.rawRecords.has('YODY:1'), false);
  assert.equal(store.rawRecords.has('YODY:2'), true);
  assert.equal(store.candidates.has('raw-2'), true);
});

test('a second persistence run is idempotent', async () => {
  const store = new MemoryStore();
  const products = [pair('1'), pair('2')];
  await persistStagingProducts(products, store, false);
  const second = await persistStagingProducts(products, store, false);
  assert.equal(second.createdRaw, 0);
  assert.equal(second.createdCandidates, 0);
  assert.equal(second.updatedRaw, 2);
  assert.equal(second.updatedCandidates, 2);
  assert.equal(store.rawRecords.size, 2);
  assert.equal(store.candidates.size, 2);
});
