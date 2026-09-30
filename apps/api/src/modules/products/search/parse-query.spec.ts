import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildDictionary } from './dictionary.js';
import { describeIntent, parseQuery, tokenize } from './parse-query.js';

interface GoldenCase {
  q: string;
  expect: Record<string, unknown>;
  why: string;
}

const golden = JSON.parse(
  readFileSync(new URL('./golden-queries.json', import.meta.url), 'utf8'),
) as { cases: GoldenCase[] };

const asSet = (value: unknown): string[] => [...(value as string[])].sort();

describe('parseQuery: bo cau mau golden-queries.json (UC-03.2)', () => {
  it.each(golden.cases)('UC-03.2/golden $q', ({ q, expect: want }) => {
    const intent = parseQuery(q);
    const described = describeIntent(intent);
    const groups = intent.groups.map((g) => `${g.kind}:${g.value}`);
    for (const [key, value] of Object.entries(want)) {
      const have =
        key === 'groups' ? groups : (described as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) expect(asSet(have), key).toEqual(asSet(value));
      else expect(have, key).toBe(value);
    }
  });

  it('bo cau mau co du 47 cau va giu 12 bay bo dau', () => {
    expect(golden.cases).toHaveLength(47);
    expect(golden.cases.filter((c) => c.why.startsWith('BAY')).length).toBeGreaterThanOrEqual(12);
  });
});

describe('parseQuery: chi tiet', () => {
  it('UC-03.2 chip mang vi tri tu de giao dien bo dung cac chu da sinh ra no', () => {
    const intent = parseQuery('polo nữ trắng dưới 100k');
    const chips = describeIntent(intent).chips;
    expect(chips.find((c) => c.kind === 'audience')).toMatchObject({ source: 'nữ', tokens: [1] });
    expect(chips.find((c) => c.kind === 'price')).toMatchObject({
      source: 'dưới 100k',
      tokens: [3, 4],
    });
  });

  it('UC-03.2 don vi nam trong tu khac khong bi coi la don vi (khong doc thuoc tinh cua Object)', () => {
    const intent = parseQuery('áo 200 constructor');
    expect(intent.chips.some((c) => c.kind === 'price')).toBe(false);
  });

  it('UC-03.2 cau rong hoac chi co dau cach khong sinh y nao', () => {
    for (const q of ['', '   ', '!!!']) {
      const intent = parseQuery(q);
      expect(intent.chips).toEqual([]);
      expect(intent.groups).toEqual([]);
    }
  });

  it('UC-03.2 tokenize giu nguyen van tung tu va bo dau cau o hai dau', () => {
    expect(tokenize('Áo, sơ mi!').map((t) => [t.raw, t.low])).toEqual([
      ['Áo,', 'áo'],
      ['sơ', 'sơ'],
      ['mi!', 'mi'],
    ]);
  });
});

describe('buildDictionary: dip mac mo rong tu search_configurations', () => {
  const extra = [
    {
      value: 'dam-cuoi',
      label: 'Dịp: đám cưới',
      triggers: ['đám cưới', 'ăn cưới'],
      terms: ['sơ mi', 'lụa'],
    },
  ];

  it('UC-03.2 tu dien mo rong: cau chua hieu truoc, hieu sau khi them dip', () => {
    const before = parseQuery('đồ đi đám cưới');
    expect(before.groups.map((g) => g.kind)).toContain('free');

    const dict = buildDictionary(extra);
    const after = parseQuery('đồ đi đám cưới', dict);
    expect(after.groups.map((g) => `${g.kind}:${g.value}`)).toEqual(['occasion:dam-cuoi']);
    expect(after.groups[0].terms).toEqual(['sơ mi', 'lụa']);
  });

  it('UC-03.2 muc sai hinh dang bi bo qua va tu dien trong ma van dung duoc', () => {
    const dict = buildDictionary([
      null,
      'x',
      { value: 'thieu-terms', label: 'x', triggers: ['x'] },
      { value: 'rong', label: 'x', triggers: [], terms: ['a'] },
      { value: 'so', label: 'x', triggers: [1], terms: ['a'] },
    ]);
    expect(dict).toEqual(buildDictionary());
    expect(parseQuery('polo nữ', dict).audience).toBe('nu');
  });

  it('UC-03.2 cum dai cua muc mo rong duoc xet truoc cum ngan', () => {
    const dict = buildDictionary([
      { value: 'di-lam-som', label: 'Dịp: đi làm sớm', triggers: ['đi làm sớm'], terms: ['polo'] },
    ]);
    const intent = parseQuery('đi làm sớm', dict);
    expect(intent.groups.map((g) => g.value)).toEqual(['di-lam-som']);
  });
});
