/** Ten cua hang hien tren header, chan trang va tieu de trang. Doi ten la viec cua ca nhom, ngoai PH-01. */
export const STORE_NAME = 'THỜI TRANG';

/** Tieu de trang theo ten cua hang: "Ao · THỜI TRANG". */
export const pageTitle = (title?: string): string =>
  title ? `${title} · ${STORE_NAME}` : STORE_NAME;
