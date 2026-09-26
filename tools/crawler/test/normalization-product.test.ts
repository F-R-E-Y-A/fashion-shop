import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonObject, RawProductEnvelope } from '../src/contracts/raw-product.ts';
import { normalizeYodyEnvelope } from '../src/normalization/normalize-product.ts';
import { isCanonicalSizeCode } from '../src/normalization/size-taxonomy.ts';

const plannedSizeExpansion = ['2XL', '3XL', '4XL'] as const;
const catalogSizeExpansionActive = plannedSizeExpansion.every(isCanonicalSizeCode);

function sourceVariant(overrides: JsonObject = {}): JsonObject {
  return {
    id: 1,
    sku: 'SKU-VAG-M',
    original_price: 100,
    sale_price: 90,
    size: { id: 4, name: 'M' },
    color: { id: 1, code: 'VAG', name: 'Vàng', hex: '#FED533' },
    images: [],
    ...overrides,
  };
}

function envelope(variants: JsonObject[]): RawProductEnvelope {
  return {
    sourceVersion: 1,
    source: 'YODY',
    sourceProductId: '4737',
    sourceUrl: 'https://yody.vn/product/fixture',
    collectedAt: '2026-09-25T00:00:00.000Z',
    extraction: { kind: 'embedded-json', locator: 'self.PDPData' },
    product: {
      id: 4737,
      name: 'Quần Short Fixture',
      description: 'Mô tả fixture',
      material: { component: 'Cotton', preserve: 'Giặt nhẹ' },
      category: { id: 124, slug: 'quan-short-nam', name: 'Quần short nam' },
      variants,
    },
  };
}

test('marks a source product without variants PENDING_REVIEW with NO_VARIANT', () => {
  const result = normalizeYodyEnvelope(envelope([]));
  assert.equal(result.normalizationStatus, 'PENDING_REVIEW');
  assert.equal(
    result.validation.issues.some((entry) => entry.code === 'NO_VARIANT'),
    true,
  );
  assert.equal(result.attributes.variants.length, 0);
  assert.equal(result.price, null);
  assert.equal(result.attributes.brand, null);
});

test(
  'classifies planned 2XL, 3XL and 4XL variants out of scope and pending review',
  { skip: catalogSizeExpansionActive && 'Catalog size expansion is active' },
  () => {
    for (const code of plannedSizeExpansion) {
      const result = normalizeYodyEnvelope(
        envelope([sourceVariant({ sku: `SKU-VAG-${code}`, size: { name: code } })]),
      );

      assert.equal(result.normalizationStatus, 'PENDING_REVIEW');
      assert.deepEqual(result.attributes.variants[0]?.sizeCode, code);
      assert.equal(result.attributes.scope.status, 'OUT_OF_SCOPE');
      assert.equal(
        result.attributes.scope.reasons.some(
          (entry) => entry.code === 'OUT_OF_SCOPE_SIZE' && entry.value === code,
        ),
        true,
      );
    }
  },
);

test('detects conflicting duplicate color/size and duplicate SKU', () => {
  const duplicateCombination = normalizeYodyEnvelope(
    envelope([sourceVariant(), sourceVariant({ id: 2, sku: 'OTHER-SKU' })]),
  );
  assert.equal(
    duplicateCombination.validation.issues.some((entry) => entry.code === 'DUPLICATE_VARIANT'),
    true,
  );

  const duplicateSku = normalizeYodyEnvelope(
    envelope([
      sourceVariant(),
      sourceVariant({
        id: 2,
        size: { id: 6, name: 'L' },
        color: { id: 2, code: 'DEN', name: 'Đen', hex: '#111111' },
      }),
    ]),
  );
  assert.equal(
    duplicateSku.validation.issues.some((entry) => entry.code === 'DUPLICATE_SKU'),
    true,
  );
  assert.equal(duplicateSku.normalizationStatus, 'PENDING_REVIEW');
});

test('dedupes equivalent variants and images in deterministic source order', () => {
  const first = sourceVariant({
    images: [
      { image_url: 'https://cdn.example/two.webp?width=200', position: 2 },
      { image_url: 'https://cdn.example/one.webp', position: 1 },
    ],
  });
  const result = normalizeYodyEnvelope(envelope([first, { ...first, id: 2 }]));

  assert.equal(result.attributes.variants.length, 1);
  assert.equal(
    result.validation.warnings.some((entry) => entry.code === 'DUPLICATE_VARIANT_DEDUPED'),
    true,
  );
  assert.deepEqual(
    result.attributes.images.map((image) => image.url),
    ['https://cdn.example/one.webp', 'https://cdn.example/two.webp'],
  );
  assert.equal(result.attributes.images[0]?.colorCode, 'yody-vag');
});

test('normalization is deterministic and preserves only relevant original values', () => {
  const raw = envelope([sourceVariant()]);
  const first = normalizeYodyEnvelope(raw);
  const second = normalizeYodyEnvelope(raw);
  assert.deepEqual(first, second);
  assert.equal(first.normalizationStatus, 'APPROVED');
  assert.deepEqual(first.attributes.scope, { status: 'IN_SCOPE', reasons: [] });
  assert.equal(first.attributes.material, 'Cotton');
  assert.equal(first.attributes.careInstructions, 'Giặt nhẹ');
  assert.equal('description' in first.attributes.originalValues, false);
});
