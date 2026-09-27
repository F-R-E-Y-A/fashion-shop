export function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').replaceAll(/\s+/gu, ' ').trim();
  return normalized || null;
}

export function foldedText(value: unknown): string {
  return (normalizedText(value) ?? '')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/gu, '')
    .replaceAll('đ', 'd')
    .toLowerCase();
}

export function slugToken(value: unknown): string | null {
  const token = foldedText(value)
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '');
  return token || null;
}
