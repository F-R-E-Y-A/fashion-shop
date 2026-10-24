import { describe, expect, it } from 'vitest';

import { parseStockCsv } from './stock-count.js';

describe('parseStockCsv', () => {
  it('bỏ tiêu đề, dòng trống, chú thích; nhận CRLF', () => {
    expect(parseStockCsv('# kiem ke 19/10\r\nsku,quantity\r\nA-1, 5\r\n\r\nB-2,0\r\n')).toEqual({
      counts: [
        { sku: 'A-1', quantity: 5 },
        { sku: 'B-2', quantity: 0 },
      ],
      errors: [],
    });
  });

  it('báo lỗi theo số dòng: số âm/thập phân, thiếu cột, SKU lặp', () => {
    const { errors } = parseStockCsv('A,-1\nB,1.5\nC\nD,1,2\nE,2\nE,3');
    expect(errors).toEqual([
      'Dong 1: quantity phai la so nguyen 0..1000000.',
      'Dong 2: quantity phai la so nguyen 0..1000000.',
      'Dong 3: quantity phai la so nguyen 0..1000000.',
      'Dong 4: can dung hai cot sku,quantity.',
      'Dong 6: SKU E bi lap.',
    ]);
  });
});
