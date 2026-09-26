import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import type { RawProductEnvelope } from '../src/contracts/raw-product.ts';
import { appendManifest, buildRunSummary, loadManifest } from '../src/persistence/manifest.ts';
import { loadRawProducts, upsertRawProduct } from '../src/persistence/raw-export.ts';

function envelope(sourceUrl: string): RawProductEnvelope {
  return {
    sourceVersion: 1,
    source: 'YODY',
    sourceProductId: '39416',
    sourceUrl,
    collectedAt: '2026-09-25T00:00:00.000Z',
    extraction: { kind: 'embedded-json', locator: 'self.PDPData' },
    product: { id: 39416, name: 'Fixture' },
  };
}

test('keeps one raw record for duplicate source identity', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'ht03-raw-'));
  try {
    const filePath = resolve(directory, 'raw-products.jsonl');
    const products = await loadRawProducts(filePath);
    assert.equal(
      await upsertRawProduct(filePath, products, envelope('https://yody.vn/product/a'), false),
      'inserted',
    );
    assert.equal(
      await upsertRawProduct(filePath, products, envelope('https://yody.vn/product/b'), false),
      'duplicate',
    );
    assert.equal(products.size, 1);
    assert.equal((await readFile(filePath, 'utf8')).trim().split('\n').length, 1);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('builds summary from the latest manifest state', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'ht03-manifest-'));
  try {
    const filePath = resolve(directory, 'manifest.jsonl');
    const common = { recordedAt: '2026-09-25T00:00:00.000Z', attempts: 1 };
    await appendManifest(filePath, {
      ...common,
      url: 'https://yody.vn/product/a',
      status: 'pending',
    });
    await appendManifest(filePath, {
      ...common,
      url: 'https://yody.vn/product/a',
      status: 'succeeded',
      sourceProductId: '1',
    });
    await appendManifest(filePath, {
      ...common,
      url: 'https://yody.vn/product/b',
      status: 'failed',
      errorCode: 'HTTP_ERROR',
    });
    await appendManifest(filePath, {
      ...common,
      url: 'https://yody.vn/product/c',
      status: 'skipped_duplicate',
      sourceProductId: '1',
    });

    const manifest = await loadManifest(filePath);
    assert.deepEqual(
      buildRunSummary({
        runId: 'fixture-run',
        source: 'YODY',
        startedAt: '2026-09-25T00:00:00.000Z',
        finishedAt: '2026-09-25T00:01:00.000Z',
        discovered: 3,
        manifest,
        uniqueProducts: 1,
        stoppedReason: null,
      }),
      {
        runId: 'fixture-run',
        source: 'YODY',
        startedAt: '2026-09-25T00:00:00.000Z',
        finishedAt: '2026-09-25T00:01:00.000Z',
        discovered: 3,
        requested: 3,
        succeeded: 1,
        failed: 1,
        duplicates: 1,
        uniqueProducts: 1,
        stoppedReason: null,
      },
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
