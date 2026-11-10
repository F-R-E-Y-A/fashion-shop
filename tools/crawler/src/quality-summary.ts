import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
  NormalizationSummary,
  NormalizedCandidateOutput,
} from './contracts/normalized-product.ts';
import type { JsonValue } from './contracts/raw-product.ts';
import { summarizeNormalization } from './normalization/normalize-collection.ts';
import { normalizedText } from './normalization/text.ts';
import type { RunSummary } from './persistence/manifest.ts';
import { BASELINE_CATEGORY_SLUGS } from './scope/catalog-baseline.ts';

export interface QualitySummary {
  collection: Pick<RunSummary, 'discovered' | 'requested' | 'succeeded' | 'failed' | 'duplicates'>;
  normalization: NormalizationSummary;
  percentages: {
    parseSuccessRate: number;
    approvedRate: number;
    pendingReviewRate: number;
    validImageRate: number;
  };
  acceptance: {
    minimumValidProduct: number;
    missingName: number;
    missingSourceCategory: number;
    missingValidPrice: number;
    acceptancePercentage: number;
  };
  scope: {
    inScope: number;
    outOfScope: number;
    reviewRequired: number;
    percentages: { inScope: number; outOfScope: number; reviewRequired: number };
    reasonCounts: Record<string, number>;
  };
  categoryCoverage: Record<string, number>;
  unknownSourceCategories: Record<string, number>;
  outOfScopeSourceCategories: Record<string, number>;
  observedSourceSizes: Record<string, number>;
  sizeCoverage: Record<string, number>;
  imageCoverage: { withValidImage: number; withoutValidImage: number };
  priceCoverage: {
    withValidPrice: number;
    withoutValidPrice: number;
    validPriceRate: number;
    minimumEffectivePrice: string | null;
    maximumEffectivePrice: string | null;
    medianEffectivePrice: string | null;
  };
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));
}

function sortedRecord(values: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...values.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function increment(values: Map<string, number>, key: string): void {
  values.set(key, (values.get(key) ?? 0) + 1);
}

function sourceSize(value: JsonValue): string | null {
  const source =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, JsonValue>).name
      : value;
  return normalizedText(source)?.toUpperCase() ?? null;
}

function sizeBucket(value: string): string {
  if (['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'].includes(value)) return value;
  if (['F', 'FREE', 'FREESIZE', 'FREE SIZE', 'ONE SIZE', 'OS'].includes(value)) return 'FREE';
  if (/^\d+$/u.test(value)) return 'numeric';
  return 'other';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2
    : (values[middle] ?? null);
}

