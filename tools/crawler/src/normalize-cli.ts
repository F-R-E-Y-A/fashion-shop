import { resolve } from 'node:path';

import {
  normalizeYodyCollection,
  summarizeNormalization,
} from './normalization/normalize-collection.ts';
import { readRawEnvelopeList, writeNormalizationOutput } from './persistence/normalized-export.ts';

function inputDirectory(args: string[]): string {
  const index = args.indexOf('--input');
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error('--input <run-directory> is required');
  const unknown = args.filter(
    (argument, argumentIndex) => argumentIndex !== index && argumentIndex !== index + 1,
  );
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0]}`);
  return resolve(value);
}

try {
  const directory = inputDirectory(process.argv.slice(2));
  const raw = await readRawEnvelopeList(resolve(directory, 'raw-products.jsonl'));
  const candidates = normalizeYodyCollection(raw);
  const summary = summarizeNormalization(candidates);
  const paths = await writeNormalizationOutput(directory, candidates, summary);
  console.log(`Candidates: ${paths.candidatesPath}`);
  console.log(`Summary: ${paths.summaryPath}`);
  console.log(JSON.stringify(summary));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
