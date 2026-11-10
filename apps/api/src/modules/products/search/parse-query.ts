import { DEFAULT_DICTIONARY, type DictEntry, isStopWord } from './dictionary.js';
import { ascii, hasAccent, lower } from './normalize-vi.js';
import { formatPrice } from './price-buckets.js';

/**
 * Hieu cau tim kiem tieng Viet: bien mot cau ("polo nữ trắng dưới 100k") thanh cac y co cau truc
 * (danh muc, doi tuong, mau, co, gia, dip mac) cong cac tu con lai. Ham thuan, khong doc DB.
 *
 * Thu tu xu ly co ly do: doc so truoc chu, vi "cỡ 32" la co quan con "cỡ 200k" la gia; cum dai xet
 * truoc cum ngan, vi "lưng thun" la kieu cap quan chu khong phai danh muc Ao thun.
 * Hanh vi duoc giu boi golden-queries.json.
 */

export type ChipKind =
  | 'price'
  | 'size'
  | 'audience'
  | 'color'
  | 'category'
  | 'sort'
  | 'style'
  | 'occasion'
  | 'term'
  | 'free';
export type GroupKind = 'style' | 'occasion' | 'term' | 'free';
export type IntentSort = 'newest' | 'price_asc' | 'price_desc';
export type IntentAudience = 'nam' | 'nu';

export interface TermGroup {
  kind: GroupKind;
  value: string;
  label: string;
  /** Khop mot tu trong nhom la du; cac nhom la VA. */
  terms: string[];
}

export interface IntentChip {
  kind: ChipKind;
  value: string;
  label: string;
  /** Vi tri cac tu (tach theo khoang trang) da sinh ra chip. */
  idx: number[];
  /** Nguyen van cac tu do, de giao dien noi "bo <source>". */
  source: string;
}

export interface SearchIntent {
  categorySlugs: string[];
  audience: IntentAudience | null;
  colorFamilies: string[];
  sizes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  sort: IntentSort | null;
  groups: TermGroup[];
  chips: IntentChip[];
  ignored: string[];
}

/** Hinh dang gui ra API (truong `interpretation`). */
export interface SearchInterpretation {
  categorySlugs: string[];
  audience: IntentAudience | null;
  colorFamilies: string[];
  sizes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  sort: IntentSort | null;
  termGroups: string[][];
  chips: Array<{
    kind: ChipKind;
    value: string;
    label: string;
    source: string;
    /** Giao dien goi removeTokens(q, tokens) de bo chip. */
    tokens: number[];
  }>;
  ignored: string[];
}

interface Token {
  raw: string;
  idx: number;
  low: string;
  asc: string;
  acc: boolean;
  used: boolean;
}

