import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonObject, RawProductEnvelope } from '../src/contracts/raw-product.ts';
import {
  normalizeYodyCollection,
  summarizeNormalization,
} from '../src/normalization/normalize-collection.ts';
import { buildQualitySummary } from '../src/quality-summary.ts';

function raw(id: string, sku: string, size = 'M', category = 'quan-short-nam'): RawProductEnvelope {
  const variant: JsonObject = {
    id: Number(id),
    sku,
    original_price: 100,
    sale_price: 100,
    size: { name: size },
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
      category: { id: 124, slug: category, name: category },
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

test('reports category, source size and image quality coverage', () => {
  const candidates = normalizeYodyCollection([raw('1', 'ONE')]);
  const quality = buildQualitySummary(
    {
      runId: 'pilot',
      source: 'YODY',
      startedAt: '2026-09-25T00:00:00.000Z',
      finishedAt: '2026-09-25T00:01:00.000Z',
      discovered: 1,
      requested: 1,
      succeeded: 1,
      failed: 0,
      duplicates: 0,
      uniqueProducts: 1,
      stoppedReason: null,
    },
    candidates,
  );
  assert.equal(quality.percentages.parseSuccessRate, 100);
  assert.equal(quality.percentages.approvedRate, 100);
  assert.equal(quality.scope.inScope, 1);
  assert.equal(quality.categoryCoverage['quan-short'], 1);
  assert.equal(quality.observedSourceSizes.M, 1);
  assert.equal(quality.imageCoverage.withValidImage, 0);
  assert.equal(quality.priceCoverage.validPriceRate, 100);
});

test('reports business scope separately from technical normalization issues', () => {
  const candidates = normalizeYodyCollection([raw('1', 'ONE', '3XL'), raw('2', 'TWO', 'M', 'nam')]);
  const quality = buildQualitySummary(
    {
      runId: 'scope',
      source: 'YODY',
      startedAt: '2026-09-25T00:00:00.000Z',
      finishedAt: '2026-09-25T00:01:00.000Z',
      discovered: 2,
      requested: 2,
      succeeded: 2,
      failed: 0,
      duplicates: 0,
      uniqueProducts: 2,
      stoppedReason: null,
    },
    candidates,
  );
  assert.deepEqual(quality.normalization.issueCounts, {});
  assert.equal(quality.scope.outOfScope, 1);
  assert.equal(quality.scope.reviewRequired, 1);
  assert.deepEqual(quality.scope.reasonCounts, {
    OUT_OF_SCOPE_SIZE: 1,
    UNKNOWN_CATEGORY: 1,
  });
});

test('counts the Issue #5 minimum dataset fields separately from Catalog approval', () => {
  const candidates = normalizeYodyCollection([
    raw('1', 'VALID', '3XL'),
    raw('2', 'NO-NAME'),
    raw('3', 'NO-CATEGORY'),
    raw('4', 'NO-PRICE'),
  ]);
  const noName = candidates[1];
  const noCategory = candidates[2];
  const noPrice = candidates[3];
  assert.ok(noName && noCategory && noPrice);
  noName.name = '';
  noName.attributes.originalValues.name = null;
  noCategory.attributes.sourceCategory = { id: null, slug: null, name: null };
  noPrice.price = null;

  const quality = buildQualitySummary(
    {
      runId: 'acceptance',
      source: 'YODY',
      startedAt: '2026-09-25T00:00:00.000Z',
      finishedAt: '2026-09-25T00:01:00.000Z',
      discovered: 4,
      requested: 4,
      succeeded: 4,
      failed: 0,
      duplicates: 0,
      uniqueProducts: 4,
      stoppedReason: null,
    },
    candidates,
  );

  assert.deepEqual(quality.acceptance, {
    minimumValidProduct: 1,
    missingName: 1,
    missingSourceCategory: 1,
    missingValidPrice: 1,
    acceptancePercentage: 25,
  });
  assert.equal(candidates[0]?.normalizationStatus, 'PENDING_REVIEW');
});
