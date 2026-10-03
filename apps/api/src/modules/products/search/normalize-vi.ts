/**
 * Chuan hoa chu tieng Viet cho tim kiem. Ham thuan, khong doc DB.
 * Bo dau bang NFD roi xoa dau; rieng chu "d" gach ngang khong tach duoc nen doi tay.
 * Moi chu tieng Viet dang NFC thanh dung mot chu ASCII, nen vi tri ky tu giu nguyen.
 */
export const lower = (s: string): string => String(s).normalize('NFC').toLowerCase();

export const ascii = (s: string): string =>
  lower(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Chuoi co dau khi ban chu thuong khac ban khong dau. */
export const hasAccent = (s: string): boolean => lower(s) !== ascii(s);
