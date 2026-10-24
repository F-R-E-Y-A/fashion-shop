import { describe, expect, it } from 'vitest';

import { newOrderCode } from './orders.service.js';

describe('newOrderCode', () => {
  it('FR + ngay theo gio VN + 8 ky tu base32 khong nham lan', () => {
    // 2026-10-19T18:30Z la 01:30 ngay 20/10 o Viet Nam.
    const code = newOrderCode(new Date('2026-10-19T18:30:00Z'));
    expect(code).toMatch(/^FR261020[0-9A-HJKMNP-TV-Z]{8}$/u);
  });

  it('khong lap trong mot loat lon', () => {
    const codes = new Set(Array.from({ length: 5000 }, () => newOrderCode()));
    expect(codes.size).toBe(5000);
  });
});
