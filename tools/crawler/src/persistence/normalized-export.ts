import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
  NormalizationSummary,
  NormalizedCandidateOutput,
} from '../contracts/normalized-product.ts';
import type { RawProductEnvelope } from '../contracts/raw-product.ts';

function rawEnvelope(value: unknown, line: number): RawProductEnvelope {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('source' in value) ||
    typeof value.source !== 'string' ||
    value.source.trim().length === 0 ||
    !('sourceProductId' in value) ||
    typeof value.sourceProductId !== 'string' ||
    value.sourceProductId.trim().length === 0 ||
    !('product' in value) ||
    value.product === null ||
    typeof value.product !== 'object' ||
    Array.isArray(value.product)
  ) {
    throw new Error(`Invalid raw product envelope at line ${line}`);
  }
  return value as RawProductEnvelope;
}

export async function readRawEnvelopeList(filePath: string): Promise<RawProductEnvelope[]> {
  const content = await readFile(filePath, 'utf8');
  return content
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return rawEnvelope(JSON.parse(line), index + 1);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`Invalid raw-products.jsonl JSON at line ${index + 1}`, { cause: error });
        }
        throw error;
      }
    });
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, filePath);
}

export async function writeNormalizationOutput(
  outputDirectory: string,
  candidates: NormalizedCandidateOutput[],
  summary: NormalizationSummary,
): Promise<{ candidatesPath: string; summaryPath: string }> {
  const candidatesPath = resolve(outputDirectory, 'normalized-candidates.jsonl');
  const summaryPath = resolve(outputDirectory, 'normalization-summary.json');
  const jsonLines = candidates.map((candidate) => JSON.stringify(candidate)).join('\n');
  await atomicWrite(candidatesPath, jsonLines ? `${jsonLines}\n` : '');
  await atomicWrite(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { candidatesPath, summaryPath };
}