export function tokenize(q: string): Token[] {
  return String(q)
    .split(/\s+/)
    .filter(Boolean)
    .map((raw, idx) => {
      let clean = raw.normalize('NFC');
      if (!/^[<>~-]+$/.test(clean)) {
        clean = clean.replace(/^[^\p{L}\p{N}<>]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
      }
      return {
        raw,
        idx,
        low: lower(clean),
        asc: ascii(clean),
        acc: hasAccent(clean),
        used: clean === '',
      };
    });
}

function eq(t: Token | undefined, phrase: string): boolean {
  if (!t || t.used) return false;
  return t.acc ? t.low === lower(phrase) : t.asc === ascii(phrase);
}

function matchAt(toks: Token[], i: number, entry: DictEntry): boolean {
  if (i + entry.len > toks.length) return false;
  for (let k = 0; k < entry.len; k++) {
    const t = toks[i + k];
    if (t.used) return false;
    if (t.acc) {
      if (t.low !== entry.low[k]) return false;
    } else if (entry.accentOnly || t.asc !== entry.asc[k]) {
      return false;
    }
  }
  return true;
}

interface PhraseHit {
  phrase: string;
  start: number;
  len: number;
}

function phraseBefore(toks: Token[], i: number, phrases: string[]): PhraseHit | null {
  const sorted = [...phrases].sort((a, b) => b.split(' ').length - a.split(' ').length);
  for (const phrase of sorted) {
    const parts = phrase.split(' ');
    const start = i - parts.length;
    if (start < 0) continue;
    if (parts.every((part, k) => eq(toks[start + k], part))) {
      return { phrase, start, len: parts.length };
    }
  }
  return null;
}

// ---------------------------------------------------------------- gia

const UNIT: Record<string, number> = {
  k: 1e3,
  nghin: 1e3,
  ngan: 1e3,
  tr: 1e6,
  trieu: 1e6,
  d: 1,
  dong: 1,
  vnd: 1,
};
const NUM_RE = /^(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)(k|nghin|ngan|tr|trieu|d|dong|vnd)?$/;
const RANGE_RE = /^(\d+(?:[.,]\d+)?)(k|tr)?[-–~](\d+(?:[.,]\d+)?)(k|nghin|ngan|tr|trieu)?$/;
const Q_MAX = [
  'dưới',
  'tối đa',
  'không quá',
  'max',
  'ít hơn',
  'rẻ hơn',
  'nhỏ hơn',
  'bé hơn',
  'chưa tới',
  'chưa đến',
  '<',
];
const Q_MIN = ['trên', 'hơn', 'ít nhất', 'tối thiểu', 'min', 'lớn hơn', 'từ', '>'];
const Q_APPROX = ['tầm', 'khoảng', 'chừng', 'cỡ', 'giá', 'quanh', 'tầm giá', 'khoảng giá'];
const CONNECTORS = ['đến', 'tới', '-', '~', '->'];

const isUnit = (key: string): boolean => Object.hasOwn(UNIT, key);
const toNumber = (s: string): number =>
  /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : parseFloat(s.replace(',', '.'));
const toVnd = (n: number, unit: string | null): number =>
  unit ? Math.round(n * UNIT[unit]) : n < 1000 ? Math.round(n * 1000) : Math.round(n);
const round1k = (n: number): number => Math.round(n / 1000) * 1000;

interface NumberRead {
  n: number;
  unit: string | null;
  end: number;
  inline: 'max' | 'min' | null;
}

function readNumber(toks: Token[], i: number): NumberRead | null {
  const t = toks[i];
  if (!t || t.used) return null;
  const inline = t.asc[0] === '<' ? 'max' : t.asc[0] === '>' ? 'min' : null;
  const m = (inline ? t.asc.slice(1) : t.asc).match(NUM_RE);
  if (!m) return null;
  let unit: string | null = m[2] || null;
  let end = i;
  const next = toks[i + 1];
  if (!unit && next && !next.used && isUnit(next.asc)) {
    unit = next.asc;
    end = i + 1;
  }
  return { n: toNumber(m[1]), unit, end, inline };
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, k) => from + k);

// ---------------------------------------------------------------- hieu truy van

