import assert from 'node:assert/strict';
import test from 'node:test';

import { CollectorError } from '../src/contracts/product-source-adapter.ts';
import { fetchTextWithPolicy } from '../src/sources/yody/yody-fetch.ts';

const testPolicy = {
  timeoutMs: 100,
  maxRetries: 2,
  backoffMs: [5, 15],
  jitterMs: 0,
} as const;

test('retries a transient response and reports attempts without real waiting', async () => {
  const responses = [new Response('retry', { status: 500 }), new Response('ok', { status: 200 })];
  const waits: number[] = [];
  const result = await fetchTextWithPolicy('https://yody.vn/product/fixture', {
    policy: testPolicy,
    fetchImpl: async () => responses.shift() ?? new Response('unexpected', { status: 500 }),
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
    random: () => 0,
  });

  assert.equal(result.body, 'ok');
  assert.equal(result.attempts, 2);
  assert.deepEqual(waits, [5]);
});

test('stops immediately on HTTP 403', async () => {
  await assert.rejects(
    fetchTextWithPolicy('https://yody.vn/product/fixture', {
      policy: testPolicy,
      fetchImpl: async () => new Response('Forbidden', { status: 403 }),
      wait: async () => undefined,
    }),
    (error) => error instanceof CollectorError && error.code === 'ACCESS_BLOCKED' && error.stopRun,
  );
});
