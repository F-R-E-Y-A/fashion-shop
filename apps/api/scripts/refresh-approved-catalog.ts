import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/infra/prisma/prisma.service.js';
import type { ImportProductRow } from '../src/modules/products/import/import.types.js';
import { ProductsService } from '../src/modules/products/products.service.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });
// This host returns ERR_NAME_NOT_RESOLVED on both the local shop and YODY's source page.
const unavailableImageHosts = new Set(['cdn.nhanh.vn']);

interface CandidateFileRow {
  rawProductRecord: { source: string; sourceProductId: string };
  normalizationStatus: string;
  name: string;
  attributes: {
    categorySlug: string | null;
    description: string | null;
    material: string | null;
    careInstructions: string | null;
    brand: { slug: string; name: string } | null;
    images: Array<{ url: string; alt: string; colorCode: string | null }>;
    variants: Array<{
      sku: string | null;
      color: { code: string; name: string; hex: string | null } | null;
      sizeCode: string | null;
      listPrice: string | null;
      salePrice: string | null;
    }>;
  };
}

interface StagedStatus {
  sourceProductId: string;
  status: string;
}

function parseOptions(args: string[]): {
  input: string;
  apply: boolean;
  confirmDatabase: string | null;
} {
  let input: string | undefined;
  let apply = false;
  let confirmDatabase: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--input') input = args[++index];
    else if (args[index] === '--apply') apply = true;
    else if (args[index] === '--dry-run') apply = false;
    else if (args[index] === '--confirm-db') confirmDatabase = args[++index] ?? null;
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!input) throw new Error('--input <normalized-candidates.jsonl> is required');
  if (apply && confirmDatabase !== 'fashion_shop') {
    throw new Error('--apply requires --confirm-db fashion_shop');
  }
  return { input: resolve(repositoryRoot, input), apply, confirmDatabase };
}

async function readCandidates(input: string): Promise<CandidateFileRow[]> {
  const lines = (await readFile(input, 'utf8')).split(/\r?\n/u).filter(Boolean);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as CandidateFileRow;
    } catch (error) {
      throw new Error(`Invalid candidate JSON at line ${index + 1}`, { cause: error });
    }
  });
}

