import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { NormalizedCandidateOutput } from '../contracts/normalized-product.ts';
import type { JsonObject, RawProductEnvelope } from '../contracts/raw-product.ts';
import type { StagingProductPair } from './staging-contracts.ts';

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identity(source: string, sourceProductId: string): string {
  return `${source}:${sourceProductId}`;
}

export function parseJsonLines(content: string, fileName: string): unknown[] {
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(`${fileName} contains malformed JSON at line ${index + 1}`, {
          cause: error,
        });
      }
    });
}

function validateRaw(value: unknown, index: number): RawProductEnvelope {
  const raw = objectValue(value);
  const product = objectValue(raw?.product);
  const collectedAt = raw?.collectedAt;
  if (
    raw?.sourceVersion !== 1 ||
    raw.source !== 'YODY' ||
    typeof raw.sourceProductId !== 'string' ||
    raw.sourceProductId.length === 0 ||
    typeof raw.sourceUrl !== 'string' ||
    typeof collectedAt !== 'string' ||
    !Number.isFinite(Date.parse(collectedAt)) ||
    product === null
  ) {
    throw new Error(`Invalid raw product envelope at line ${index + 1}`);
  }
  return raw as unknown as RawProductEnvelope;
}

function validateCandidate(value: unknown, index: number): NormalizedCandidateOutput {
  const candidate = objectValue(value);
  const rawReference = objectValue(candidate?.rawProductRecord);
  const attributes = objectValue(candidate?.attributes);
  const validation = objectValue(candidate?.validation);
  const statuses = new Set(['PENDING_REVIEW', 'DUPLICATE', 'APPROVED', 'REJECTED']);
  if (
    rawReference?.source !== 'YODY' ||
    typeof rawReference.sourceProductId !== 'string' ||
    rawReference.sourceProductId.length === 0 ||
    typeof candidate?.name !== 'string' ||
    !statuses.has(String(candidate.normalizationStatus)) ||
    attributes?.contractVersion !== 2 ||
    !Array.isArray(validation?.issues) ||
    !Array.isArray(validation.warnings)
  ) {
    throw new Error(`Invalid normalized candidate contract at line ${index + 1}`);
  }
  return candidate as unknown as NormalizedCandidateOutput;
}

export function validateStagingInputValues(
  rawValues: unknown[],
  candidateValues: unknown[],
): StagingProductPair[] {
  const rawByIdentity = new Map<string, RawProductEnvelope>();
  rawValues.forEach((value, index) => {
    const raw = validateRaw(value, index);
    const key = identity(raw.source, raw.sourceProductId);
    if (rawByIdentity.has(key)) throw new Error(`Duplicate raw identity: ${key}`);
    rawByIdentity.set(key, raw);
  });

  const candidateByIdentity = new Map<string, NormalizedCandidateOutput>();
  candidateValues.forEach((value, index) => {
    const candidate = validateCandidate(value, index);
    const reference = candidate.rawProductRecord;
    const key = identity(reference.source, reference.sourceProductId);
    if (candidateByIdentity.has(key)) throw new Error(`Duplicate candidate identity: ${key}`);
    if (!rawByIdentity.has(key)) throw new Error(`Orphan normalized candidate: ${key}`);
    candidateByIdentity.set(key, candidate);
  });

  return [...rawByIdentity.entries()].map(([key, raw]) => {
    const candidate = candidateByIdentity.get(key);
    if (!candidate) throw new Error(`Missing normalized candidate: ${key}`);
    return { raw, candidate };
  });
}

export async function readStagingInput(directory: string): Promise<StagingProductPair[]> {
  const [rawContent, candidateContent] = await Promise.all([
    readFile(resolve(directory, 'raw-products.jsonl'), 'utf8'),
    readFile(resolve(directory, 'normalized-candidates.jsonl'), 'utf8'),
  ]);
  return validateStagingInputValues(
    parseJsonLines(rawContent, 'raw-products.jsonl'),
    parseJsonLines(candidateContent, 'normalized-candidates.jsonl'),
  );
}

export function rawPayload(raw: RawProductEnvelope): JsonObject {
  return raw as unknown as JsonObject;
}
