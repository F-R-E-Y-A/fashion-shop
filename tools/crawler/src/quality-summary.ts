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

const targetCategorySlugs = [
  'ao-thun',
  'ao-so-mi',
  'ao-khoac',
  'quan-dai',
  'quan-short',
  'mu',
  'that-lung',
] as const;

export interface QualitySummary {
  collection: Pick<RunSummary, 'discovered' | 'requested' | 'succeeded' | 'failed' | 'duplicates'>;
  normalization: NormalizationSummary;
  percentages: {
    parseSuccessRate: number;
    approvedRate: number;
    pendingReviewRate: number;
    validImageRate: number;
  };
  categoryCoverage: Record<string, number>;
  unknownSourceCategories: Record<string, number>;
  observedSourceSizes: Record<string, number>;
  sizeCoverage: Record<string, number>;
  imageCoverage: { withValidImage: number; withoutValidImage: number };
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

export function buildQualitySummary(
  run: RunSummary,
  candidates: NormalizedCandidateOutput[],
): QualitySummary {
  const normalization = summarizeNormalization(candidates);
  const categoryCoverage = new Map<string, number>([
    ...targetCategorySlugs.map((slug) => [slug, 0] as const),
    ['unmapped', 0],
  ]);
  const unknownSourceCategories = new Map<string, number>();
  const observedSourceSizes = new Map<string, number>();
  const sizeCoverage = new Map<string, number>(
    ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'numeric', 'FREE', 'other'].map((key) => [
      key,
      0,
    ]),
  );
  let withValidImage = 0;

  for (const candidate of candidates) {
    const category = candidate.attributes.categorySlug ?? 'unmapped';
    categoryCoverage.set(category, (categoryCoverage.get(category) ?? 0) + 1);
    if (candidate.validation.issues.some((issue) => issue.code === 'UNKNOWN_CATEGORY')) {
      const source = candidate.attributes.sourceCategory;
      increment(unknownSourceCategories, source.slug ?? source.name ?? '(missing)');
    }
    for (const value of candidate.attributes.originalValues.sizes) {
      const size = sourceSize(value);
      if (!size) continue;
      increment(observedSourceSizes, size);
      const bucket = sizeBucket(size);
      sizeCoverage.set(bucket, (sizeCoverage.get(bucket) ?? 0) + 1);
    }
    if (candidate.attributes.images.length > 0) withValidImage += 1;
  }

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
    categoryCoverage: Object.fromEntries(categoryCoverage),
    unknownSourceCategories: sortedRecord(unknownSourceCategories),
    observedSourceSizes: sortedRecord(observedSourceSizes),
    sizeCoverage: Object.fromEntries(sizeCoverage),
    imageCoverage: {
      withValidImage,
      withoutValidImage: normalization.total - withValidImage,
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
