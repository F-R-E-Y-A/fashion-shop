import { describe, expect, it } from 'vitest';

import { calcSubtotal, calcTotal } from './cart.service.js';

describe('calcSubtotal', () => {
  it('tinh dung tich gia * so luong', () => {
    expect(calcSubtotal('299000', 3)).toBe('897000.00');
  });

  it('xu ly gia thap phan', () => {
    expect(calcSubtotal('99999.99', 2)).toBe('199999.98');
  });
});

describe('calcTotal', () => {
  it('cong don dung nhieu dong', () => {
    const items = [
      { price: '299000', quantity: 2 },
      { price: '150000', quantity: 1 },
    ];
    expect(calcTotal(items)).toBe('748000.00');
  });

  it('gio trong tra 0', () => {
    expect(calcTotal([])).toBe('0.00');
  });

  it('mot dong so luong lon', () => {
    expect(calcTotal([{ price: '100000', quantity: 10 }])).toBe('1000000.00');
  });

  it('khong bi mat do chinh xac voi so thap phan nho', () => {
    // 0.1 + 0.2 = 0.3 (khong phai 0.30000000000000004 nhu Float)
    const items = [
      { price: '0.10', quantity: 1 },
      { price: '0.20', quantity: 1 },
    ];
    expect(calcTotal(items)).toBe('0.30');
  });
});
