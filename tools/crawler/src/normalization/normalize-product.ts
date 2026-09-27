import type {
  NormalizedBrand,
  NormalizedCandidateOutput,
  NormalizedVariantV2,
  ValidationMessage,
} from '../contracts/normalized-product.ts';
import type { JsonObject, JsonValue, RawProductEnvelope } from '../contracts/raw-product.ts';
import { classifyCatalogScope } from '../scope/scope-policy.ts';
import { yodyScopeHint } from '../sources/yody/yody-scope-mapping.ts';
import { normalizeCategory, sourceCategory } from './category.ts';
import { normalizeYodyColor } from './color.ts';
import { normalizeImages } from './images.ts';
import { minimumPrice, normalizePrice } from './price.ts';
import { normalizeSize } from './size.ts';
import { normalizeSku } from './sku.ts';
import { normalizedText, slugToken } from './text.ts';

function asObject(value: JsonValue | undefined): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function sourceVariants(product: JsonObject): JsonObject[] {
  return Array.isArray(product.variants)
    ? product.variants.map(asObject).filter((value): value is JsonObject => value !== null)
    : [];
}

function normalizeBrand(value: JsonValue | undefined): NormalizedBrand | null {
  const brand = asObject(value);
  const name = normalizedText(brand?.name);
  const slug = slugToken(brand?.slug);
  return name && slug ? { name, slug } : null;
}

function materialValues(value: JsonValue | undefined): {
  material: string | null;
  careInstructions: string | null;
} {
  if (typeof value === 'string') return { material: normalizedText(value), careInstructions: null };
  const material = asObject(value);
  return {
    material: normalizedText(material?.component) ?? normalizedText(material?.name),
    careInstructions: normalizedText(material?.preserve),
  };
}

function issue(code: ValidationMessage['code'], path: string, message: string): ValidationMessage {
  return { code, path, message };
}

export function refreshNormalizationStatus(candidate: NormalizedCandidateOutput): void {
  if (
    candidate.normalizationStatus !== 'DUPLICATE' &&
    candidate.normalizationStatus !== 'REJECTED'
  ) {
    candidate.normalizationStatus =
      candidate.validation.issues.length === 0 && candidate.attributes.scope.status === 'IN_SCOPE'
        ? 'APPROVED'
        : 'PENDING_REVIEW';
  }
}

function normalizeVariant(
  variant: JsonObject,
  index: number,
  sourceProductId: string,
  issues: ValidationMessage[],
  warnings: ValidationMessage[],
): { variant: NormalizedVariantV2; effectivePrice: string | null } {
  const path = `variants[${index}]`;
  const sourceId = variant.id;
  const sourceVariantId =
    typeof sourceId === 'number' || typeof sourceId === 'string' ? String(sourceId) : null;
  if (!sourceVariantId) {
    issues.push(issue('MISSING_VARIANT_ID', `${path}.sourceVariantId`, 'Variant ID is required'));
  }

  const size = normalizeSize(variant.size);
  if (size.state === 'missing') {
    issues.push(issue('MISSING_SIZE', `${path}.sizeCode`, 'Source variant has no size'));
  }

  const colorResult = normalizeYodyColor(variant.color, `${path}.color`);
  if (colorResult.issue) issues.push(colorResult.issue);
  if (colorResult.warning) warnings.push(colorResult.warning);

  const price = normalizePrice(variant.original_price, variant.sale_price);
  if (!price.valid) {
    issues.push(issue('INVALID_PRICE', `${path}.price`, 'Variant list/sale price is invalid'));
  }

  const sku = normalizeSku({
    sourceSku: variant.sku,
    sourceProductId,
    colorCode: colorResult.color?.code ?? null,
    sizeCode: size.code,
  });
  if (!sku.sku) {
    issues.push(
      issue(
        'MISSING_SKU_COMPONENT',
        `${path}.sku`,
        'Source SKU and deterministic fallback components are unavailable',
      ),
    );
  }

  return {
    variant: {
      sourceVariantId,
      sourceSku: sku.sourceSku,
      sku: sku.sku,
      color: colorResult.color,
      sizeCode: size.code,
      listPrice: price.listPrice,
      salePrice: price.salePrice,
    },
    effectivePrice: price.effectivePrice,
  };
}

