import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CollectorError } from './contracts/product-source-adapter.ts';
import { createRawEnvelope, payloadChecksum } from './contracts/raw-product.ts';
import {
  appendFailure,
  appendManifest,
  buildRunSummary,
  ensureJsonLineFile,
  latestManifestByUrl,
  loadManifest,
  type RunSummary,
  writeRunSummary,
} from './persistence/manifest.ts';
import { loadRawProducts, upsertRawProduct } from './persistence/raw-export.ts';
import { randomProductDelay, sleep } from './sources/yody/yody-fetch.ts';
import { YodySourceAdapter } from './sources/yody/yody-source-adapter.ts';

interface CliOptions {
  source: 'yody';
  limit: number;
  output?: string;
  resume: boolean;
  force: boolean;
}

const defaultOutputRoot = fileURLToPath(new URL('../output/ht-03/', import.meta.url));

function optionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = { source: 'yody', limit: 10, resume: false, force: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--source') {
      const source = optionValue(args, index, '--source').toLowerCase();
      if (source !== 'yody') throw new Error(`Unsupported source: ${source}`);
      options.source = source;
      index += 1;
    } else if (argument === '--limit') {
      const limit = Number(optionValue(args, index, '--limit'));
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new Error('--limit must be a positive integer');
      }
      options.limit = limit;
      index += 1;
    } else if (argument === '--output') {
      options.output = optionValue(args, index, '--output');
      index += 1;
    } else if (argument === '--resume') {
      options.resume = true;
    } else if (argument === '--force') {
      options.force = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.resume && !options.output) throw new Error('--resume requires --output');
  return options;
}

function newRunId(now = new Date()): string {
  return now.toISOString().replaceAll(/[-:.]/gu, '');
}

