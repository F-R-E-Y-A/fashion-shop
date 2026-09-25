import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonObject } from '../src/contracts/raw-product.ts';
import { normalizeCategory } from '../src/normalization/category.ts';
import { normalizeYodyColor } from '../src/normalization/color.ts';
import { normalizePrice } from '../src/normalization/price.ts';
import { normalizeSize } from '../src/normalization/size.ts';
import { normalizeSku } from '../src/normalization/sku.ts';

const category = (slug: string, name: string): JsonObject => ({ slug, name });

test('maps source categories only to deterministic M2 leaves', () => {
  assert.equal(normalizeCategory(category('ao-polo-nam', 'Áo polo nam'))?.slug, 'ao-thun');
  assert.equal(normalizeCategory(category('quan-short-nam', 'Quần short nam'))?.slug, 'quan-short');
  assert.equal(normalizeCategory(category('ao-so-mi-nu', 'Áo sơ mi nữ'))?.slug, 'ao-so-mi');
  assert.equal(normalizeCategory(category('quan-jeans-nu', 'Quần jeans nữ'))?.slug, 'quan-dai');
  assert.equal(normalizeCategory(category('tat-nam', 'Tất nam')), null);
});

test('normalizes allowed sizes and FREE aliases without coercing unknown sizes', () => {
  assert.deepEqual(normalizeSize({ name: 'M' }), { code: 'M', state: 'valid' });
  assert.deepEqual(normalizeSize({ name: 'F' }), { code: 'FREE', state: 'valid' });
  assert.deepEqual(normalizeSize('one size'), { code: 'FREE', state: 'valid' });
  assert.deepEqual(normalizeSize('2XL'), { code: '2XL', state: 'unknown' });
  assert.deepEqual(normalizeSize('3XL'), { code: '3XL', state: 'unknown' });
  assert.deepEqual(normalizeSize(null), { code: null, state: 'missing' });
});

test('normalizes source-prefixed color and accepts only valid source hex', () => {
  const valid = normalizeYodyColor({ code: 'SI041', name: 'Rêu-SI041', hex: '#334713' }, 'color');
  assert.deepEqual(valid.color, { code: 'yody-si041', name: 'Rêu', hex: '#334713' });
  assert.equal(valid.warning, undefined);

  const invalid = normalizeYodyColor({ code: 'VAG', name: 'Vàng', hex: 'yellow' }, 'color');
  assert.equal(invalid.color?.hex, null);
  assert.equal(invalid.warning?.code, 'INVALID_HEX');
});

test('normalizes list/sale prices with M2 semantics', () => {
  assert.deepEqual(normalizePrice(49000, 49000), {
    listPrice: '49000',
    salePrice: null,
    effectivePrice: '49000',
    valid: true,
  });
  assert.deepEqual(normalizePrice('399000', '299000'), {
    listPrice: '399000',
    salePrice: '299000',
    effectivePrice: '299000',
    valid: true,
  });
  assert.equal(normalizePrice(0, null).valid, false);
  assert.equal(normalizePrice(100, 101).valid, false);
  assert.equal(normalizePrice('not-a-price', null).valid, false);
  assert.deepEqual(normalizePrice(100.5, 99.25), {
    listPrice: '100.5',
    salePrice: '99.25',
    effectivePrice: '99.25',
    valid: true,
  });
});

test('generates deterministic primary and fallback SKUs', () => {
  assert.deepEqual(
    normalizeSku({
      sourceSku: 'QSM4888-VAG-M',
      sourceProductId: '4737',
      colorCode: 'yody-vag',
      sizeCode: 'M',
    }),
    { sourceSku: 'QSM4888-VAG-M', sku: 'YODY-QSM4888-VAG-M', usedFallback: false },
  );
  assert.equal(
    normalizeSku({
      sourceSku: null,
      sourceProductId: '4737',
      colorCode: 'yody-vag',
      sizeCode: 'M',
    }).sku,
    'YODY-4737-YODY-VAG-M',
  );
  assert.equal(
    normalizeSku({
      sourceSku: null,
      sourceProductId: '4737',
      colorCode: null,
      sizeCode: 'M',
    }).sku,
    null,
  );
});
