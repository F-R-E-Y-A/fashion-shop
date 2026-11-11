import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 640 },
]) {
  test(`UC-10.1 Quản trị chiến dịch đơn giản ${viewport.width}px: danh sách, tạo mới, sửa và bật/ngưng`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fx = fixture();
    await login(page, fx.admin);

    // 1. Vào trang danh sách khuyến mãi
    await page.goto('/admin/promotions');
    await expect(page.getByRole('heading', { name: 'Chương trình khuyến mãi' })).toBeVisible();

    // Đo độ rộng viewport, không tràn ngang
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);

    // 2. Bấm nút Tạo chiến dịch
    const createBtn = page.getByRole('link', { name: '+ Tạo chiến dịch' });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    await expect(page).toHaveURL(/\/admin\/promotions\/new/u);
    await expect(
      page.getByRole('heading', { name: 'Tạo chiến dịch khuyến mãi mới' }),
    ).toBeVisible();

    // Kiểm tra trạng thái mặc định là INACTIVE
    const statusSelect = page.getByLabel('Trạng thái ban đầu');
    await expect(statusSelect).toHaveValue('INACTIVE');

    // Điền thông tin tạo mới
    const campaignName = `KM E2E ${viewport.width}px`;
    await page.getByLabel(/Tên chương trình khuyến mãi/i).fill(campaignName);
    await page.getByLabel(/Giá trị giảm/i).fill('20');
    await page.getByLabel(/Mức giảm tối đa/i).fill('100000');
    await page.getByLabel(/Đơn hàng tối thiểu/i).fill('300000');

    // Bấm lưu
    await page.getByRole('button', { name: 'Lưu chiến dịch' }).click();

    // Chuyển hướng tới trang chi tiết
    await expect(page).toHaveURL(/\/admin\/promotions\/[0-9a-f-]+/u);
    await expect(page.getByRole('heading', { name: campaignName })).toBeVisible();
    await expect(page.getByText('Ngưng hoạt động')).toBeVisible();

    await page.screenshot({
      path: `/Users/huynhtai/Projects/TLCN/.worktrees/admin-campaigns-docs/minh-chung/admin-campaigns88/campaign-detail-${viewport.width}px.png`,
      fullPage: true,
    });

    // 3. Chỉnh sửa thông tin chiến dịch
    const updatedName = `${campaignName} Đã Cập Nhật`;
    const nameInput = page.getByLabel(/Tên chương trình khuyến mãi/i);
    await nameInput.fill(updatedName);

    const saveBtn = page.getByRole('button', { name: 'Lưu thay đổi' });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    await expect(page.getByText('Đã cập nhật chiến dịch thành công.')).toBeVisible();
    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();

    // 4. Kích hoạt chiến dịch (Bật trạng thái)
    const activateBtn = page.getByRole('button', { name: 'Kích hoạt chiến dịch' });
    await expect(activateBtn).toBeVisible();
    await activateBtn.click();

    // Hộp ConfirmDialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Kích hoạt chiến dịch khuyến mãi' }),
    ).toBeVisible();

    // Kiểm tra phím Escape đóng hộp thoại
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(activateBtn).toBeFocused();

    // Mở lại và xác nhận kích hoạt
    await activateBtn.click();
    await expect(dialog).toBeVisible();
    const confirmBtn = dialog.getByRole('button', { name: 'Kích hoạt ngay' });
    await confirmBtn.click();

    await expect(page.getByText(/Đã kích hoạt chiến dịch/)).toBeVisible();
    await expect(page.getByText('Đang hoạt động')).toBeVisible();

    // 5. Quay lại danh sách
    await page.goto('/admin/promotions');
    await expect(page.getByRole('heading', { name: 'Chương trình khuyến mãi' })).toBeVisible();
    if (viewport.width >= 720) {
      await expect(page.getByRole('table')).toBeVisible();
      await expect(page.getByRole('table').getByText(updatedName)).toBeVisible();
    } else {
      await expect(page.getByRole('table')).toBeHidden();
      await expect(
        page.locator('[class*="cardName"]').filter({ hasText: updatedName }),
      ).toBeVisible();
    }
  });
}