function dedupeVariants(
  variants: NormalizedVariantV2[],
  issues: ValidationMessage[],
  warnings: ValidationMessage[],
): NormalizedVariantV2[] {
  const byCombination = new Map<string, NormalizedVariantV2>();
  const bySku = new Map<string, NormalizedVariantV2>();
  const result: NormalizedVariantV2[] = [];

  variants.forEach((variant, index) => {
    const signature = `${variant.color?.code ?? '∅'}|${variant.sizeCode ?? '∅'}`;
    const existing = byCombination.get(signature);
    if (existing) {
      const equivalent =
        existing.sku === variant.sku &&
        existing.listPrice === variant.listPrice &&
        existing.salePrice === variant.salePrice;
      if (equivalent) {
        warnings.push(
          issue(
            'DUPLICATE_VARIANT_DEDUPED',
            `variants[${index}]`,
            `Equivalent duplicate combination ${signature} was removed`,
          ),
        );
        return;
      }
      issues.push(
        issue(
          'DUPLICATE_VARIANT',
          `variants[${index}]`,
          `Conflicting duplicate color/size combination ${signature}`,
        ),
      );
    } else {
      byCombination.set(signature, variant);
    }

    if (variant.sku) {
      const skuOwner = bySku.get(variant.sku);
      if (skuOwner && skuOwner !== existing) {
        issues.push(
          issue(
            'DUPLICATE_SKU',
            `variants[${index}].sku`,
            `Duplicate normalized SKU ${variant.sku}`,
          ),
        );
      } else {
        bySku.set(variant.sku, variant);
      }
    }
    result.push(variant);
  });
  return result;
}

export function normalizeYodyEnvelope(envelope: RawProductEnvelope): NormalizedCandidateOutput {
  const product = envelope.product;
  const name = normalizedText(product.name) ?? '';
  const categoryObject = asObject(product.category);
  const category = normalizeCategory(categoryObject);
  const issues: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const scopeHint = yodyScopeHint(categoryObject);

  const source = sourceVariants(product);
  if (source.length === 0)
    issues.push(issue('NO_VARIANT', 'variants', 'Source product has no variant'));
  const normalized = source.map((variant, index) =>
    normalizeVariant(variant, index, envelope.sourceProductId, issues, warnings),
  );
  const variants = dedupeVariants(
    normalized.map((value) => value.variant),
    issues,
    warnings,
  );
  const imageResult = normalizeImages(
    name,
    source,
    normalized.map((value) => value.variant),
  );
  warnings.push(...imageResult.warnings);
  const material = materialValues(product.material);
  const scope = classifyCatalogScope({
    categorySlug: category?.slug ?? null,
    categoryDisposition: scopeHint.categoryDisposition,
    sourceCategoryValue: scopeHint.sourceCategoryValue,
    sizes: normalized.map(({ variant }) => ({
      code: variant.sizeCode,
      context: scopeHint.sizeContext,
    })),
  });

  const candidate: NormalizedCandidateOutput = {
    rawProductRecord: { source: envelope.source, sourceProductId: envelope.sourceProductId },
    name,
    categoryName: category?.name ?? null,
    price: minimumPrice(normalized.map((value) => value.effectivePrice)),
    attributes: {
      contractVersion: 2,
      currency: 'VND',
      scope,
      categorySlug: category?.slug ?? null,
      description: normalizedText(product.description),
      material: material.material,
      careInstructions: material.careInstructions,
      sourceCategory: sourceCategory(categoryObject),
      brand: normalizeBrand(product.brand),
      images: imageResult.images,
      variants,
      originalValues: {
        name: product.name ?? null,
        category: product.category ?? null,
        material: product.material ?? null,
        prices: source.map((variant) => ({
          sourceVariantId: variant.id ?? null,
          originalPrice: variant.original_price ?? null,
          salePrice: variant.sale_price ?? null,
        })),
        sizes: source.map((variant) => variant.size ?? null),
        colors: source.map((variant) => variant.color ?? null),
      },
    },
    imageHash: null,
    normalizationStatus: 'PENDING_REVIEW',
    validation: { issues, warnings },
  };
  refreshNormalizationStatus(candidate);
  return candidate;
}
