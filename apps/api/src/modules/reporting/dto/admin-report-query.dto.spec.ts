import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AdminReportQueryDto } from './admin-report-query.dto.js';

describe('AdminReportQueryDto (Issue #108)', () => {
  async function parseQuery(query: Record<string, unknown>) {
    const instance = plainToInstance(AdminReportQueryDto, query);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { instance, errors };
  }

  it('chap nhan query hop le va gan gia tri mac dinh cho top', async () => {
    const { instance, errors } = await parseQuery({
      from: '2026-10-14',
      to: '2026-11-12',
    });
    expect(errors).toHaveLength(0);
    expect(instance.from).toBe('2026-10-14');
    expect(instance.to).toBe('2026-11-12');
    expect(instance.top).toBe(10);
  });

  it('chap nhan cac gia tri top hop le 5, 10, 20', async () => {
    for (const val of [5, 10, 20]) {
      const { errors, instance } = await parseQuery({ top: val });
      expect(errors).toHaveLength(0);
      expect(instance.top).toBe(val);
    }
  });

  it('tu choi ngay lich khong ton tai (2026-02-31)', async () => {
    const { errors } = await parseQuery({
      from: '2026-02-31',
      to: '2026-03-05',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'from')).toBe(true);
  });

  it('tu choi dinh dang ngay khong phai YYYY-MM-DD', async () => {
    const { errors } = await parseQuery({
      from: '14-10-2026',
      to: '2026/11/12',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('tu choi khi from lon hon to (from > to)', async () => {
    const { errors } = await parseQuery({
      from: '2026-11-15',
      to: '2026-11-12',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'from')).toBe(true);
  });

  it('tu choi khoang cach ngay vuot qua 366 ngay', async () => {
    const { errors } = await parseQuery({
      from: '2025-01-01',
      to: '2026-01-05',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('tu choi top khong thuoc [5, 10, 20]', async () => {
    const { errors } = await parseQuery({ top: 15 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'top')).toBe(true);
  });

  it('tu choi exponent lexical top nhu 1e1', async () => {
    const { errors } = await parseQuery({ top: '1e1' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'top')).toBe(true);
  });

  it('tu choi khi chi truyen from cach ngay hien tai qua 366 ngay', async () => {
    const { errors } = await parseQuery({ from: '2000-01-01' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('tu choi 367 ngay bao gom ca 2 dau (2025-01-01 den 2026-01-02)', async () => {
    const { errors } = await parseQuery({
      from: '2025-01-01',
      to: '2026-01-02',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('chap nhan dung 366 ngay bao gom ca 2 dau (2025-01-01 den 2026-01-01)', async () => {
    const { errors } = await parseQuery({
      from: '2025-01-01',
      to: '2026-01-01',
    });
    expect(errors).toHaveLength(0);
  });

  it('tu choi cac truong la khong nam trong allowlist', async () => {
    const { errors } = await parseQuery({
      from: '2026-10-14',
      to: '2026-11-12',
      extraField: 'injection',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'extraField')).toBe(true);
  });
});
