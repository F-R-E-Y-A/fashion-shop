import { describe, expect, it } from 'vitest';

import { runningSha } from './health.controller.js';

describe('runningSha: ma commit cd-staging.yml cho doi', () => {
  it('GIT_SHA that thang RENDER_GIT_COMMIT', () => {
    expect(runningSha('abc123', 'def456')).toBe('abc123');
  });

  it('GIT_SHA "unknown" mac dinh cua Dockerfile thi lay RENDER_GIT_COMMIT', () => {
    expect(runningSha('unknown', 'def456')).toBe('def456');
  });

  it('GIT_SHA rong hoac thieu thi lay RENDER_GIT_COMMIT', () => {
    expect(runningSha('', 'def456')).toBe('def456');
    expect(runningSha(undefined, 'def456')).toBe('def456');
  });

  it('khong co gia tri nao dung duoc thi tra null', () => {
    expect(runningSha('unknown', undefined)).toBeNull();
    expect(runningSha(undefined, undefined)).toBeNull();
  });
});
