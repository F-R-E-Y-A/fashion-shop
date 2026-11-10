import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Luat kiem tra dung chung cho ho so va so dia chi, de hai noi khong lech nhau.
 *
 * - Chuoi deu duoc trim TRUOC khi kiem: "  " thanh "" va bi tu choi, khong luu khoang trang thua.
 * - Ky tu dieu khien (xuong dong, tab, NUL...) bi tu choi: khong ai go chung vao ten hay dia chi, va
 *   chung lam hong nhan in van don.
 * - So dien thoai theo dac ta PH-01.5 (uc-ph01-tai-khoan-xac-thuc.md): 10 chu so, bat dau bang 0. Chua
 *   nhan dang +84 hay dau cach giua cac so; giao dien tu chuan hoa truoc khi gui (ADR-023).
 */
const trim = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const NO_CONTROL_CHARS = /^[^\p{Cc}]*$/u;

export const PHONE_PATTERN = /^0\d{9}$/;
export const PERSON_NAME_MAX = 100;
export const DETAIL_ADDRESS_MAX = 255;
export const POSTAL_CODE_PATTERN = /^[A-Za-z0-9 -]{1,10}$/;

function textField(field: string, max: number) {
  return applyDecorators(
    trim,
    IsString({ message: `${field} phai la chuoi` }),
    MinLength(1, { message: `${field} khong duoc de trong` }),
    MaxLength(max, { message: `${field} toi da ${max} ky tu` }),
    Matches(NO_CONTROL_CHARS, { message: `${field} chua ky tu khong hop le` }),
  );
}

export const IsPersonName = (field: string) => textField(field, PERSON_NAME_MAX);

export const IsDetailAddress = (field: string) => textField(field, DETAIL_ADDRESS_MAX);

export const IsPhoneNumber = (field: string) =>
  applyDecorators(
    trim,
    IsString({ message: `${field} phai la chuoi` }),
    Matches(PHONE_PATTERN, { message: `${field} phai gom 10 chu so va bat dau bang 0` }),
  );

export const IsPostalCode = (field: string) =>
  applyDecorators(
    trim,
    IsString({ message: `${field} phai la chuoi` }),
    Matches(POSTAL_CODE_PATTERN, {
      message: `${field} toi da 10 ky tu gom chu, so, dau cach hoac gach ngang`,
    }),
  );
