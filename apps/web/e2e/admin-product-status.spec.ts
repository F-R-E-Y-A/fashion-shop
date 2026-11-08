import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

// Chromium ap dung media that; khong thay matchMedia hoac dung viewport gia lap zoom.
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 640 },
]) {
  test(`UC-04.2/AC9,AC15 reduced motion ${viewport.width}px: danh sach ngung ban, chi tiet bat lai va ban phim`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fx = fixture();
    await login(page, fx.admin);
    await page.goto('/admin/products');
    await page.getByRole('combobox', { name: 'Số dòng' }).selectOption('60');
    const row = page.getByRole('row').filter({
      has: page.getByText(fx.product.slug, { exact: true }),
    });
    const productLink = row.getByRole('link');
    const detailPath = await productLink.getAttribute('href');
    expect(detailPath).toMatch(/^\/admin\/products\/[0-9a-f-]{36}/u);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    const stop = row.getByRole('button', { name: 'Ngừng bán', exact: true });

    try {
      await stop.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveAccessibleName('Ngừng bán sản phẩm này?');
      await expect(dialog).toHaveCSS('animation-name', 'none');
      const cancel = dialog.getByRole('button', { name: 'Hủy', exact: true });
      const confirm = dialog.getByRole('button', { name: 'Ngừng bán', exact: true });
      await expect(cancel).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(confirm).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(cancel).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(stop).toBeFocused();

      await stop.click();
      await confirm.click();
      await expect(
        page.getByText('Đã ngừng bán thủ công. Dữ liệu và đơn hiện có được giữ lại.'),
      ).toBeVisible();
      await expect(row.getByRole('button', { name: 'Gỡ ngừng bán', exact: true })).toBeVisible();
      await productLink.click();
      await page.getByRole('button', { name: 'Gỡ ngừng bán', exact: true }).click();
      await expect(dialog).toHaveAccessibleName('Gỡ ngừng bán thủ công?');
      await expect(dialog).toHaveCSS('animation-name', 'none');
      await expect(cancel).toBeFocused();
      await testInfo.attach('reduced-motion-dialog', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await dialog.getByRole('button', { name: 'Gỡ ngừng bán', exact: true }).click();
      const success = page.getByText(
        'Đã gỡ ngừng bán thủ công. Trạng thái hiện tại được tải lại từ máy chủ.',
        { exact: true },
      );
      await expect(success).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ngừng bán', exact: true })).toBeVisible();
      await expect(page.locator('div[tabindex="-1"]').filter({ has: success })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      // Fixture dung chung voi bai checkout: loi assertion cung phai co gang bo manual hold.
      if (detailPath) {
        await page.goto(detailPath);
        const restore = page.getByRole('button', { name: 'Gỡ ngừng bán', exact: true });
        await expect(
          page.getByRole('button', { name: /^(?:Gỡ ngừng bán|Ngừng bán)$/u }),
        ).toBeVisible();
        if (await restore.isVisible()) {
          await restore.click();
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Gỡ ngừng bán', exact: true })
            .click();
          await expect(page.getByRole('button', { name: 'Ngừng bán', exact: true })).toBeVisible();
        }
      }
    }
  });
}
