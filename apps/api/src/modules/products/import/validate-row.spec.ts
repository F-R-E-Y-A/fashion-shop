import { describe, expect, it } from 'vitest';

import type { ImportProductRow } from './import.types.js';
import { validateRow } from './validate-row.js';

const row = (variants: ImportProductRow['variants']): ImportProductRow => ({
  sourceKey: 'test:1',
  name: 'Áo thử',
  categorySlug: 'ao-thun',
  images: [],
  variants,
});

const one = { sku: 'TEST-1', listPrice: '100000' };

describe('validateRow', () => {
  it('NO_VARIANT khi mảng rỗng', () => {
    expect(validateRow(row([]))?.reason).toBe('NO_VARIANT');
  });

  it.each([
    { listPrice: '0' },
    { listPrice: 'abc' },
    { listPrice: '100000', salePrice: '100000' },
    { listPrice: '100000', salePrice: '-1' },
  ])('INVALID_PRICE với %j', (price) => {
    expect(validateRow(row([{ ...one, ...price }]))?.reason).toBe('INVALID_PRICE');
  });

  it('hai biến thể bỏ trống màu/cỡ là trùng sau khi mặc định hóa', () => {
    expect(validateRow(row([one, { ...one, sku: 'TEST-2' }]))?.reason).toBe('DUPLICATE_COLOR_SIZE');
  });

  it('cùng SKU cho hai cặp màu/cỡ phải bị từ chối', () => {
    expect(validateRow(row([one, { ...one, sizeCode: 'M' }]))?.reason).toBe('SKU_CONFLICT');
  });

  it('giá hợp lệ và hai cỡ khác nhau thì qua', () => {
    expect(validateRow(row([one, { ...one, sku: 'TEST-2', sizeCode: 'M' }]))).toBeNull();
  });
});
