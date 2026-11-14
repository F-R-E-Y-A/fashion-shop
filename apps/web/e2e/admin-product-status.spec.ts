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
      const feedback = page.getByRole('status').filter({ has: success });
      await expect(feedback).toBeVisible();
      await expect(feedback.getByRole('button', { name: 'Đóng thông báo' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ngừng bán', exact: true })).toBeFocused();
      await expect(success).toBeHidden({ timeout: 8000 });
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

  test(`UC-04.2/AC24,AC28 reduced motion ${viewport.width}px: sua noi dung, ban phim, reload va trang cong khai`, async ({
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
    await productLink.click();

    const editBtn = page.getByRole('button', { name: 'Sửa nội dung', exact: true });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName('Sửa nội dung sản phẩm');
    await expect(dialog).toHaveCSS('animation-name', 'none');

    const nameInput = dialog.getByLabel('Tên sản phẩm');
    const descInput = dialog.getByLabel('Mô tả');
    const matInput = dialog.getByLabel('Chất liệu');
    const careInput = dialog.getByLabel('Hướng dẫn bảo quản');

    const original = {
      name: await nameInput.inputValue(),
      description: await descInput.inputValue(),
      material: await matInput.inputValue(),
      careInstructions: await careInput.inputValue(),
    };

    try {
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(editBtn).toBeFocused();

      await editBtn.click();
      await expect(dialog).toHaveAccessibleName('Sửa nội dung sản phẩm');
      const editedName = `${original.name} · Quản trị ${viewport.width}px`;
      const editedMaterial = `Cotton hữu cơ kiểm thử ${viewport.width}px`;
      const editedCare = `Giặt nhẹ nước lạnh ${viewport.width}px`;

      await nameInput.fill(editedName);
      await matInput.fill(editedMaterial);
      await careInput.fill(editedCare);
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      await testInfo.attach(`content-edit-dialog-${viewport.width}px`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      if (viewport.width === 360) {
        await dialog.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await testInfo.attach('content-edit-actions-360px', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }

      await dialog.getByRole('button', { name: 'Lưu nội dung', exact: true }).click();
      const success = page.getByText(
        'Đã lưu thay đổi nội dung sản phẩm. Các trường đã sửa sẽ được giữ khi nguồn cập nhật.',
        { exact: true },
      );
      await expect(success).toBeVisible();
      const feedback = page.getByRole('status').filter({ has: success });
      await expect(feedback).toBeVisible();
      await expect(feedback.getByRole('button', { name: 'Đóng thông báo' })).toBeVisible();
      await expect(editBtn).toBeFocused();
      await expect(success).toBeHidden({ timeout: 8000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );

      await page.reload();
      await expect(page.getByRole('heading', { name: editedName })).toBeVisible();
      await expect(page.getByText(editedMaterial, { exact: true })).toBeVisible();
      await expect(page.getByText(editedCare, { exact: true })).toBeVisible();

      await page.goto(`/san-pham/${fx.product.slug}`);
      await expect(page.getByRole('heading', { name: editedName })).toBeVisible();
      await expect(page.getByText(`Chất liệu: ${editedMaterial}`)).toBeVisible();
      await expect(page.getByText(`Bảo quản: ${editedCare}`)).toBeVisible();
    } finally {
      if (detailPath) {
        await page.goto(detailPath);
        await editBtn.click();
        await expect(dialog).toHaveAccessibleName('Sửa nội dung sản phẩm');
        await nameInput.fill(original.name);
        await descInput.fill(original.description);
        await matInput.fill(original.material);
        await careInput.fill(original.careInstructions);
        await dialog.getByRole('button', { name: 'Lưu nội dung', exact: true }).click();
        await expect(dialog).not.toBeVisible();
      }
    }
  });
}
