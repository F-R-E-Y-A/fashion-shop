/** Chu co dinh cua o tim kiem. Chep dung tu ban mau thiet ke (design/README.md muc 6). */

/** Sau 300 ms ngung go moi goi API (UC-03.2 buoc 4). */
export const SUGGEST_DELAY_MS = 300;
/** Do dai toi thieu cua cau de goi goi y; khop tham so `q` cua may chu. */
export const MIN_QUERY_LENGTH = 2;

/** Cau mau: hien khi o tim kiem con trong, va chay chu tren nut tim kiem o header. */
export const EXAMPLE_QUERIES = [
  'polo nữ trắng dưới 100k',
  'sơ mi trắng đi làm',
  'ao so mi nu tay dai',
  'đồ đi biển mát mẻ',
  'quần tây nữ ống rộng',
  'quà cho bạn trai',
] as const;

/** Nut tim kiem o header doi cau mau moi chu ky nay. */
export const HINT_ROTATE_MS = 3600;