function toImportRow(candidate: CandidateFileRow): ImportProductRow {
  const { attributes } = candidate;
  if (!attributes.categorySlug) throw new Error(`Missing category for ${candidate.name}`);
  const variants = attributes.variants.map((variant) => {
    if (!variant.sku || !variant.listPrice) {
      throw new Error(`Missing SKU or list price for ${candidate.name}`);
    }
    return {
      sku: variant.sku,
      ...(variant.color
        ? {
            color: {
              code: variant.color.code,
              name: variant.color.name,
              ...(variant.color.hex ? { hex: variant.color.hex } : {}),
            },
          }
        : {}),
      ...(variant.sizeCode ? { sizeCode: variant.sizeCode } : {}),
      listPrice: variant.listPrice,
      ...(variant.salePrice ? { salePrice: variant.salePrice } : {}),
    };
  });
  if (variants.length === 0) throw new Error(`No variants for ${candidate.name}`);

  return {
    sourceKey: `${candidate.rawProductRecord.source}:${candidate.rawProductRecord.sourceProductId}`,
    name: candidate.name,
    categorySlug: attributes.categorySlug,
    ...(attributes.brand ? { brand: attributes.brand } : {}),
    ...(attributes.description ? { description: attributes.description } : {}),
    ...(attributes.material ? { material: attributes.material } : {}),
    ...(attributes.careInstructions ? { careInstructions: attributes.careInstructions } : {}),
    attributes: attributes as Record<string, unknown>,
    images: attributes.images
      .filter((image) => !unavailableImageHosts.has(new URL(image.url).hostname))
      .map((image) => ({
        url: image.url,
        alt: image.alt,
        ...(image.colorCode ? { colorCode: image.colorCode } : {}),
      })),
    variants,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const databaseUrl = new URL(connectionString);
  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname) || database !== 'fashion_shop') {
    throw new Error('Catalog refresh is restricted to the local fashion_shop database');
  }

  const rows = await readCandidates(options.input);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await prisma.$connect();
    const products = new ProductsService(prisma as unknown as PrismaService);
    const staged = await prisma.$queryRaw<StagedStatus[]>`
      SELECT raw.source_product_id AS "sourceProductId",
        candidate.normalization_status::text AS status
      FROM staging.normalized_product_candidates candidate
      JOIN staging.raw_product_records raw ON raw.id = candidate.raw_product_record_id
      WHERE raw.source = 'YODY'
        AND candidate.normalization_status IN ('APPROVED', 'IMPORTED')
    `;
    const stagedById = new Map(staged.map((row) => [row.sourceProductId, row.status]));
    const approved = rows.filter(
      (row) =>
        row.rawProductRecord.source === 'YODY' &&
        row.normalizationStatus === 'APPROVED' &&
        ['APPROVED', 'IMPORTED'].includes(
          stagedById.get(row.rawProductRecord.sourceProductId) ?? '',
        ),
    );
    if (approved.length !== staged.length) {
      throw new Error(
        `Candidate file has ${approved.length} approved rows; staging has ${staged.length}`,
      );
    }

    const imports = approved.map(toImportRow);
    const skus = [...new Set(imports.flatMap((row) => row.variants.map((variant) => variant.sku)))];
    const existingVariants = await prisma.productVariant.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true, productId: true },
    });
    const variantBySku = new Map(existingVariants.map((variant) => [variant.sku, variant]));
    const missingSkus = skus.filter((sku) => !variantBySku.has(sku));
    const productIds = [...new Set(existingVariants.map((variant) => variant.productId))];
    const mixedProducts = imports.filter((row) => {
      const ids = new Set(
        row.variants.flatMap((variant) => {
          const productId = variantBySku.get(variant.sku)?.productId;
          return productId ? [productId] : [];
        }),
      );
      return ids.size > 1 || (ids.size === 0 && row.images.length > 0);
    }).length;
    const summary = {
      mode: options.apply ? 'apply' : 'dry-run',
      database,
      approvedCandidates: approved.length,
      importRows: imports.length,
      currentProducts: productIds.length,
      currentVariants: existingVariants.length,
      noImageRows: imports.filter((row) => row.images.length === 0).length,
      skippedImages: approved.reduce(
        (count, candidate) =>
          count +
          candidate.attributes.images.filter((image) =>
            unavailableImageHosts.has(new URL(image.url).hostname),
          ).length,
        0,
      ),
      missingSkus,
      mixedProducts,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!options.apply) return;
    if (missingSkus.length > 0 || mixedProducts > 0 || productIds.length !== imports.length) {
      throw new Error(
        'Preflight requires every approved row to map to exactly one existing product',
      );
    }

    const backupRecords = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        variants: { orderBy: { sku: 'asc' } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    const backupContent = `${JSON.stringify(
      { generatedAt: new Date().toISOString(), database, records: backupRecords },
      null,
      2,
    )}\n`;
    const backupHash = createHash('sha256').update(backupContent).digest('hex');
    const backupDirectory = resolve(repositoryRoot, '..', 'work', 'backups');
    await mkdir(backupDirectory, { recursive: true });
    const backupPath = resolve(
      backupDirectory,
      `ph01-approved-catalog-${new Date().toISOString().replaceAll(':', '-')}.json`,
    );
    await writeFile(backupPath, backupContent, { encoding: 'utf8', flag: 'wx' });

    const result = await products.importProducts(imports);
    const failed = result.filter((row) => row.status === 'failed');
    const created = result.filter((row) => row.status === 'created');
    if (failed.length > 0 || created.length > 0) {
      throw new Error(
        `Refresh stopped after import results: ${JSON.stringify({ failed, created, backupPath, backupHash })}`,
      );
    }

    const afterVariants = await prisma.productVariant.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true, productId: true },
    });
    const afterBySku = new Map(afterVariants.map((variant) => [variant.sku, variant]));
    const changedIdentities = existingVariants.filter((before) => {
      const after = afterBySku.get(before.sku);
      return !after || after.id !== before.id || after.productId !== before.productId;
    });
    if (changedIdentities.length > 0) {
      throw new Error(`Refresh changed variant identity: ${JSON.stringify(changedIdentities)}`);
    }

    await prisma.$executeRaw`
      UPDATE staging.normalized_product_candidates candidate
      SET normalization_status = 'IMPORTED', imported_at = now()
      FROM staging.raw_product_records raw
      WHERE raw.id = candidate.raw_product_record_id
        AND raw.source = 'YODY'
        AND raw.source_product_id = ANY(${approved.map((row) => row.rawProductRecord.sourceProductId)}::text[])
        AND candidate.normalization_status = 'APPROVED'
    `;
    const applied = {
      updated: result.length,
      hiddenWithoutImages: summary.noImageRows,
      preservedVariantIdentities: existingVariants.length,
      backupPath,
      backupSha256: backupHash,
    };
    console.log(JSON.stringify(applied, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
