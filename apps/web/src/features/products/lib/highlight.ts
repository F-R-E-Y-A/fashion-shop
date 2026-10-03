const MARKS = /\p{M}/gu;

/** Chu thuong, bo dau, dong thoi doi "đ" thanh "d": dang de so khop khong dau. */
const fold = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(MARKS, '').replace(/đ/g, 'd');

/** Chu thuong nhung giu dau: dang de so khop khi khach go co dau. */
const lower = (text: string): string => text.toLowerCase();

const hasAccent = (term: string): boolean => fold(term) !== lower(term);

/** Chuoi da doi dang (them mot dau cach o dau de khop dau tu) kem vi tri trong chuoi goc. */
function project(name: string, map: (ch: string) => string) {
  let text = ' ';
  const origin: number[] = [-1];
  for (let i = 0; i < name.length; i++) {
    for (const ch of map(name.charAt(i))) {
      text += ch;
      origin.push(i);
    }
  }
  return { text, origin };
}

/**
 * Vi tri can to sang trong ten san pham, dang [dau, cuoi) theo ky tu cua ten goc.
 * Chi khop dau tu. Go co dau thi so voi ten co dau; go khong dau thi so voi ten bo dau,
 * cung luat voi bo hieu truy van ben may chu.
 */
export function highlightRanges(name: string, terms: readonly string[]): Array<[number, number]> {
  const accented = project(name, lower);
  const plain = project(name, fold);
  const found: Array<[number, number]> = [];
  for (const term of terms) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    const useAccent = hasAccent(trimmed);
    const { text, origin } = useAccent ? accented : plain;
    const needle = ` ${useAccent ? lower(trimmed) : fold(trimmed)}`;
    for (
      let from = text.indexOf(needle);
      from >= 0;
      from = text.indexOf(needle, from + needle.length)
    ) {
      const first = origin[from + 1];
      const last = origin[from + needle.length - 1];
      if (first !== undefined && last !== undefined) found.push([first, last + 1]);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of found) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

/** Tach ten thanh cac doan de dung <mark>: [{ text, marked }]. */
export function splitByRanges(
  name: string,
  ranges: ReadonlyArray<readonly [number, number]>,
): Array<{ text: string; marked: boolean }> {
  const parts: Array<{ text: string; marked: boolean }> = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push({ text: name.slice(at, start), marked: false });
    parts.push({ text: name.slice(start, end), marked: true });
    at = end;
  }
  if (at < name.length) parts.push({ text: name.slice(at), marked: false });
  return parts;
}
