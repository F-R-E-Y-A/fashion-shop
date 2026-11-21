import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 640 },
]) {
  test(`UC-04.3 quản trị biến thể và giá ${viewport.width}px: xem danh sách, modal tạo và modal sửa`, async ({
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
    await productLink.click();

    // 1. Xem danh sách biến thể
    const variantsSection = page.locator('section[aria-labelledby="catalog-variants"]');
    await expect(variantsSection).toBeVisible();

    const detailShotPath = testInfo.outputPath(`variant-detail-${viewport.width}px.png`);
    await page.screenshot({ path: detailShotPath, fullPage: true });
    await testInfo.attach(`variant-detail-${viewport.width}px`, {
      path: detailShotPath,
      contentType: 'image/png',
    });

    // 2. Mở modal thêm biến thể
    const addBtn = page.getByRole('button', { name: '+ Thêm biến thể', exact: true });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const createDialog = page.getByRole('dialog');
    await expect(createDialog).toBeVisible();
    await expect(createDialog).toHaveAccessibleName('Thêm biến thể mới');

    const createShotPath = testInfo.outputPath(`variant-create-modal-${viewport.width}px.png`);
    await page.screenshot({ path: createShotPath });
    await testInfo.attach(`variant-create-modal-${viewport.width}px`, {
      path: createShotPath,
      contentType: 'image/png',
    });

    // 3. Thực hiện tương tác form tạo biến thể (chọn màu chưa có trên fixture để tránh trùng (den, trang))
    const colorSelect = createDialog.getByLabel('Màu sắc');
    await expect(colorSelect).toBeVisible();
    const colorCode = viewport.width === 1280 ? 'xam' : 'xanh-navy';
    const colorValue = await colorSelect.evaluate((el: HTMLSelectElement, code: string) => {
      const match = Array.from(el.options).find((o) => o.text.includes(`(${code})`));
      return match?.value ?? '';
    }, colorCode);
    expect(colorValue).toBeTruthy();
    await colorSelect.selectOption(colorValue);

    const sizeSelect = createDialog.getByLabel('Kích cỡ');
    await expect(sizeSelect).toBeVisible();
    const sizeIdx = viewport.width === 1280 ? 4 : 5;
    await sizeSelect.selectOption({ index: sizeIdx });

    const newSku = `E2E-V-${viewport.width}-${Date.now().toString().slice(-5)}`;
    await createDialog.getByLabel('Mã SKU').fill(newSku);
    await createDialog.getByLabel('Giá niêm yết').fill('320000');
    await createDialog.getByRole('button', { name: 'Tạo biến thể', exact: true }).click();

    // Xác nhận modal đóng và dòng mới xuất hiện trên bảng
    await expect(createDialog).not.toBeVisible();
    const newVariantRow = variantsSection.getByRole('row').filter({ hasText: newSku });
    await expect(newVariantRow).toBeVisible();

    // 4. Mở modal sửa giá & trạng thái trên biến thể vừa tạo
    const editBtn = newVariantRow.getByRole('button', { name: 'Sửa giá & trạng thái' });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    const editDialog = page.getByRole('dialog');
    await expect(editDialog).toBeVisible();
    await expect(editDialog).toHaveAccessibleName('Sửa giá & trạng thái biến thể');

    const editShotPath = testInfo.outputPath(`variant-edit-modal-${viewport.width}px.png`);
    await page.screenshot({ path: editShotPath });
    await testInfo.attach(`variant-edit-modal-${viewport.width}px`, {
      path: editShotPath,
      contentType: 'image/png',
    });

    // 5. Thực hiện tương tác form sửa giá
    await editDialog.getByLabel('Giá niêm yết').fill('360000');
    await editDialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();

    // Xác nhận modal đóng và giá mới hiển thị trên bảng
    await expect(editDialog).not.toBeVisible();
    await expect(newVariantRow.getByText('360.000')).toBeVisible();
  });
}
