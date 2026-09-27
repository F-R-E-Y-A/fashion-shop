export interface PriceNormalization {
  listPrice: string | null;
  salePrice: string | null;
  effectivePrice: string | null;
  valid: boolean;
}

interface DecimalValue {
  text: string;
  cents: bigint;
}

function decimalValue(value: unknown): DecimalValue | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || !Number.isSafeInteger(value * 100))
  ) {
    return null;
  }
  const source = String(value).trim();
  const match = source.match(/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/u);
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const cents = BigInt(match[1] ?? '0') * 100n + BigInt(fraction || '0');
  const trimmedFraction = (match[2] ?? '').replace(/0+$/u, '');
  return {
    text: trimmedFraction ? `${match[1]}.${trimmedFraction}` : (match[1] ?? '0'),
    cents,
  };
}

export function normalizePrice(
  originalPrice: unknown,
  sourceSalePrice: unknown,
): PriceNormalization {
  const list = decimalValue(originalPrice);
  if (!list || list.cents <= 0n) {
    return { listPrice: null, salePrice: null, effectivePrice: null, valid: false };
  }

  if (sourceSalePrice === null || sourceSalePrice === undefined || sourceSalePrice === '') {
    return { listPrice: list.text, salePrice: null, effectivePrice: list.text, valid: true };
  }

  const sale = decimalValue(sourceSalePrice);
  if (!sale || sale.cents <= 0n || sale.cents > list.cents) {
    return { listPrice: list.text, salePrice: null, effectivePrice: null, valid: false };
  }
  if (sale.cents === list.cents) {
    return { listPrice: list.text, salePrice: null, effectivePrice: list.text, valid: true };
  }
  return {
    listPrice: list.text,
    salePrice: sale.text,
    effectivePrice: sale.text,
    valid: true,
  };
}

export function minimumPrice(values: Array<string | null>): string | null {
  const valid = values.filter((value): value is string => value !== null).map(decimalValue);
  const parsed = valid.filter((value): value is DecimalValue => value !== null);
  if (parsed.length === 0) return null;
  return parsed.reduce((minimum, value) => (value.cents < minimum.cents ? value : minimum)).text;
}
