import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 740 },
]) {
  test(`Issue #92: Tổng quan cửa hàng ${viewport.width}px hiển thị 4 KPI, 2 panel và không lồng interactive element`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page, fixture().admin);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' })).toBeVisible();
    await expect(page.getByText('Số liệu hiện tại · cập nhật theo từng khối')).toBeVisible();

    // Nút làm mới
    const refreshBtn = page.getByRole('button', { name: 'Làm mới' });
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toBeEnabled();

    // 4 thẻ KPI trong vùng "Chỉ số hoạt động chính" (tránh xung đột với link thanh điều hướng bên)
    const kpiSection = page.getByRole('region', { name: 'Chỉ số hoạt động chính' });

    const usersKpi = kpiSection.getByRole('link', { name: /Người dùng/ });
    await expect(usersKpi).toBeVisible();
    await expect(usersKpi).toHaveAttribute('href', '/admin/users');

    const productsKpi = kpiSection.getByRole('link', { name: /Sản phẩm/ });
    await expect(productsKpi).toBeVisible();
    await expect(productsKpi).toHaveAttribute('href', '/admin/products');

    const ordersKpi = kpiSection.getByRole('link', { name: /Đơn hàng/ });
    await expect(ordersKpi).toBeVisible();
    await expect(ordersKpi).toHaveAttribute('href', '/admin/orders?tab=all');

    const attentionKpi = kpiSection.getByRole('link', { name: /Cần xử lý/ });
    await expect(attentionKpi).toBeVisible();
    await expect(attentionKpi).toHaveAttribute('href', '/admin/orders?tab=attention');

    // Panel Đơn cần đối soát/xử lý
    const attentionPanel = page.locator('section[aria-labelledby="attention-heading"]');
    await expect(
      attentionPanel.getByRole('heading', { level: 2, name: 'Đơn cần đối soát/xử lý' }),
    ).toBeVisible();
    const attentionListLink = attentionPanel.getByRole('link', { name: 'Mở danh sách' });
    await expect(attentionListLink).toHaveAttribute('href', '/admin/orders?tab=attention');

    // Panel Tồn thấp
    const lowStockPanel = page.locator('section[aria-labelledby="low-stock-heading"]');
    await expect(lowStockPanel.getByRole('heading', { level: 2, name: 'Tồn thấp' })).toBeVisible();
    await expect(
      lowStockPanel.getByText('Khả dụng từ 0 đến 5, gồm biến thể ngừng bán'),
    ).toBeVisible();
    const inventoryLink = lowStockPanel.getByRole('link', { name: 'Mở tồn kho' });
    await expect(inventoryLink).toHaveAttribute('href', '/admin/inventory');

    // Kiểm tra cấu trúc DOM: tuyệt đối không lồng button trong thẻ a hoặc a trong button
    const nestedInteractive = await page.locator('a button, button a').count();
    expect(nestedInteractive).toBe(0);

    // Kiểm tra responsive 360px: không có thanh cuộn ngang trang
    if (viewport.width === 360) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }

    // Đính kèm ảnh chụp màn hình minh chứng
    await testInfo.attach(`admin-overview-${viewport.width}px`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // Thao tác điều hướng: bấm vào KPI Đơn hàng chuyển sang /admin/orders?tab=all
    await ordersKpi.click();
    await expect(page).toHaveURL(/\/admin\/orders\?tab=all/);
  });
}
