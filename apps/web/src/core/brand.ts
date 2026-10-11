/** Ten cua hang hien tren header, chan trang va tieu de trang. Bo nhan dien F.R.E.Y.A. chot 04/10 (work/branding/freya-brand-kit-v1). */
export const STORE_NAME = 'F.R.E.Y.A.';

/** Khau hieu ngay duoi ten cua hang o chan trang. Header va footer cung doc tu day de khong lech nhau. */
export const STORE_TAGLINE = 'Kiêu hãnh qua sự hiện diện.';

/** Tieu de trang theo ten cua hang: "Ao · F.R.E.Y.A.". */
export const pageTitle = (title?: string): string =>
  title ? `${title} · ${STORE_NAME}` : STORE_NAME;