async function readPreviousSummary(filePath: string): Promise<RunSummary | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as RunSummary;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function collectorError(error: unknown): CollectorError {
  if (error instanceof CollectorError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new CollectorError('UNEXPECTED_ERROR', message, { cause: error });
}

async function run(options: CliOptions): Promise<RunSummary> {
  const runId = options.output ? basename(resolve(options.output)) : newRunId();
  const outputDirectory = resolve(options.output ?? resolve(defaultOutputRoot, runId));
  const paths = {
    raw: resolve(outputDirectory, 'raw-products.jsonl'),
    manifest: resolve(outputDirectory, 'manifest.jsonl'),
    failures: resolve(outputDirectory, 'failures.jsonl'),
    summary: resolve(outputDirectory, 'run-summary.json'),
  };
  const previousSummary = await readPreviousSummary(paths.summary);
  if (previousSummary && !options.resume) {
    throw new Error(`Output already contains a run; pass --resume: ${outputDirectory}`);
  }

  await Promise.all([
    ensureJsonLineFile(paths.raw),
    ensureJsonLineFile(paths.manifest),
    ensureJsonLineFile(paths.failures),
  ]);

  const startedAt = previousSummary?.startedAt ?? new Date().toISOString();
  const adapter = new YodySourceAdapter();
  const rawProducts = await loadRawProducts(paths.raw);
  let manifest = await loadManifest(paths.manifest);
  if (!options.resume && (rawProducts.size > 0 || manifest.length > 0)) {
    throw new Error(`Output already contains checkpoint data; pass --resume: ${outputDirectory}`);
  }
  let discoveredCount = previousSummary?.discovered ?? 0;
  let stoppedReason: string | null = null;
  let interrupted = false;
  process.once('SIGINT', () => {
    interrupted = true;
    console.warn('Interrupt requested; stopping after the current item.');
  });

  try {
    const discovered = await adapter.discover({ limit: options.limit });
    discoveredCount = Math.max(discoveredCount, discovered.length);
    const latest = latestManifestByUrl(manifest);
    for (const item of discovered) {
      if (latest.has(item.url)) continue;
      const pending = {
        recordedAt: new Date().toISOString(),
        url: item.url,
        status: 'pending' as const,
        attempts: 0,
      };
      await appendManifest(paths.manifest, pending);
      latest.set(item.url, pending);
    }
    let madeProductRequest = false;

    for (const [index, item] of discovered.entries()) {
      if (interrupted) {
        stoppedReason = 'INTERRUPTED';
        break;
      }
      const checkpoint = latest.get(item.url);
      if (
        !options.force &&
        (checkpoint?.status === 'succeeded' || checkpoint?.status === 'skipped_duplicate')
      ) {
        console.log(`[${index + 1}/${discovered.length}] resume skip ${item.url}`);
        continue;
      }
      if (madeProductRequest) await sleep(randomProductDelay());
      madeProductRequest = true;

      if (checkpoint?.status !== 'pending') {
        const pending = {
          recordedAt: new Date().toISOString(),
          url: item.url,
          status: 'pending' as const,
          attempts: 0,
        };
        await appendManifest(paths.manifest, pending);
        latest.set(item.url, pending);
      }

      let httpStatus: number | undefined;
      let attempts = 0;
      let latencyMs: number | undefined;
      let sourceProductId: string | undefined;
      try {
        const fetched = await adapter.fetch(item.url);
        httpStatus = fetched.status;
        attempts = fetched.attempts;
        latencyMs = fetched.latencyMs;
        const parsed = adapter.parse(fetched.body, item.url);
        sourceProductId = parsed.sourceProductId;
        const envelope = createRawEnvelope(parsed);
        const checksum = payloadChecksum(parsed.product);
        const result = await upsertRawProduct(paths.raw, rawProducts, envelope, options.force);
        const status = result === 'duplicate' ? 'skipped_duplicate' : 'succeeded';
        const entry = {
          recordedAt: new Date().toISOString(),
          url: item.url,
          sourceProductId,
          status,
          attempts,
          httpStatus,
          latencyMs,
          payloadChecksum: checksum,
        } as const;
        await appendManifest(paths.manifest, entry);
        latest.set(item.url, entry);
        console.log(`[${index + 1}/${discovered.length}] ${status} ${sourceProductId}`);
      } catch (error) {
        const failure = collectorError(error);
        attempts = failure.attempts ?? attempts;
        httpStatus = failure.httpStatus ?? httpStatus;
        latencyMs = failure.latencyMs ?? latencyMs;
        const entry = {
          recordedAt: new Date().toISOString(),
          url: item.url,
          sourceProductId,
          status: 'failed' as const,
          attempts,
          httpStatus,
          latencyMs,
          errorCode: failure.code,
        };
        await appendManifest(paths.manifest, entry);
        await appendFailure(paths.failures, {
          recordedAt: entry.recordedAt,
          url: item.url,
          sourceProductId,
          attempts,
          httpStatus,
          errorCode: failure.code,
          message: failure.message,
          stopRun: failure.stopRun,
        });
        latest.set(item.url, entry);
        console.error(`[${index + 1}/${discovered.length}] failed ${failure.code}`);
        if (failure.stopRun) {
          stoppedReason = failure.code;
          break;
        }
      }
    }
  } catch (error) {
    const failure = collectorError(error);
    stoppedReason = failure.code;
    await appendFailure(paths.failures, {
      recordedAt: new Date().toISOString(),
      url: 'https://yody.vn/sitemap_products_1.xml',
      attempts: failure.attempts ?? 0,
      httpStatus: failure.httpStatus,
      errorCode: failure.code,
      message: failure.message,
      stopRun: failure.stopRun,
    });
  }

  manifest = await loadManifest(paths.manifest);
  const summary = buildRunSummary({
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    discovered: discoveredCount,
    manifest,
    uniqueProducts: rawProducts.size,
    stoppedReason,
  });
  await writeRunSummary(paths.summary, summary);
  console.log(`Output: ${outputDirectory}`);
  console.log(JSON.stringify(summary));
  return summary;
}

try {
  const summary = await run(parseCliOptions(process.argv.slice(2)));
  if (summary.stoppedReason) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
