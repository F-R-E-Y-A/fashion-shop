import { isCanonicalSizeCode, resolveActiveSizeAlias } from './size-taxonomy.ts';
import { normalizedText } from './text.ts';

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
  const code = resolveActiveSizeAlias(text);
  return isCanonicalSizeCode(code) ? { code, state: 'valid' } : { code, state: 'unknown' };
}
