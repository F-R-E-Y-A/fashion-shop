/**
 * Trang lon nhat nhan tu URL. Lon hon nua thi offset vuot xa so tai khoan co the co va tien toi
 * gioi han so nguyen an toan cua JS, nen coi nhu URL sai.
 */
export const MAX_PAGE_PARAM = 100_000;

/** `null` la khong co tham so (trang 1); `undefined` la tham so sai, phai chuan hoa ve trang 1. */
export function parsePageParam(raw: string | null): number | null | undefined {
  if (raw === null) return null;
  if (!/^[1-9]\d{0,5}$/u.test(raw)) return undefined;
  const page = Number(raw);
  return page <= MAX_PAGE_PARAM ? page : undefined;
}

export const usersListPath = (page: number): string =>
  page > 1 ? `/admin/users?page=${page}` : '/admin/users';

/** Ngu canh quay lai danh sach chi nhan `?page=N` hop le, khong mang chuoi la tu history state. */
export function readListReturn(state: unknown): string {
  const search =
    state && typeof state === 'object' ? (state as Record<string, unknown>).listSearch : undefined;
  if (typeof search !== 'string') return usersListPath(1);
  const page = parsePageParam(new URLSearchParams(search).get('page'));
  return usersListPath(page ?? 1);
}
