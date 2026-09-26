import type {
  NormalizationSummary,
  NormalizedCandidateOutput,
  ValidationMessage,
} from '../contracts/normalized-product.ts';
import { payloadChecksum, type RawProductEnvelope } from '../contracts/raw-product.ts';
import { normalizeYodyEnvelope, refreshNormalizationStatus } from './normalize-product.ts';

function message(code: ValidationMessage['code'], path: string, text: string): ValidationMessage {
  return { code, path, message: text };
}

export function normalizeYodyCollection(raw: RawProductEnvelope[]): NormalizedCandidateOutput[] {
  const candidates: NormalizedCandidateOutput[] = [];
  const identityIndex = new Map<
    string,
    { checksum: string; candidate: NormalizedCandidateOutput }
  >();

  for (const envelope of raw) {
    const identity = `${envelope.source}:${envelope.sourceProductId}`;
    const checksum = payloadChecksum(envelope.product);
    const existing = identityIndex.get(identity);
    if (existing) {
      const equivalent = existing.checksum === checksum;
      const target = equivalent
        ? existing.candidate.validation.warnings
        : existing.candidate.validation.issues;
      target.push(
        message(
          equivalent ? 'DUPLICATE_PRODUCT_DEDUPED' : 'DUPLICATE_PRODUCT',
          'rawProductRecord',
          equivalent
            ? 'Equivalent duplicate raw product was removed'
            : 'Conflicting duplicate raw product identity was removed',
        ),
      );
      refreshNormalizationStatus(existing.candidate);
      continue;
    }
    const candidate = normalizeYodyEnvelope(envelope);
    candidates.push(candidate);
    identityIndex.set(identity, { checksum, candidate });
  }

  const skuOwners = new Map<string, NormalizedCandidateOutput[]>();
  for (const candidate of candidates) {
    for (const variant of candidate.attributes.variants) {
      if (!variant.sku) continue;
      const owners = skuOwners.get(variant.sku) ?? [];
      if (!owners.includes(candidate)) owners.push(candidate);
      skuOwners.set(variant.sku, owners);
    }
  }
  for (const [sku, owners] of skuOwners) {
    if (owners.length < 2) continue;
    for (const candidate of owners) {
      candidate.validation.issues.push(
        message('DUPLICATE_SKU', 'variants', `SKU ${sku} occurs in multiple products`),
      );
      refreshNormalizationStatus(candidate);
    }
  }
  return candidates;
}

export function summarizeNormalization(
  candidates: NormalizedCandidateOutput[],
): NormalizationSummary {
  const count = (status: NormalizedCandidateOutput['normalizationStatus']) =>
    candidates.filter((candidate) => candidate.normalizationStatus === status).length;
  const aggregate = (kind: 'issues' | 'warnings') => {
    const counts: Record<string, number> = {};
    for (const candidate of candidates) {
      for (const entry of candidate.validation[kind]) {
        counts[entry.code] = (counts[entry.code] ?? 0) + 1;
      }
    }
    return Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
    );
  };
  return {
    source: 'YODY',
    total: candidates.length,
    approved: count('APPROVED'),
    pendingReview: count('PENDING_REVIEW'),
    duplicate: count('DUPLICATE'),
    rejected: count('REJECTED'),
    issueCounts: aggregate('issues'),
    warningCounts: aggregate('warnings'),
  };
}
