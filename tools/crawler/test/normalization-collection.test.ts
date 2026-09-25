import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonObject, RawProductEnvelope } from '../src/contracts/raw-product.ts';
import {
  normalizeYodyCollection,
  summarizeNormalization,
} from '../src/normalization/normalize-collection.ts';

function raw(id: string, sku: string): RawProductEnvelope {
  const variant: JsonObject = {
    id: Number(id),
    sku,
    original_price: 100,
    sale_price: 100,
    size: { name: 'M' },
    color: { code: `C${id}`, name: `Color ${id}`, hex: null },
    images: [],
  };
  return {
    sourceVersion: 1,
    source: 'YODY',
    sourceProductId: id,
    sourceUrl: `https://yody.vn/product/${id}`,
    collectedAt: '2026-09-25T00:00:00.000Z',
    extraction: { kind: 'embedded-json', locator: 'self.PDPData' },
    product: {
      id: Number(id),
      name: `Product ${id}`,
      category: { id: 124, slug: 'quan-short-nam', name: 'Quần short nam' },
      variants: [variant],
    },
  };
}

test('detects global SKU collisions across products', () => {
  const candidates = normalizeYodyCollection([raw('1', 'SAME'), raw('2', 'SAME')]);
  assert.equal(candidates.length, 2);
  assert.equal(
    candidates.every((candidate) => candidate.normalizationStatus === 'PENDING_REVIEW'),
    true,
  );
  assert.equal(
    candidates.every((candidate) =>
      candidate.validation.issues.some((entry) => entry.code === 'DUPLICATE_SKU'),
    ),
    true,
  );
});

test('dedupes equivalent product identities and records a warning', () => {
  const product = raw('1', 'ONE');
  const candidates = normalizeYodyCollection([product, structuredClone(product)]);
  assert.equal(candidates.length, 1);
  assert.equal(
    candidates[0]?.validation.warnings.some((entry) => entry.code === 'DUPLICATE_PRODUCT_DEDUPED'),
    true,
  );
});

test('summarizes actual candidate statuses and issue counts', () => {
  const candidates = normalizeYodyCollection([raw('1', 'ONE')]);
  assert.deepEqual(summarizeNormalization(candidates), {
    source: 'YODY',
    total: 1,
    approved: 1,
    pendingReview: 0,
    duplicate: 0,
    rejected: 0,
    issueCounts: {},
    warningCounts: { NO_VALID_IMAGE: 1 },
  });
});
