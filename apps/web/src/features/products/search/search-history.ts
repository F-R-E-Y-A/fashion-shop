const KEY = 'fs:recent-searches';
const MAX_ITEMS = 5;

/** Moi truy cap localStorage deu boc try/catch: trinh duyet co the chan hoac day bo nho. */
export function readRecentSearches(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

/** Ghi mot cau vua tim len dau danh sach, bo cau trung (khong phan biet hoa thuong), toi da 5 cau. */
export function rememberSearch(q: string): string[] {
  const text = q.trim();
  if (text.length < 2) return readRecentSearches();
  const next = [
    text,
    ...readRecentSearches().filter((item) => item.toLowerCase() !== text.toLowerCase()),
  ].slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Khong luu duoc thi bo qua: danh sach gan day chi la tien ich.
  }
  return next;
}
