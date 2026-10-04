/** Ten cua hang hien tren header, chan trang va tieu de trang. Doi ten la viec cua ca nhom, ngoai PH-01. */
export const STORE_NAME = 'THỜI TRANG';

/** Khau hieu ngay duoi ten cua hang o chan trang. Header va footer cung doc tu day de khong lech nhau. */
export const STORE_TAGLINE = 'Phong cách là tự do.';

/** Tieu de trang theo ten cua hang: "Ao · THỜI TRANG". */
export const pageTitle = (title?: string): string =>
  title ? `${title} · ${STORE_NAME}` : STORE_NAME;
