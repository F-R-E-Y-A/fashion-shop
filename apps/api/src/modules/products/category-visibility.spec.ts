import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { computeHierarchyVisibility, toIsoString } from './category-visibility.js';
import { ChangeCategoryVisibilityDto } from './dto/change-category-visibility.dto.js';

describe('category-visibility & DTO validation', () => {
  describe('UC-04.1/AC3 ChangeCategoryVisibilityDto & IsStrictIsoDateString', () => {
    it('UC-04.1/AC3 accepts valid ISO 8601 string with milliseconds in UTC', async () => {
      const dto = new ChangeCategoryVisibilityDto();
      dto.isActive = true;
      dto.expectedUpdatedAt = '2026-11-10T08:00:00.000Z';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('UC-04.1/AC3 rejects string missing milliseconds', async () => {
      const dto = new ChangeCategoryVisibilityDto();
      dto.isActive = true;
      dto.expectedUpdatedAt = '2026-11-10T08:00:00Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.isStrictIsoDateString).toBeDefined();
    });

    it('UC-04.1/AC3 rejects non-UTC timezone offsets', async () => {
      const dto = new ChangeCategoryVisibilityDto();
      dto.isActive = false;
      dto.expectedUpdatedAt = '2026-11-10T15:00:00.000+07:00';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('UC-04.1/AC3 rejects invalid calendar dates like Feb 31', async () => {
      const dto = new ChangeCategoryVisibilityDto();
      dto.isActive = false;
      dto.expectedUpdatedAt = '2026-02-31T08:00:00.000Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('UC-04.1/AC3 rejects non-string or non-boolean types', async () => {
      const dto = new ChangeCategoryVisibilityDto();
      // @ts-expect-error test runtime invalid type
      dto.isActive = 'true';
      // @ts-expect-error test runtime invalid type
      dto.expectedUpdatedAt = 123456789;

      const errors = await validate(dto);
      expect(errors.length).toBe(2);
    });
  });

  describe('UC-04.1/AC4 computeHierarchyVisibility', () => {
    it('UC-04.1/AC4 root category reflects own isActive with parentHidden=false', () => {
      expect(computeHierarchyVisibility({ isActive: true, parentId: null }, null)).toEqual({
        effectiveActive: true,
        parentHidden: false,
      });

      expect(computeHierarchyVisibility({ isActive: false, parentId: null }, null)).toEqual({
        effectiveActive: false,
        parentHidden: false,
      });
    });

    it('UC-04.1/AC4 child under active parent reflects own isActive with parentHidden=false', () => {
      expect(
        computeHierarchyVisibility({ isActive: true, parentId: 'parent-1' }, { isActive: true }),
      ).toEqual({ effectiveActive: true, parentHidden: false });

      expect(
        computeHierarchyVisibility({ isActive: false, parentId: 'parent-1' }, { isActive: true }),
      ).toEqual({ effectiveActive: false, parentHidden: false });
    });

    it('UC-04.1/AC4 child under inactive parent has effectiveActive=false and parentHidden=true', () => {
      // Child isActive is true in DB, but effectively hidden because parent is hidden
      expect(
        computeHierarchyVisibility({ isActive: true, parentId: 'parent-1' }, { isActive: false }),
      ).toEqual({ effectiveActive: false, parentHidden: true });

      // Child isActive is false in DB, and parent is also hidden
      expect(
        computeHierarchyVisibility({ isActive: false, parentId: 'parent-1' }, { isActive: false }),
      ).toEqual({ effectiveActive: false, parentHidden: true });
    });
  });

  describe('toIsoString', () => {
    it('converts Date or string safely to ISO string', () => {
      const d = new Date('2026-11-10T08:30:00.123Z');
      expect(toIsoString(d)).toBe('2026-11-10T08:30:00.123Z');
      expect(toIsoString('2026-11-10T08:30:00.123Z')).toBe('2026-11-10T08:30:00.123Z');
    });
  });
});
