import { writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { PrismaStagingStore } from './persistence/prisma-staging-store.ts';
import { readStagingInput } from './persistence/staging-input.ts';
import { persistStagingProducts } from './persistence/staging-persistence.ts';

interface PersistCliOptions {
  input: string;
  dryRun: boolean;
}

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

function optionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

export function parsePersistCliOptions(args: string[]): PersistCliOptions {
  let input: string | undefined;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--input') {
      input = optionValue(args, index, '--input');
      index += 1;
    } else if (argument === '--dry-run') {
      dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!input) throw new Error('--input <run-directory> is required');
  return { input: isAbsolute(input) ? input : resolve(repositoryRoot, input), dryRun };
}

function loadConnectionString(): string {
  try {
    loadEnvFile(resolve(repositoryRoot, '.env'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || database !== 'fashion_shop') {
    throw new Error('crawler:persist only permits local fashion_shop development database');
  }
  return connectionString;
}

async function run(options: PersistCliOptions): Promise<void> {
  const pairs = await readStagingInput(options.input);
  const sources = new Set(pairs.map((pair) => pair.raw.source));
  if (sources.size !== 1) throw new Error('Staging input must contain exactly one source');
  const source = sources.values().next().value;
  if (!source) throw new Error('Staging input source is required');
  const store = new PrismaStagingStore(loadConnectionString());
  try {
    await store.connect();
    const summary = await persistStagingProducts(pairs, store, options.dryRun);
    const verification = await store.verifySource(source);
    const artifact = { recordedAt: new Date().toISOString(), ...summary, verification };
    const outputPath = resolve(
      options.input,
      options.dryRun ? 'persistence-dry-run-summary.json' : 'persistence-summary.json',
    );
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.log(`Persistence summary: ${outputPath}`);
    console.log(JSON.stringify(artifact));
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await store.disconnect();
  }
}

try {
  await run(parsePersistCliOptions(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
