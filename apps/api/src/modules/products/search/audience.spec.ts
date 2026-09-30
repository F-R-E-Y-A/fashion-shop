import { describe, expect, it } from 'vitest';

import { audienceFrom } from './audience.js';

const withSlug = (slug: unknown) => ({ originalValues: { category: { slug } } });

describe('audienceFrom', () => {
  it('UC-03.3 slug danh muc nguon ket thuc -nu thi la nu', () => {
    expect(audienceFrom(withSlug('ao-polo-nu'), 'Áo Polo')).toBe('nu');
  });

  it('UC-03.3 slug danh muc nguon ket thuc -nam thi la nam', () => {
    expect(audienceFrom(withSlug('quan-jeans-nam'), 'Quần Jeans')).toBe('nam');
  });

  it('UC-03.3 slug thang ten: slug la nguon chinh', () => {
    expect(audienceFrom(withSlug('ao-so-mi-nu'), 'Áo Sơ Mi Nam')).toBe('nu');
  });

  it('UC-03.3 khong co slug thi tim trong ten theo nguyen tu', () => {
    expect(audienceFrom(null, 'Áo thun Nữ cổ tròn')).toBe('nu');
    expect(audienceFrom({}, 'Quần short Nam lưng thun')).toBe('nam');
    expect(audienceFrom(undefined, 'Áo khoác unisex')).toBe('unisex');
    expect(audienceFrom(undefined, 'Áo phông nam nữ')).toBe('unisex');
  });

  it('UC-03.3 khong ket luan duoc thi null', () => {
    expect(audienceFrom(null, 'Thắt lưng da bò')).toBeNull();
    expect(audienceFrom(withSlug('phu-kien'), 'Mũ lưỡi trai')).toBeNull();
  });

  it('UC-03.3 "nam" nam trong tu khac khong bi nhan nham', () => {
    expect(audienceFrom(null, 'Áo Namu')).toBeNull();
    expect(audienceFrom(null, 'Băng đô Nữa')).toBeNull();
  });

  it('UC-03.3 attributes sai hinh dang khong nem loi', () => {
    for (const attributes of [
      'chuoi',
      42,
      [],
      { originalValues: 'x' },
      { originalValues: { category: 5 } },
      withSlug(7),
    ]) {
      expect(audienceFrom(attributes, 'Áo')).toBeNull();
    }
  });
});
