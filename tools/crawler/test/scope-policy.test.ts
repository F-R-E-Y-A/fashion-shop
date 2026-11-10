import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonObject, RawProductEnvelope } from '../src/contracts/raw-product.ts';
import { normalizeYodyEnvelope } from '../src/normalization/normalize-product.ts';

function envelope(categorySlug: string, sizes: string[]): RawProductEnvelope {
  const variants: JsonObject[] = sizes.map((size, index) => ({
    id: index + 1,
    sku: `SKU-${size}-${index}`,
    original_price: 100,
    sale_price: 90,
    size: { name: size },
    color: { code: `C${index}`, name: `Color ${index}`, hex: '#112233' },
    images: [{ image_url: `https://cdn.example/${index}.webp`, position: index }],
  }));
  return {
    sourceVersion: 1,
    source: 'YODY',
    sourceProductId: 'scope-fixture',
    sourceUrl: 'https://yody.vn/product/scope-fixture',
    collectedAt: '2026-09-25T00:00:00.000Z',
    extraction: { kind: 'embedded-json', locator: 'self.PDPData' },
    product: {
      id: 'scope-fixture',
      name: 'Scope fixture',
      category: { slug: categorySlug, name: categorySlug },
      variants,
    },
  };
}

function reasonValues(raw: RawProductEnvelope, code: string): string[] {
  return normalizeYodyEnvelope(raw)
    .attributes.scope.reasons.filter((reason) => reason.code === code)
    .map((reason) => reason.value);
}

test('classifies known unsupported alpha sizes as OUT_OF_SCOPE_SIZE', () => {
  const raw = envelope('ao-thun-nam', ['2XL', '3XL', '4XL', '5XL']);
  const result = normalizeYodyEnvelope(raw);
  assert.equal(result.attributes.scope.status, 'OUT_OF_SCOPE');
  assert.deepEqual(reasonValues(raw, 'OUT_OF_SCOPE_SIZE'), ['2XL', '3XL', '4XL', '5XL']);
  assert.equal(result.normalizationStatus, 'PENDING_REVIEW');
});

test('classifies known unsupported numeric sizes as OUT_OF_SCOPE_SIZE', () => {
  const raw = envelope('quan-jeans-nam', ['25', '28', '33', '34']);
  assert.deepEqual(reasonValues(raw, 'OUT_OF_SCOPE_SIZE'), ['25', '28', '33', '34']);
});

test('classifies child sizes only when source context identifies children data', () => {
  const child = envelope('ao-phao-tre-em', ['4', '6', '8', '10']);
  assert.deepEqual(reasonValues(child, 'OUT_OF_SCOPE_SIZE'), ['4', '6', '8', '10']);

  const girl = envelope('dam-va-chan-vay-be-gai', ['4', '6', '8', '10']);
  assert.deepEqual(reasonValues(girl, 'OUT_OF_SCOPE_SIZE'), ['4', '6', '8', '10']);

  const ambiguous = envelope('nam', ['4']);
  assert.deepEqual(reasonValues(ambiguous, 'OUT_OF_SCOPE_SIZE'), []);
  assert.deepEqual(reasonValues(ambiguous, 'UNKNOWN_SIZE'), ['4']);
});

test('distinguishes known unsupported and unknown source categories', () => {
  for (const slug of ['dam-va-chan-vay-nu', 'ao-phao-tre-em']) {
    const result = normalizeYodyEnvelope(envelope(slug, ['M']));
    assert.equal(result.attributes.scope.status, 'OUT_OF_SCOPE');
    assert.equal(result.attributes.scope.reasons[0]?.code, 'OUT_OF_SCOPE_CATEGORY');
  }

  const unknown = normalizeYodyEnvelope(envelope('nam', ['M']));
  assert.equal(unknown.attributes.scope.status, 'REVIEW_REQUIRED');
  assert.equal(unknown.attributes.scope.reasons[0]?.code, 'UNKNOWN_CATEGORY');
  assert.equal(unknown.normalizationStatus, 'PENDING_REVIEW');
});

test('approves a technically valid product inside the baseline scope', () => {
  const result = normalizeYodyEnvelope(envelope('ao-thun-nam', ['M']));
  assert.deepEqual(result.attributes.scope, { status: 'IN_SCOPE', reasons: [] });
  assert.equal(result.normalizationStatus, 'APPROVED');
});

test('normalization does not mutate the raw source payload', () => {
  const raw = envelope('ao-thun-nam', ['3XL']);
  const before = structuredClone(raw);
  normalizeYodyEnvelope(raw);
  assert.deepEqual(raw, before);
});
