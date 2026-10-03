import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateAddressRequest, UpdateAddressRequest } from './address.dto.js';
import { UpdateProfileRequest } from './profile.dto.js';

async function errorsOf<T extends object>(type: new () => T, body: object) {
  const instance = plainToInstance(type, body);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, fields: errors.map((error) => error.property) };
}

describe('luat kiem ho ten, so dien thoai, dia chi (ADR-023)', () => {
  it('ho ten: trim roi moi kiem; rong, qua 100 ky tu, co ky tu dieu khien thi sai', async () => {
    const ok = await errorsOf(UpdateProfileRequest, { fullName: '  Nguyễn Văn An ' });
    expect(ok.fields).toEqual([]);
    expect(ok.instance.fullName).toBe('Nguyễn Văn An');

    for (const fullName of ['   ', 'a'.repeat(101), 'A\tB', 'A\u0000B']) {
      expect((await errorsOf(UpdateProfileRequest, { fullName })).fields).toEqual(['fullName']);
    }
    expect((await errorsOf(UpdateProfileRequest, { fullName: 'a'.repeat(100) })).fields).toEqual(
      [],
    );
  });

  it('so dien thoai: dung 10 chu so bat dau bang 0', async () => {
    for (const phone of ['0901234567', ' 0901234567 ']) {
      expect((await errorsOf(UpdateProfileRequest, { phone })).fields).toEqual([]);
    }
    for (const phone of [
      '901234567',
      '09012345678',
      '1901234567',
      '+84901234567',
      '0901-234-567',
    ]) {
      expect((await errorsOf(UpdateProfileRequest, { phone })).fields).toEqual(['phone']);
    }
  });

  it('PATCH: vang mat thi bo qua, null thi tu choi; rieng postalCode null la xoa', async () => {
    expect((await errorsOf(UpdateProfileRequest, {})).fields).toEqual([]);
    expect((await errorsOf(UpdateProfileRequest, { fullName: null, phone: null })).fields).toEqual([
      'fullName',
      'phone',
    ]);
    expect((await errorsOf(UpdateAddressRequest, { postalCode: null })).fields).toEqual([]);
    expect((await errorsOf(UpdateAddressRequest, { isDefault: null })).fields).toEqual([
      'isDefault',
    ]);
  });

  it('tao dia chi: du truong bat buoc; isDefault phai la boolean that', async () => {
    const valid = {
      recipientName: 'Người Nhận',
      phone: '0901234567',
      administrativeAreaId: '00000000-0000-4000-8000-000000000001',
      detailAddress: '12 Nguyễn Huệ',
    };
    expect((await errorsOf(CreateAddressRequest, valid)).fields).toEqual([]);
    expect((await errorsOf(CreateAddressRequest, {})).fields.sort()).toEqual([
      'administrativeAreaId',
      'detailAddress',
      'phone',
      'recipientName',
    ]);
    expect((await errorsOf(CreateAddressRequest, { ...valid, isDefault: 'true' })).fields).toEqual([
      'isDefault',
    ]);
  });
});
