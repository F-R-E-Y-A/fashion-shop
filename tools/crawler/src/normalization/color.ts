import type { NormalizedColor, ValidationMessage } from '../contracts/normalized-product.ts';
import { normalizedText, slugToken } from './text.ts';

export interface ColorNormalization {
  color: NormalizedColor | null;
  issue?: ValidationMessage;
  warning?: ValidationMessage;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function normalizeYodyColor(value: unknown, path: string): ColorNormalization {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      color: null,
      issue: { code: 'MISSING_COLOR', path, message: 'Source variant has no color object' },
    };
  }

  const source = value as Record<string, unknown>;
  const sourceCode = normalizedText(source.code);
  const codeToken = slugToken(sourceCode);
  const sourceName = normalizedText(source.name);
  if (!sourceCode || !codeToken || !sourceName) {
    return {
      color: null,
      issue: {
        code: 'INVALID_COLOR_CODE',
        path,
        message: 'Color requires a stable source code and display name',
      },
    };
  }

  const suffix = new RegExp(`(?:[-\\s]+)${escapeRegExp(sourceCode)}$`, 'iu');
  const name = sourceName.replace(suffix, '').trim() || sourceName;
  const sourceHex = normalizedText(source.hex);
  const shortHex =
    sourceHex !== null ? /^#([0-9a-f])([0-9a-f])([0-9a-f])$/iu.exec(sourceHex) : null;
  const expandedHex = shortHex
    ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`
    : sourceHex;
  const validHex = expandedHex !== null && /^#[0-9a-f]{6}$/iu.test(expandedHex);
  const warning =
    sourceHex && !validHex
      ? {
          code: 'INVALID_HEX' as const,
          path: `${path}.hex`,
          message: `Ignored invalid source hex ${sourceHex}`,
        }
      : undefined;

  return {
    color: {
      code: `yody-${codeToken}`,
      name,
      hex: validHex ? expandedHex.toUpperCase() : null,
    },
    warning,
  };
}
