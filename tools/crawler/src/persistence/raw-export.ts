import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { RawProductEnvelope } from '../contracts/raw-product.ts';

function identityOf(envelope: RawProductEnvelope): string {
  return `${envelope.source}:${envelope.sourceProductId}`;
}

function parseEnvelope(line: string, lineNumber: number): RawProductEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new Error(`Invalid raw-products.jsonl at line ${lineNumber}`, { cause: error });
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    !('source' in value) ||
    !('sourceProductId' in value) ||
    !('product' in value)
  ) {
    throw new Error(`Invalid raw product envelope at line ${lineNumber}`);
  }
  return value as RawProductEnvelope;
}

export async function loadRawProducts(filePath: string): Promise<Map<string, RawProductEnvelope>> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw error;
  }

  const products = new Map<string, RawProductEnvelope>();
  const lines = content.split('\n').filter(Boolean);
  lines.forEach((line, index) => {
    const envelope = parseEnvelope(line, index + 1);
    products.set(identityOf(envelope), envelope);
  });
  return products;
}

async function writeRawProducts(
  filePath: string,
  products: Map<string, RawProductEnvelope>,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  const content = [...products.values()].map((value) => JSON.stringify(value)).join('\n');
  await writeFile(temporaryPath, content ? `${content}\n` : '', 'utf8');
  await rename(temporaryPath, filePath);
}

export async function upsertRawProduct(
  filePath: string,
  products: Map<string, RawProductEnvelope>,
  envelope: RawProductEnvelope,
  force: boolean,
): Promise<'inserted' | 'updated' | 'duplicate'> {
  const identity = identityOf(envelope);
  if (products.has(identity) && !force) return 'duplicate';

  const result = products.has(identity) ? 'updated' : 'inserted';
  products.set(identity, envelope);
  await writeRawProducts(filePath, products);
  return result;
}
