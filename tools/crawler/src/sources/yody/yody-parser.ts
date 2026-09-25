import { CollectorError } from '../../contracts/product-source-adapter.ts';
import type { JsonObject, RawSourceProduct } from '../../contracts/raw-product.ts';
import { canonicalizeYodyProductUrl } from './yody-discovery.ts';

const PDP_DATA_PATTERN = /self\.PDPData\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*;?/su;

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseEmbeddedPayload(html: string): JsonObject {
  const match = html.match(PDP_DATA_PATTERN);
  if (!match || (match[1] === undefined && match[2] === undefined)) {
    throw new CollectorError('PDP_DATA_MISSING', 'self.PDPData was not found in product HTML');
  }

  try {
    const encoded = match[1] === undefined ? match[2] : JSON.parse(`"${match[1]}"`);
    if (typeof encoded !== 'string') throw new Error('PDPData assignment was not a string');
    const payload: unknown = JSON.parse(encoded);
    if (!isJsonObject(payload)) throw new Error('PDPData was not a JSON object');
    return payload;
  } catch (error) {
    throw new CollectorError('PDP_DATA_INVALID', 'self.PDPData was not valid embedded JSON', {
      cause: error,
    });
  }
}

function canonicalProductUrl(product: JsonObject, sourceUrl: string): string {
  const handle = product.url_handle;
  if (typeof handle === 'string' && handle.trim()) {
    return canonicalizeYodyProductUrl(`https://yody.vn/product/${handle.trim()}`);
  }
  return canonicalizeYodyProductUrl(sourceUrl);
}

export function parseYodyProductHtml(html: string, sourceUrl: string): RawSourceProduct {
  const product = parseEmbeddedPayload(html);
  const id = product.id;
  if ((typeof id !== 'number' && typeof id !== 'string') || String(id).trim() === '') {
    throw new CollectorError('PRODUCT_ID_MISSING', 'PDPData.id is required');
  }
  if (typeof product.name !== 'string' || product.name.trim() === '') {
    throw new CollectorError('PRODUCT_NAME_MISSING', 'PDPData.name is required');
  }

  return {
    sourceProductId: String(id),
    sourceUrl: canonicalProductUrl(product, sourceUrl),
    product,
  };
}
