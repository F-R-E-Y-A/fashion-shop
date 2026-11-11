import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

for (const width of [1280, 360]) {
  test(`UC-13.1/AC4 tồn kho chỉ đọc, lịch sử và back ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page, fixture().admin);
    await page.goto('/admin/inventory?page=1');
    await expect(page.getByRole('heading', { name: 'Quản lý tồn kho' })).toBeVisible();
    const link = page.locator('table tbody a').first();
    await expect(link).toBeVisible();
    const text = await link.textContent();
    await link.click();
    await expect(page.getByRole('heading', { name: 'Chi tiết tồn kho' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lịch sử biến động' })).toBeVisible();
    await expect(page.getByText('Tồn vật lý', { exact: true })).toBeVisible();
    expect(await page.getByRole('button', { name: /Điều chỉnh|Nhập kho/ }).count()).toBe(0);
    await testInfo.attach(`inventory-detail-${width}px`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('link', { name: '← Về tồn kho' }).click();
    await expect(page).toHaveURL(/\/admin\/inventory\?page=1$/);
    const restored = page.getByRole('link', { name: text!, exact: true });
    await expect(restored).toBeVisible();
    if (width === 360) {
      for (const target of [restored, page.locator('tbody td[data-label="Khả dụng"]').first()]) {
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}
