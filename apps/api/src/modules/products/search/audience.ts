import { lower } from './normalize-vi.js';

/** Doi tuong cua san pham; khop CHECK cua cot products.audience. */
export type Audience = 'nam' | 'nu' | 'unisex';

function sourceCategorySlug(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== 'object') return null;
  const original = (attributes as Record<string, unknown>).originalValues;
  if (!original || typeof original !== 'object') return null;
  const category = (original as Record<string, unknown>).category;
  if (!category || typeof category !== 'object') return null;
  const slug = (category as Record<string, unknown>).slug;
  return typeof slug === 'string' ? slug : null;
}

/**
 * Suy doi tuong luc nap du lieu (ADR-019). Slug danh muc nguon (originalValues.category.slug) ket
 * thuc bang -nu hoac -nam o ca 87 san pham do ngay 29/09/2026, nen day la nguon chinh. Khong co
 * slug thi tim tu "nữ", "nam", "unisex" trong ten; khong ket luan duoc thi de null.
 */
export function audienceFrom(attributes: unknown, name: string): Audience | null {
  const slug = sourceCategorySlug(attributes)?.toLowerCase();
  if (slug?.endsWith('-nu')) return 'nu';
  if (slug?.endsWith('-nam')) return 'nam';

  const words = ` ${lower(name).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const female = words.includes(' nữ ');
  const male = words.includes(' nam ');
  if (words.includes(' unisex ') || (female && male)) return 'unisex';
  if (female) return 'nu';
  if (male) return 'nam';
  return null;
}