export function buildQualitySummary(
  run: RunSummary,
  candidates: NormalizedCandidateOutput[],
): QualitySummary {
  const normalization = summarizeNormalization(candidates);
  const categoryCoverage = new Map<string, number>([
    ...BASELINE_CATEGORY_SLUGS.map((slug) => [slug, 0] as const),
    ['out-of-scope', 0],
    ['unknown', 0],
  ]);
  const unknownSourceCategories = new Map<string, number>();
  const outOfScopeSourceCategories = new Map<string, number>();
  const observedSourceSizes = new Map<string, number>();
  const sizeCoverage = new Map<string, number>(
    ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'numeric', 'FREE', 'other'].map((key) => [
      key,
      0,
    ]),
  );
  let withValidImage = 0;
  let minimumValidProduct = 0;
  let missingName = 0;
  let missingSourceCategory = 0;
  let missingValidPrice = 0;
  const scopeCounts = { IN_SCOPE: 0, OUT_OF_SCOPE: 0, REVIEW_REQUIRED: 0 };
  const scopeReasonCounts = new Map<string, number>();
  const validPrices: number[] = [];

  for (const candidate of candidates) {
    const hasName =
      normalizedText(candidate.name) !== null ||
      normalizedText(candidate.attributes.originalValues.name) !== null;
    const hasSourceCategory =
      normalizedText(candidate.attributes.sourceCategory.name) !== null ||
      normalizedText(candidate.attributes.sourceCategory.slug) !== null;
    const numericPrice = candidate.price === null ? Number.NaN : Number(candidate.price);
    const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
    if (!hasName) missingName += 1;
    if (!hasSourceCategory) missingSourceCategory += 1;
    if (!hasValidPrice) missingValidPrice += 1;
    if (hasName && hasSourceCategory && hasValidPrice) minimumValidProduct += 1;

    const scope = candidate.attributes.scope;
    scopeCounts[scope.status] += 1;
    scope.reasons.forEach((reason) => increment(scopeReasonCounts, reason.code));
    const outOfScopeCategory = scope.reasons.some(
      (reason) => reason.code === 'OUT_OF_SCOPE_CATEGORY',
    );
    const unknownCategory = scope.reasons.some((reason) => reason.code === 'UNKNOWN_CATEGORY');
    const category =
      candidate.attributes.categorySlug ?? (outOfScopeCategory ? 'out-of-scope' : 'unknown');
    categoryCoverage.set(category, (categoryCoverage.get(category) ?? 0) + 1);
    const source = candidate.attributes.sourceCategory;
    const sourceValue = source.slug ?? source.name ?? '(missing)';
    if (unknownCategory) increment(unknownSourceCategories, sourceValue);
    if (outOfScopeCategory) increment(outOfScopeSourceCategories, sourceValue);
    for (const value of candidate.attributes.originalValues.sizes) {
      const size = sourceSize(value);
      if (!size) continue;
      increment(observedSourceSizes, size);
      const bucket = sizeBucket(size);
      sizeCoverage.set(bucket, (sizeCoverage.get(bucket) ?? 0) + 1);
    }
    if (candidate.attributes.images.length > 0) withValidImage += 1;
    if (hasValidPrice) validPrices.push(numericPrice);
  }
  validPrices.sort((left, right) => left - right);
  const medianPrice = median(validPrices);

  return {
    collection: {
      discovered: run.discovered,
      requested: run.requested,
      succeeded: run.succeeded,
      failed: run.failed,
      duplicates: run.duplicates,
    },
    normalization,
    percentages: {
      parseSuccessRate: percentage(run.succeeded, run.requested),
      approvedRate: percentage(normalization.approved, normalization.total),
      pendingReviewRate: percentage(normalization.pendingReview, normalization.total),
      validImageRate: percentage(withValidImage, normalization.total),
    },
    acceptance: {
      minimumValidProduct,
      missingName,
      missingSourceCategory,
      missingValidPrice,
      acceptancePercentage: percentage(minimumValidProduct, normalization.total),
    },
    scope: {
      inScope: scopeCounts.IN_SCOPE,
      outOfScope: scopeCounts.OUT_OF_SCOPE,
      reviewRequired: scopeCounts.REVIEW_REQUIRED,
      percentages: {
        inScope: percentage(scopeCounts.IN_SCOPE, normalization.total),
        outOfScope: percentage(scopeCounts.OUT_OF_SCOPE, normalization.total),
        reviewRequired: percentage(scopeCounts.REVIEW_REQUIRED, normalization.total),
      },
      reasonCounts: sortedRecord(scopeReasonCounts),
    },
    categoryCoverage: Object.fromEntries(categoryCoverage),
    unknownSourceCategories: sortedRecord(unknownSourceCategories),
    outOfScopeSourceCategories: sortedRecord(outOfScopeSourceCategories),
    observedSourceSizes: sortedRecord(observedSourceSizes),
    sizeCoverage: Object.fromEntries(sizeCoverage),
    imageCoverage: {
      withValidImage,
      withoutValidImage: normalization.total - withValidImage,
    },
    priceCoverage: {
      withValidPrice: validPrices.length,
      withoutValidPrice: normalization.total - validPrices.length,
      validPriceRate: percentage(validPrices.length, normalization.total),
      minimumEffectivePrice: validPrices[0] === undefined ? null : String(validPrices[0]),
      maximumEffectivePrice: validPrices.at(-1) === undefined ? null : String(validPrices.at(-1)),
      medianEffectivePrice: medianPrice === null ? null : String(medianPrice),
    },
  };
}

export async function writeQualitySummary(
  directory: string,
  candidates: NormalizedCandidateOutput[],
): Promise<string> {
  const run = JSON.parse(
    await readFile(resolve(directory, 'run-summary.json'), 'utf8'),
  ) as RunSummary;
  const outputPath = resolve(directory, 'quality-summary.json');
  const summary = buildQualitySummary(run, candidates);
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return outputPath;
}
