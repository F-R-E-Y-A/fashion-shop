import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core';

import {
  authErrorMessage,
  readAuthNavigation,
  safeReturnLocation,
  validateEmail,
  validatePassword,
} from './auth-form.js';

describe('Auth validation and safe navigation', () => {
  it('retains the current backend policy rather than introducing a frontend-only migration', () => {
    expect(validatePassword('Abcdefg1')).toBeUndefined();
    expect(validatePassword('A1' + 'é'.repeat(40))).toBeUndefined();
    expect(validatePassword('twelveletters')).toBeDefined();
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/%2fevil.example',
    '/\\evil.example',
    '/%5cevil.example',
    '/%00evil',
    '/%',
    '/login',
    '/register?x=1',
    '/%6cogin',
    '/LOGIN?next=1#form',
    '/Register',
    '/login//',
    '/xac-thuc-email//?step=1#code',
    '/QUEN-MAT-KHAU///',
    '/DAT-LAI-MAT-KHAU/#reset',
    '/%52egister//',
    '/%78ac-thuc-email/',
    '/gio-hang/../LOGIN',
    '/%2e%2e/login',
    '/%5C%5Cevil.example',
    '/%0a/evil.example',
  ])('rejects unsafe or looping return location %s', (value) => {
    expect(safeReturnLocation(value)).toBeUndefined();
  });
  it('keeps a relative destination including query and fragment', () => {
    expect(safeReturnLocation('/tai-khoan/ho-so?tab=1#details')).toBe(
      '/tai-khoan/ho-so?tab=1#details',
    );
  });
  it.each([
    '/',
    '/gio-hang?source=auth#items',
    '/tai-khoan/ho-so',
    '/san-pham/ao%20khoac?color=ivory#size',
    '/san-pham/login',
  ])('preserves valid internal return path %s', (path) => {
    expect(safeReturnLocation(path)).toBe(path);
  });
  it.each([
    'customer@example.com',
    'customer+shop@example.com',
    ' Customer+Shop@Example.com ',
    'khách@example.com',
    'customer@xn--bcher-kva.de',
    '"customer,shop"@example.com',
  ])('accepts backend-compatible email %s', (email) => {
    expect(validateEmail(email)).toBeUndefined();
  });
  it.each([
    'a..b@example.com',
    'a,b@example.com',
    'a@-example.com',
    'a@example-.com',
    'a@',
    'a@example',
    'a@.com',
    'example.com',
    'a b@example.com',
  ])('rejects malformed email %s', (email) => {
    expect(validateEmail(email)).toBe('Email chưa đúng định dạng.');
  });
  it.each(['', '   '])('reports required email separately for %s', (email) => {
    expect(validateEmail(email)).toBe('Vui lòng nhập email.');
  });
  it.each([null, 'bad', { email: 123, from: {} }])(
    'ignores malformed navigation context %s',
    (state) => {
      expect(readAuthNavigation(state).email).toBe('');
      expect(readAuthNavigation(state).from).toBeUndefined();
    },
  );
  it('never displays raw exception text for unknown errors', () => {
    expect(authErrorMessage(new Error('secret detail'), 'An toàn')).toBe('An toàn');
    expect(
      authErrorMessage(
        new ApiError({
          statusCode: 400,
          code: 'UNKNOWN',
          message: 'secret detail',
          path: '',
          timestamp: '',
        }),
        'An toàn',
      ),
    ).toBe('An toàn');
  });
});
