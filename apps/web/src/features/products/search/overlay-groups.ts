import { formatPrice } from '@/core';

import type { CategoryNode, Product, SuggestResponse } from '../api/index.js';
import { EXAMPLE_QUERIES, MIN_QUERY_LENGTH } from './search-content.js';

export type OverlayAction =
  | { type: 'query'; value: string }
  | { type: 'category'; slug: string }
  | { type: 'product'; slug: string };

export interface OverlayOption {
  id: string;
  action: OverlayAction;
  primary: string;
  secondary?: string;
  trailing?: string;
  product?: Product;
}

export interface OverlayGroup {
  id: string;
  title: string;
  options: OverlayOption[];
}

interface GroupInput {
  /** Chu khach dang go (da cat khoang trang). */
  text: string;
  recent: readonly string[];
  categories: readonly CategoryNode[];
  suggestion: SuggestResponse | undefined;
}

/** Dong "Da hieu: ..." va phan noi truy van; rong khi khong co y nao duoc hieu. */
export function describeUnderstanding(suggestion: SuggestResponse | undefined): string {
  if (!suggestion) return '';
  const labels = suggestion.interpretation.chips.map((chip) => chip.label).join(' · ');
  const understood = labels ? `Đã hiểu: ${labels}` : 'Tìm theo chữ';
  return suggestion.relaxed.length > 0
    ? `${understood} · đã ${suggestion.relaxed.join(', ')}`
    : understood;
}

/**
 * Dung cac nhom lua chon cua hop thoai tu trang thai hien tai. Ham thuan: khong goi API,
 * khong doc localStorage. `id` cua lua chon danh so lien tuc de aria-activedescendant tro dung.
 */
export function buildGroups(input: GroupInput, idPrefix: string): OverlayGroup[] {
  let next = 0;
  const option = (o: Omit<OverlayOption, 'id'>): OverlayOption => ({
    ...o,
    id: `${idPrefix}-${next++}`,
  });
  const groups: OverlayGroup[] = [];
  const add = (title: string, options: OverlayOption[]) => {
    if (options.length > 0) groups.push({ id: `${idPrefix}-g${groups.length}`, title, options });
  };
  const { text, suggestion } = input;

  if (text.length === 0) {
    add(
      'Tìm gần đây',
      input.recent.map((q) =>
        option({ action: { type: 'query', value: q }, primary: q, trailing: '↵' }),
      ),
    );
    add(
      'Thử hỏi',
      EXAMPLE_QUERIES.map((q) => option({ action: { type: 'query', value: q }, primary: q })),
    );
    add(
      'Danh mục',
      input.categories
        .filter((c) => c.productCount > 0)
        .map((c) =>
          option({
            action: { type: 'category', slug: c.slug },
            primary: c.name,
            trailing: `${c.productCount} sp`,
          }),
        ),
    );
    return groups;
  }

  const understanding = describeUnderstanding(suggestion);
  add('Tìm kiếm', [
    option({
      action: { type: 'query', value: text },
      primary: `Xem tất cả kết quả cho “${text}”`,
      secondary: text.length >= MIN_QUERY_LENGTH ? understanding || undefined : undefined,
      trailing: suggestion ? `${suggestion.total} sp ↵` : '↵',
    }),
  ]);
  if (!suggestion) return groups;

  add(
    'Gợi ý',
    suggestion.queries.map((q) =>
      option({
        action: { type: 'query', value: q.text },
        primary: q.text,
        trailing: `${q.count} sp`,
      }),
    ),
  );
  add(
    'Danh mục',
    suggestion.categories.map((c) =>
      option({
        action: { type: 'category', slug: c.slug },
        primary: c.name,
        trailing: `${c.count} sp`,
      }),
    ),
  );
  add(
    'Sản phẩm',
    suggestion.products.map((p) =>
      option({
        action: { type: 'product', slug: p.slug },
        primary: p.name,
        secondary: p.categoryName,
        trailing: formatPrice(p.price),
        product: p,
      }),
    ),
  );
  return groups;
}
