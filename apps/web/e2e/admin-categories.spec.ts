import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 640 },
]) {
  test(`UC-04.1/AC6,AC7 reduced motion ${viewport.width}px: duyệt cây danh mục, phím Escape/Tab, ẩn và hiện danh mục`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fx = fixture();
    await login(page, fx.admin);

    await page.goto('/admin/categories');
    await expect(page.getByRole('heading', { name: 'Quản lý danh mục' })).toBeVisible();

    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );

    const aoRow = page.getByTestId('category-row-ao');
    await expect(aoRow).toBeVisible();

    const toggleBtn = aoRow.getByRole('button', { name: /^(?:Ẩn|Hiện) danh mục Áo$/u });
    // Fixture phải bắt đầu ở trạng thái hiện; không bỏ qua thao tác nếu seed bị lệch.
    await expect(toggleBtn).toHaveText('Ẩn');

    // 1. Thao tác Ẩn danh mục và kiểm tra phím Tab/Escape
    await toggleBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName('Ẩn danh mục?');
    await expect(dialog).toHaveCSS('animation-name', 'none');

    const cancel = dialog.getByRole('button', { name: 'Hủy', exact: true });
    const confirm = dialog.getByRole('button', { name: 'Ẩn danh mục', exact: true });

    await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();

    // Escape đóng hộp thoại và trả focus về nút mở
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(toggleBtn).toBeFocused();

    // Mở lại và xác nhận ẩn
    await toggleBtn.click();
    await confirm.click();

    await expect(page.getByText('Đã ẩn danh mục "Áo" thành công.')).toBeVisible();
    await expect(aoRow.getByRole('button', { name: 'Hiện danh mục Áo' })).toBeVisible();

    // Chụp ảnh bằng chứng
    await testInfo.attach(`category-hidden-${viewport.width}px`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // 2. Chuyển sang chi tiết và bật lại
    const link = aoRow.getByRole('link', { name: 'Áo', exact: true });
    await link.click();
    await expect(page.getByRole('heading', { name: 'Áo' })).toBeVisible();

    const detailToggle = page.getByRole('button', { name: 'Hiện danh mục', exact: true });
    await expect(detailToggle).toBeVisible();
    await detailToggle.click();

    const detailDialog = page.getByRole('dialog');
    await expect(detailDialog).toHaveAccessibleName('Hiện danh mục?');
    await detailDialog.getByRole('button', { name: 'Hiện danh mục', exact: true }).click();

    await expect(page.getByText('Đã hiện danh mục "Áo" thành công.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ẩn danh mục', exact: true })).toBeVisible();

    // Kiểm tra không tràn màn hình theo chiều ngang (responsive)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
