import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

test('UC-02.1/AC9 drawer 640x320 giữ link cuối trong viewport và trả focus khi Escape', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 640, height: 320 });
  await login(page, fixture().admin);
  await page.goto('/admin/users');
  const opener = page.getByRole('button', { name: 'Mở điều hướng quản trị' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Menu quản trị' });
  const close = dialog.getByRole('button', { name: 'Đóng điều hướng' });
  const last = dialog.getByRole('link', { name: /Về cửa hàng/u });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();

  // isVisible không phát hiện link còn trong DOM nhưng nằm ngoài chiều cao màn hình.
  const bounds = await dialog.boundingBox();
  const lastBounds = await last.boundingBox();
  expect(bounds).not.toBeNull();
  expect(lastBounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(320);
  expect(lastBounds!.y).toBeGreaterThanOrEqual(0);
  expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(320);
  await testInfo.attach('drawer-short-screen', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 740 },
]) {
  test(`UC-02.1/AC9 Tổng quan ${viewport.width}px dùng total API thật và giảm chuyển động`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page, fixture().admin);
    const [response] = await Promise.all([
      page.waitForResponse((reply) => {
        const url = new URL(reply.url());
        return (
          reply.request().method() === 'GET' &&
          url.pathname === '/api/admin/products' &&
          url.searchParams.get('status') === 'all' &&
          url.searchParams.get('page') === '1' &&
          url.searchParams.get('pageSize') === '1'
        );
      }),
      page.goto('/admin'),
    ]);
    expect(response.ok()).toBe(true);
    const data = (await response.json()) as { total: number };
    expect(Number.isSafeInteger(data.total)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Tổng quan cửa hàng' })).toBeVisible();
    const card = page
      .getByRole('region', { name: 'Chỉ số hoạt động chính' })
      .getByRole('link', { name: /^Sản phẩm/u });
    await expect(card.getByText(data.total.toLocaleString('vi-VN'), { exact: true })).toBeVisible();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    await expect(card).toHaveCSS('transition-duration', '0s');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await testInfo.attach('overview-reduced-motion', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}
