import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ChangeProductContentDto } from './dto/change-product-content.dto.js';
import { adminContentChange, importedContent } from './product-content.js';

const original = {
  name: 'Áo',
  description: null,
  material: null,
  careInstructions: null,
  contentVersion: 0,
  adminContentFields: [] as string[],
};
describe('UC-04.2 product content rules', () => {
  it('UC-04.2/AC21 no-op khong tao bao ve hay increment', () => {
    expect(adminContentChange(original, original)).toBeNull();
  });
  it('UC-04.2/AC20 chi bao ve truong thay doi va giu bao ve cu ke ca null', () => {
    const result = adminContentChange(
      { ...original, material: 'Cotton', adminContentFields: ['name'] },
      { ...original, description: 'Mới' },
    );
    expect(result).toMatchObject({
      description: 'Mới',
      material: null,
      adminContentFields: ['name', 'description', 'material'],
      contentVersion: { increment: 1 },
    });
  });
  it('UC-04.2/AC22 nguon khong de noi dung bao ve, null van la gia tri; lap khong increment', () => {
    const before = { ...original, adminContentFields: ['name', 'description'] };
    const next = importedContent(before, {
      ...original,
      name: 'Nguồn',
      description: 'Nguồn',
      material: 'Linen',
    });
    expect(next).toEqual({
      name: 'Áo',
      description: null,
      material: 'Linen',
      careInstructions: null,
      contentVersion: { increment: 1 },
    });
    expect(
      importedContent({ ...before, ...next }, { ...original, name: 'Nguồn', material: 'Linen' }),
    ).not.toHaveProperty('contentVersion');
  });
  it('UC-04.2/AC20 DTO trim, trang thanh null va chap nhan dung bien gioi han', async () => {
    const dto = plainToInstance(ChangeProductContentDto, {
      name: '  Áo khoác  ',
      description: '   ',
      material: '  Linen  ',
      careInstructions: '',
      expectedVersion: 0,
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      name: 'Áo khoác',
      description: null,
      material: 'Linen',
      careInstructions: null,
      expectedVersion: 0,
    });
    const maxDto = plainToInstance(ChangeProductContentDto, {
      name: 'x'.repeat(200),
      description: 'x'.repeat(20000),
      material: 'x'.repeat(500),
      careInstructions: 'x'.repeat(5000),
      expectedVersion: 2147483646,
    });
    expect(await validate(maxDto)).toEqual([]);
  });
  it.each([
    { name: undefined },
    { description: undefined },
    { material: undefined },
    { careInstructions: undefined },
    { expectedVersion: undefined },
    { name: '' },
    { name: '   ' },
    { name: null },
    { name: 'x'.repeat(201) },
    { description: 'x'.repeat(20001) },
    { material: 'x'.repeat(501) },
    { careInstructions: 'x'.repeat(5001) },
    { name: 'Tên\0NUL' },
    { description: 'Mô tả\0NUL' },
    { material: 'Chất liệu\0NUL' },
    { careInstructions: 'Bảo quản\0NUL' },
    { expectedVersion: -1 },
    { expectedVersion: 0.5 },
    { expectedVersion: 2147483647 },
  ])('UC-04.2/AC19 DTO tu choi %j', async (override) => {
    const dto = plainToInstance(ChangeProductContentDto, {
      name: 'Áo',
      description: null,
      material: null,
      careInstructions: null,
      expectedVersion: 0,
      ...override,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
