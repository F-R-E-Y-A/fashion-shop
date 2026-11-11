import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 640 },
]) {
  test(`UC-10.2 Quản trị Voucher ${viewport.width}px: tạo voucher, xem chi tiết và kích hoạt trạng thái`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const fx = fixture();
    await login(page, fx.admin);

    // 1. Vào danh sách voucher
    await page.goto('/admin/vouchers');
    await expect(page.getByRole('heading', { name: 'Mã giảm giá', exact: true })).toBeVisible();

    // 2. Chuyển sang trang tạo voucher mới
    const addBtn = page.getByRole('link', { name: '+ Thêm mã giảm giá' });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    await expect(page.getByRole('heading', { name: 'Tạo mã giảm giá mới' })).toBeVisible();

    // 3. Điền thông tin voucher
    const code = `E2E${viewport.width}${Date.now().toString().slice(-4)}`;
    await page.getByLabel(/Mã voucher/).fill(code);
    await page.getByLabel(/Giá trị giảm/).fill('20');
    await page.getByLabel(/Mức giảm tối đa/).fill('100000');
    await page.getByLabel(/đơn hàng tối thiểu/i).fill('300000');
    await page.getByLabel(/lượt sử dụng tối đa/i).fill('100');

    // Mặc định trạng thái là INACTIVE
    await expect(page.getByLabel(/Trạng thái ban đầu/)).toHaveValue('INACTIVE');

    // 4. Submit form
    await page.getByRole('button', { name: 'Tạo mã giảm giá' }).click();

    // Chờ chuyển hướng sang trang chi tiết
    await expect(page).toHaveURL(new RegExp(`/admin/vouchers/[a-f0-9-]+`));
    await expect(page.getByRole('heading', { name: code })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: 'Ngừng hoạt động' })).toBeVisible();

    // 5. Chụp ảnh màn hình chi tiết làm minh chứng
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach(`voucher-detail-${viewport.width}px`, {
      body: screenshot,
      contentType: 'image/png',
    });

    const docsDir =
      '/Users/huynhtai/Projects/TLCN/.worktrees/admin-vouchers-docs/minh-chung/admin-vouchers86';
    try {
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(path.join(docsDir, `voucher-detail-${viewport.width}px.png`), screenshot);
    } catch {
      // In sandbox, writing outside worktree may be blocked; file can also be copied later
    }

    // 6. Thao tác kích hoạt trạng thái từ trang chi tiết
    const activateBtn = page.getByRole('button', { name: 'Kích hoạt mã' });
    await expect(activateBtn).toBeVisible();
    await activateBtn.click();

    const dialog = page.getByRole('dialog', { name: 'Xác nhận kích hoạt mã' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Mã giảm giá: ${code}`)).toBeVisible();

    // Xác nhận trong hộp thoại
    await dialog.getByRole('button', { name: 'Kích hoạt' }).click();

    // Trạng thái cập nhật thành công
    await expect(page.locator('span').filter({ hasText: 'Đang hoạt động' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ngừng hoạt động' })).toBeVisible();

    // 7. Kiểm tra responsive không tràn ngang
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
