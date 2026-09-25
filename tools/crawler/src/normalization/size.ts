import { normalizedText } from './text.ts';

const allowedSizes = new Set(['XS', 'S', 'M', 'L', 'XL', '29', '30', '31', '32', 'FREE']);
const freeAliases = new Set(['F', 'FREESIZE', 'FREE SIZE', 'ONE SIZE', 'OS']);

export type SizeNormalization =
  | { code: null; state: 'missing' }
  | { code: string; state: 'unknown' }
  | { code: string; state: 'valid' };

export function normalizeSize(value: unknown): SizeNormalization {
  const source =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).name
      : value;
  const text = normalizedText(source)?.toUpperCase() ?? null;
  if (!text) return { code: null, state: 'missing' };
  const code = freeAliases.has(text) ? 'FREE' : text;
  return allowedSizes.has(code) ? { code, state: 'valid' } : { code, state: 'unknown' };
}
