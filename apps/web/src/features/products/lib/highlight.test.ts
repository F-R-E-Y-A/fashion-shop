import { describe, expect, it } from 'vitest';

import { highlightRanges, splitByRanges } from './highlight.js';

const marked = (name: string, terms: string[]) =>
  splitByRanges(name, highlightRanges(name, terms))
    .filter((p) => p.marked)
    .map((p) => p.text);

describe('highlightRanges (UC-03.2)', () => {
  it('go khong dau van to dung chu co dau trong ten', () => {
    expect(marked('Áo Polo Nữ Coolmax', ['polo', 'nu'])).toEqual(['Polo', 'Nữ']);
  });

  it('go co dau chi khop ten co dau: "mát" khong to nham "mắt"', () => {
    expect(marked('Áo Pique Mắt Chim Mát', ['mát'])).toEqual(['Mát']);
  });

  it('chi khop dau tu, khong khop giua tu', () => {
    expect(marked('Áo Thun Cotton', ['on'])).toEqual([]);
    expect(marked('Áo Thun Cotton', ['cot'])).toEqual(['Cot']);
  });

  it('cum nhieu tu va cac khoang chong nhau duoc gop lai', () => {
    expect(marked('Áo Sơ Mi Nữ', ['so mi', 'mi nu'])).toEqual(['Sơ Mi Nữ']);
  });

  it('"đ" tinh la "d" khi go khong dau', () => {
    expect(marked('Đầm Đen', ['dam'])).toEqual(['Đầm']);
  });

  it('khong co term thi khong to gi; splitByRanges giu nguyen ten', () => {
    expect(highlightRanges('Áo Thun', [])).toEqual([]);
    const parts = splitByRanges('Áo Thun', []);
    expect(parts).toEqual([{ text: 'Áo Thun', marked: false }]);
  });
});
