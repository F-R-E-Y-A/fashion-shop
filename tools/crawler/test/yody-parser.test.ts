import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CollectorError } from '../src/contracts/product-source-adapter.ts';
import { createRawEnvelope, payloadChecksum } from '../src/contracts/raw-product.ts';
import { parseYodyProductHtml } from '../src/sources/yody/yody-parser.ts';

const fixture = (name: string) => readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('parses self.PDPData and preserves the full source object', async () => {
  const parsed = parseYodyProductHtml(
    await fixture('yody-product.html'),
    'https://yody.vn/product/ignored?color=1',
  );

  assert.equal(parsed.sourceProductId, '39416');
  assert.equal(parsed.sourceUrl, 'https://yody.vn/product/ao-polo-nam-sport-phoi-co');
  assert.deepEqual(parsed.product.source_unused_field, { preserve: true });
  const variants = parsed.product.variants;
  assert.ok(Array.isArray(variants));
  assert.equal(variants.length, 1);
});

test('rejects HTML without self.PDPData', async () => {
  const html = await fixture('yody-missing-pdp.html');
  assert.throws(
    () => parseYodyProductHtml(html, 'https://yody.vn/product/x'),
    (error) => error instanceof CollectorError && error.code === 'PDP_DATA_MISSING',
  );
});

test('rejects a payload without product ID', async () => {
  const html = await fixture('yody-missing-id.html');
  assert.throws(
    () => parseYodyProductHtml(html, 'https://yody.vn/product/x'),
    (error) => error instanceof CollectorError && error.code === 'PRODUCT_ID_MISSING',
  );
});

test('builds the raw envelope and a deterministic source-payload checksum', async () => {
  const parsed = parseYodyProductHtml(
    await fixture('yody-product.html'),
    'https://yody.vn/product/fixture',
  );
  const envelope = createRawEnvelope(parsed, '2026-09-25T00:00:00.000Z');

  assert.equal(envelope.source, 'YODY');
  assert.equal(envelope.extraction.locator, 'self.PDPData');
  assert.equal(envelope.product, parsed.product);
  assert.equal(payloadChecksum({ b: 2, a: 1 }), payloadChecksum({ a: 1, b: 2 }));
  assert.match(payloadChecksum(parsed.product), /^[a-f0-9]{64}$/u);
});
