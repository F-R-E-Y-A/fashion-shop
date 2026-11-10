import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CollectorError } from '../src/contracts/product-source-adapter.ts';
import {
  canonicalizeYodyProductUrl,
  parseYodyProductSitemap,
} from '../src/sources/yody/yody-discovery.ts';

test('canonicalizes a YODY product URL', () => {
  assert.equal(
    canonicalizeYodyProductUrl(
      'https://www.yody.vn/product/ao-polo/?utm_source=x&color=1#description',
    ),
    'https://yody.vn/product/ao-polo',
  );
});

test('rejects non-product and non-YODY URLs', () => {
  assert.throws(
    () => canonicalizeYodyProductUrl('https://example.com/product/x'),
    (error) => error instanceof CollectorError && error.code === 'INVALID_PRODUCT_URL',
  );
  assert.throws(() => canonicalizeYodyProductUrl('https://yody.vn/category/nam'));
});

test('parses sitemap URLs in deterministic order, canonicalizes, dedupes and limits', async () => {
  const xml = await readFile(new URL('../fixtures/yody-sitemap.xml', import.meta.url), 'utf8');
  assert.deepEqual(parseYodyProductSitemap(xml), [
    { url: 'https://yody.vn/product/first-product' },
    { url: 'https://yody.vn/product/second-product' },
  ]);
  assert.deepEqual(parseYodyProductSitemap(xml, 1), [
    { url: 'https://yody.vn/product/first-product' },
  ]);
});

test('fails clearly when the sitemap format no longer contains product URLs', () => {
  assert.throws(
    () => parseYodyProductSitemap('<urlset />'),
    (error) => error instanceof CollectorError && error.code === 'SITEMAP_FORMAT_CHANGED',
  );
});