export function parseQuery(
  q: string,
  dict: readonly DictEntry[] = DEFAULT_DICTIONARY,
): SearchIntent {
  const toks = tokenize(q);
  const intent: SearchIntent = {
    categorySlugs: [],
    audience: null,
    colorFamilies: [],
    sizes: [],
    minPrice: null,
    maxPrice: null,
    sort: null,
    groups: [],
    chips: [],
    ignored: [],
  };
  const use = (idx: number[]): void => idx.forEach((k) => (toks[k].used = true));
  const chip = (kind: ChipKind, value: string, label: string, idx: number[]): void => {
    use(idx);
    const found = intent.chips.find((c) => c.kind === kind && c.value === value);
    if (found) found.idx.push(...idx);
    else intent.chips.push({ kind, value, label, idx: [...idx], source: '' });
  };

  // 1. Gia truoc, vi "rẻ hơn 200k" va "cỡ 200k" can tu dung truoc con so.
  const setPrice = (min: number | null, max: number | null, label: string, idx: number[]): void => {
    intent.minPrice = min;
    intent.maxPrice = max;
    chip('price', `${min ?? ''}-${max ?? ''}`, label, idx);
  };
  const rangeLabel = (a: number, b: number): string =>
    `${formatPrice(Math.min(a, b))} – ${formatPrice(Math.max(a, b))}`;

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.used) continue;
    const r2 = t.asc.match(RANGE_RE);
    if (r2) {
      const u2 = r2[4] || r2[2] || null;
      const a = toVnd(toNumber(r2[1]), r2[2] || u2);
      const b = toVnd(toNumber(r2[3]), u2);
      const idx = [i];
      const before = phraseBefore(toks, i, ['từ', 'giá', 'tầm', 'khoảng']);
      if (before) idx.unshift(...range(before.start, i - 1));
      setPrice(Math.min(a, b), Math.max(a, b), rangeLabel(a, b), idx);
      continue;
    }
    const n1 = readNumber(toks, i);
    if (!n1) continue;
    const idx = range(i, n1.end);
    const conn = toks[n1.end + 1];
    if (!n1.inline && conn && CONNECTORS.some((w) => eq(conn, w))) {
      const n2 = readNumber(toks, n1.end + 2);
      if (n2) {
        const a = toVnd(n1.n, n1.unit || n2.unit);
        const b = toVnd(n2.n, n2.unit || n1.unit);
        const all = range(i, n2.end);
        const before = phraseBefore(toks, i, ['từ', 'giá từ', 'trong khoảng', 'khoảng', 'tầm']);
        if (before) all.unshift(...range(before.start, i - 1));
        setPrice(Math.min(a, b), Math.max(a, b), rangeLabel(a, b), all);
        i = n2.end;
        continue;
      }
    }
    let kind: 'max' | 'min' | 'approx' | null = n1.inline;
    if (!kind) {
      const qMax = phraseBefore(toks, i, Q_MAX);
      const qMin = qMax ? null : phraseBefore(toks, i, Q_MIN);
      const qApprox = qMax || qMin ? null : phraseBefore(toks, i, Q_APPROX);
      // "cỡ 32" la co quan, khong phai gia; chi coi "cỡ" la gia khi so co don vi ("cỡ 200k").
      const approx = qApprox && !(qApprox.phrase === 'cỡ' && !n1.unit) ? qApprox : null;
      const hit = qMax || qMin || approx;
      if (hit) {
        kind = hit === qMax ? 'max' : hit === qMin ? 'min' : 'approx';
        idx.unshift(...range(hit.start, i - 1));
      }
    }
    const a1 = toks[n1.end + 1];
    const a2 = toks[n1.end + 2];
    if (eq(a1, 'trở') && eq(a2, 'lên')) {
      kind = 'min';
      idx.push(n1.end + 1, n1.end + 2);
    } else if ((eq(a1, 'trở') && eq(a2, 'xuống')) || (eq(a1, 'đổ') && eq(a2, 'lại'))) {
      kind = 'max';
      idx.push(n1.end + 1, n1.end + 2);
    }
    if (!kind && !n1.unit) continue; // so tran khong don vi, khong tu chi gia: de buoc co xu ly
    kind = kind || 'approx';
    const v = toVnd(n1.n, n1.unit);
    if (kind === 'max') setPrice(null, v, `Dưới ${formatPrice(v)}`, idx);
    else if (kind === 'min') setPrice(v, null, `Từ ${formatPrice(v)}`, idx);
    else setPrice(round1k(v * 0.7), round1k(v * 1.3), `Khoảng ${formatPrice(v)}`, idx);
    i = n1.end;
  }

  // 2. Co.
  const SIZE_RE = /^(xxs|xs|s|m|l|xl|xxl|2xl|3xl|\d{2})$/;
  const addSize = (code: string, idx: number[]): void => {
    const c = code.toUpperCase() === '2XL' ? 'XXL' : code.toUpperCase();
    if (!intent.sizes.includes(c)) intent.sizes.push(c);
    chip('size', c, `Cỡ ${c}`, idx);
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.used) continue;
    const next = toks[i + 1];
    if (
      ['size', 'cỡ', 'sz', 'số'].some((w) => eq(t, w)) &&
      next &&
      !next.used &&
      SIZE_RE.test(next.asc)
    ) {
      addSize(next.asc, [i, i + 1]);
      i++;
    } else if (/^(xxs|xs|xl|xxl|2xl|3xl)$/.test(t.asc)) {
      addSize(t.asc, [i]);
    } else if (/^(S|M|L)$/.test(t.raw)) {
      addSize(t.raw, [i]);
    }
  }

  // 3. Cum tu tu dien, dai truoc ngan sau tai moi vi tri.
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].used) continue;
    const entry = dict.find((e) => matchAt(toks, i, e));
    if (!entry) continue;
    const idx = range(i, i + entry.len - 1);
    i += entry.len - 1;
    switch (entry.dim) {
      case 'stop':
        use(idx);
        break;
      case 'audience': {
        const value = entry.value as IntentAudience;
        intent.audience = intent.audience && intent.audience !== value ? null : value;
        chip('audience', entry.value, entry.label, idx);
        break;
      }
      case 'color':
        if (!intent.colorFamilies.includes(entry.value)) intent.colorFamilies.push(entry.value);
        chip('color', entry.value, entry.label, idx);
        break;
      case 'category':
        if (!intent.categorySlugs.includes(entry.value)) intent.categorySlugs.push(entry.value);
        chip('category', entry.value, entry.label, idx);
        break;
      case 'sort':
        intent.sort = entry.value as IntentSort;
        chip('sort', entry.value, entry.label, idx);
        break;
      default: {
        // style, occasion, term
        const kind = entry.dim as GroupKind;
        if (!intent.groups.some((g) => g.kind === kind && g.value === entry.value)) {
          intent.groups.push({
            kind,
            value: entry.value,
            label: entry.label,
            terms: entry.terms ?? [],
          });
        }
        chip(kind, entry.value, entry.label, idx);
      }
    }
  }

  // 4. Tu dung, 5. tu tu do.
  for (const t of toks) {
    if (t.used) continue;
    if (isStopWord(t.acc, t.low, t.asc)) {
      t.used = true;
      continue;
    }
    const term = t.acc ? t.low : t.asc;
    if (t.acc ? term.length >= 2 : term.length >= 3) {
      if (!intent.groups.some((g) => g.kind === 'free' && g.value === term)) {
        intent.groups.push({ kind: 'free', value: term, label: `“${term}”`, terms: [term] });
      }
      chip('free', term, `“${t.raw.replace(/[^\p{L}\p{N}]+$/u, '')}”`, [t.idx]);
    } else {
      intent.ignored.push(t.raw);
      t.used = true;
    }
  }

  for (const c of intent.chips) {
    c.idx.sort((a, b) => a - b);
    c.source = c.idx.map((k) => toks[k].raw).join(' ');
  }
  return intent;
}

export function describeIntent(intent: SearchIntent): SearchInterpretation {
  return {
    categorySlugs: intent.categorySlugs,
    audience: intent.audience,
    colorFamilies: intent.colorFamilies,
    sizes: intent.sizes,
    minPrice: intent.minPrice,
    maxPrice: intent.maxPrice,
    sort: intent.sort,
    termGroups: intent.groups.map((g) => g.terms),
    chips: intent.chips.map((c) => ({
      kind: c.kind,
      value: c.value,
      label: c.label,
      source: c.source,
      tokens: c.idx,
    })),
    ignored: intent.ignored,
  };
}
