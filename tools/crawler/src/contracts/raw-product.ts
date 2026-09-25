import { createHash } from 'node:crypto';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonObject | JsonPrimitive | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface RawSourceProduct {
  source: string;
  sourceProductId: string;
  sourceUrl: string;
  extraction: {
    kind: string;
    locator: string;
  };
  product: JsonObject;
}

export interface RawProductEnvelope {
  sourceVersion: 1;
  source: string;
  sourceProductId: string;
  sourceUrl: string;
  collectedAt: string;
  extraction: {
    kind: string;
    locator: string;
  };
  product: JsonObject;
}

export function createRawEnvelope(
  parsed: RawSourceProduct,
  collectedAt = new Date().toISOString(),
): RawProductEnvelope {
  return {
    sourceVersion: 1,
    source: parsed.source,
    sourceProductId: parsed.sourceProductId,
    sourceUrl: parsed.sourceUrl,
    collectedAt,
    extraction: parsed.extraction,
    product: parsed.product,
  };
}

export function canonicalSerialize(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSerialize).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalSerialize(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function payloadChecksum(product: JsonObject): string {
  return createHash('sha256').update(canonicalSerialize(product)).digest('hex');
}
