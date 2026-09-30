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

function envelope(variants: JsonObject[], productOverrides: JsonObject = {}): RawProductEnvelope {
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
      ...productOverrides,
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

test('keeps a shared image associated with each color instead of assigning it to only one', () => {
  const result = normalizeYodyEnvelope(
    envelope([
      sourceVariant({ images: [{ image_url: 'https://cdn.example/shared.webp' }] }),
      sourceVariant({
        id: 2,
        sku: 'SKU-DEN-M',
        color: { id: 2, code: 'DEN', name: 'Đen', hex: '#000' },
        images: [{ image_url: 'https://cdn.example/shared.webp' }],
      }),
    ]),
  );

  assert.deepEqual(
    result.attributes.images.map((image) => image.colorCode),
    ['yody-vag', 'yody-den'],
  );
  assert.equal(result.attributes.images[0]?.url, result.attributes.images[1]?.url);
});

test('uses detailed unicorn description when the primary description is only a title and strips markup', () => {
  const result = normalizeYodyEnvelope(
    envelope([sourceVariant()], {
      description: 'Sơ mi knit nhật cộc tay',
      unicorn_description:
        '<h2>Thông tin</h2><p>Áo được may từ chất liệu tự nhiên&nbsp;và tạo cảm giác thoải mái khi mặc. &#272;&#7865;p &amp; bền.</p><script>alert(1)</script><style>.hidden{display:none}</style><img src="https://cdn.example/ignored.jpg" /><p><a href="https://example.test">Xem thêm</a></p>',
    }),
  );

  assert.equal(
    result.attributes.description,
    'Thông tin\n\nÁo được may từ chất liệu tự nhiên và tạo cảm giác thoải mái khi mặc. Đẹp & bền.\n\nXem thêm',
  );
  assert.equal(result.attributes.description?.includes('<'), false);
  assert.equal(result.attributes.description?.includes('alert'), false);
});

test('recovers embedded gallery images only when the filename identifies the source color', () => {
  const result = normalizeYodyEnvelope(
    envelope([sourceVariant()], {
      description:
        '<p><img src="https://cdn.example/shirt-vag-01.jpg"><img src="https://cdn.example/shirt-den-01.jpg"></p>',
    }),
  );

  assert.deepEqual(result.attributes.images, [
    {
      url: 'https://cdn.example/shirt-vag-01.jpg',
      alt: 'Quần Short Fixture - Vàng',
      colorCode: 'yody-vag',
    },
  ]);
  assert.equal(
    result.validation.warnings.some((warning) => warning.code === 'NO_VALID_IMAGE'),
    false,
  );
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
