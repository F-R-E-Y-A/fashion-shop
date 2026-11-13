import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateVoucherDto } from './dto/update-voucher.dto.js';
import { toIsoString } from './voucher-concurrency.js';

describe('Voucher Concurrency & DTO Validation (UC-10.2)', () => {
  describe('IsStrictIsoDateString validator on UpdateVoucherDto.expectedUpdatedAt', () => {
    it('chấp nhận chuỗi ISO 8601 UTC có mili-giây kết thúc bằng Z', async () => {
      const dto = new UpdateVoucherDto();
      dto.expectedUpdatedAt = '2026-11-11T08:00:00.000Z';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('từ chối chuỗi thiếu mili-giây', async () => {
      const dto = new UpdateVoucherDto();
      dto.expectedUpdatedAt = '2026-11-11T08:00:00Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.isStrictIsoDateString).toBeDefined();
    });

    it('từ chối timezone offset khác UTC (không kết thúc bằng Z)', async () => {
      const dto = new UpdateVoucherDto();
      dto.expectedUpdatedAt = '2026-11-11T15:00:00.000+07:00';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('từ chối ngày lịch không hợp lệ (ví dụ ngày 31 tháng 2)', async () => {
      const dto = new UpdateVoucherDto();
      dto.expectedUpdatedAt = '2026-02-31T08:00:00.000Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('bỏ qua kiểm tra khi expectedUpdatedAt là undefined', async () => {
      const dto = new UpdateVoucherDto();
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('toIsoString helper', () => {
    it('chuyển Date object thành chuỗi ISO', () => {
      const d = new Date('2026-11-11T08:00:00.123Z');
      expect(toIsoString(d)).toBe('2026-11-11T08:00:00.123Z');
    });

    it('chuyển chuỗi hợp lệ thành chuỗi ISO', () => {
      expect(toIsoString('2026-11-11T08:00:00.000Z')).toBe('2026-11-11T08:00:00.000Z');
    });

    it('ném lỗi khi đầu vào là null hoặc undefined (không tự tạo thời gian hiện tại)', () => {
      expect(() => toIsoString(null as unknown as Date)).toThrow('toIsoString: date is required');
      expect(() => toIsoString(undefined as unknown as Date)).toThrow(
        'toIsoString: date is required',
      );
    });
  });
});
