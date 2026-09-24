/** Dinh dang hien thi dung chung. Khong biet nghiep vu, khong goi API. */

/** Gia tu may chu la CHUOI (Decimal), doi sang dinh dang tien Viet Nam. */
export const formatPrice = (value: string): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value));

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
