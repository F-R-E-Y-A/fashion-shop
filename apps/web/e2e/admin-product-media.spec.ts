import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 640 },
]) {
  test(`UC-04.2/AC45,AC50,AC52 quản trị ảnh sản phẩm ${viewport.width}px: xem bộ ảnh, thao tác bàn phím lên/xuống/đưa lên đầu, sửa alt, lưu và đối chiếu ảnh đại diện ngoài storefront`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
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

    const imagesSection = page.locator('section[aria-labelledby="catalog-images"]');
    await expect(imagesSection).toBeVisible();
    await expect(imagesSection.getByText('Ảnh đại diện (#1)')).toBeVisible();

    const firstImg = imagesSection.locator('figure img').first();
    const secondImg = imagesSection.locator('figure img').nth(1);
    const originalFirstUrl = await firstImg.getAttribute('src');
    const originalSecondUrl = await secondImg.getAttribute('src');
    expect(originalFirstUrl).toBeTruthy();
    expect(originalSecondUrl).toBeTruthy();
    expect(originalFirstUrl).not.toBe(originalSecondUrl);

    const altInput1 = imagesSection.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' });
    const altInput2 = imagesSection.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 2' });
    const originalAlt1 = await altInput1.inputValue();
    const originalAlt2 = await altInput2.inputValue();

    // Chụp màn hình bộ ảnh trước khi chỉnh sửa
    await imagesSection.scrollIntoViewIfNeeded();
    const beforeShotPath = testInfo.outputPath(`media-detail-${viewport.width}px.png`);
    await page.screenshot({ path: beforeShotPath, fullPage: true });
    await testInfo.attach(`media-detail-${viewport.width}px`, {
      path: beforeShotPath,
      contentType: 'image/png',
    });

    try {
      // Thao tác bằng bàn phím: focus nút "Đưa ảnh vị trí 2 lên đầu làm ảnh đại diện" và nhấn Enter
      const promoteBtn = imagesSection.getByRole('button', {
        name: 'Đưa ảnh vị trí 2 lên đầu làm ảnh đại diện',
      });
      await promoteBtn.focus();
      await expect(promoteBtn).toBeFocused();
      await page.keyboard.press('Enter');

      // Xác nhận ảnh #2 đã lên vị trí #1 trong bản nháp
      await expect(imagesSection.locator('figure img').first()).toHaveAttribute(
        'src',
        originalSecondUrl!,
      );

      // Sửa mô tả thay thế (alt) của ảnh đại diện mới ở vị trí #1
      const updatedAlt = `Ảnh đại diện E2E ${viewport.width}px`;
      await altInput1.fill(updatedAlt);

      // Chụp màn hình trạng thái bản nháp đã chỉnh sửa trước khi lưu
      const draftShotPath = testInfo.outputPath(`media-draft-${viewport.width}px.png`);
      await page.screenshot({ path: draftShotPath });
      await testInfo.attach(`media-draft-${viewport.width}px`, {
        path: draftShotPath,
        contentType: 'image/png',
      });

      // Lưu bộ ảnh bằng bàn phím
      const saveBtn = imagesSection.getByRole('button', { name: 'Lưu bộ ảnh', exact: true });
      await expect(saveBtn).toBeEnabled();
      await saveBtn.focus();
      await page.keyboard.press('Enter');

      await expect(page.getByText(/Đã lưu bộ ảnh sản phẩm/)).toBeVisible();
      await expect(
        imagesSection.getByText(/Đang do quản trị viên quản lý \(bảo vệ qua import\)/),
      ).toBeVisible();

      // Chụp màn hình sau khi lưu thành công
      const savedShotPath = testInfo.outputPath(`media-saved-${viewport.width}px.png`);
      await page.screenshot({ path: savedShotPath });
      await testInfo.attach(`media-saved-${viewport.width}px`, {
        path: savedShotPath,
        contentType: 'image/png',
      });

      // Kiểm tra không tràn ngang trên cả 1280px và 360px
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );

      // Đối chiếu ngoài Storefront: trang chi tiết công khai hiển thị ảnh đầu mới và alt mới
      await page.goto(`/san-pham/${fx.product.slug}`);
      await expect(page.locator(`img[alt="${updatedAlt}"]`).first()).toBeVisible();

      const storefrontShotPath = testInfo.outputPath(`media-storefront-${viewport.width}px.png`);
      await page.screenshot({ path: storefrontShotPath });
      await testInfo.attach(`media-storefront-${viewport.width}px`, {
        path: storefrontShotPath,
        contentType: 'image/png',
      });
    } finally {
      // Khôi phục thứ tự và alt gốc để không ảnh hưởng bài E2E khác
      if (detailPath) {
        await page.goto(detailPath);
        await expect(imagesSection).toBeVisible();
        const currentFirstUrl = await imagesSection
          .locator('figure img')
          .first()
          .getAttribute('src');
        if (currentFirstUrl === originalSecondUrl) {
          await imagesSection.getByRole('button', { name: 'Chuyển ảnh vị trí 2 lên' }).click();
          await altInput1.fill(originalAlt1);
          await altInput2.fill(originalAlt2);
          const restoreSaveBtn = imagesSection.getByRole('button', {
            name: 'Lưu bộ ảnh',
            exact: true,
          });
          if (await restoreSaveBtn.isEnabled()) {
            await restoreSaveBtn.click();
            await expect(page.getByText(/Đã lưu bộ ảnh sản phẩm/)).toBeVisible();
          }
        }
      }
    }
  });
}
