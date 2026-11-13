import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

test.beforeAll(() => {
  // Chay seed don hang va refresh bao cao cho moi truong E2E
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  execSync('npm run reports:seed-e2e -w apps/api --silent', { cwd: root, encoding: 'utf8' });
});

for (const viewport of [
  { width: 1280, height: 800, name: 'desktop-1280' },
  { width: 360, height: 740, name: 'mobile-360' },
]) {
  test(`Issue #108: Báo cáo bán hàng ${viewport.name} hiển thị 3 KPI, 3 bảng dữ liệu và bộ lọc`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await login(page, fixture().admin);

    await page.goto('/admin/reports');

    // 1. Tieu de chinh va phu de
    await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo bán hàng' })).toBeVisible();
    await expect(
      page.getByText('Tổng hợp số liệu thu/hoàn tiền và phân tích đơn hàng theo snapshot định kỳ'),
    ).toBeVisible();

    // 2. Thong tin trang thai snapshot
    await expect(page.getByText(/● Sẵn sàng/)).toBeVisible();

    // 3. Bo loc form
    const form = page.getByRole('search', { name: 'Bộ lọc báo cáo' });
    await expect(form).toBeVisible();
    const fromInput = form.getByLabel('Từ ngày');
    const toInput = form.getByLabel('Đến ngày');
    const applyBtn = form.getByRole('button', { name: 'Áp dụng' });
    const refreshBtn = form.getByRole('button', { name: 'Làm mới' });

    await expect(fromInput).toBeVisible();
    await expect(toInput).toBeVisible();
    await expect(applyBtn).toBeVisible();
    await expect(refreshBtn).toBeVisible();

    // Kiem tra touch targets >= 44px
    for (const el of [fromInput, toInput, applyBtn, refreshBtn]) {
      const box = await el.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // 4. 3 The KPI
    const kpiSection = page.getByRole('region', { name: 'Chỉ số doanh thu chính' });
    await expect(kpiSection).toBeVisible();

    const collectedCard = kpiSection.getByTestId('kpi-collected');
    const refundedCard = kpiSection.getByTestId('kpi-refunded');
    const netCard = kpiSection.getByTestId('kpi-net');

    await expect(collectedCard).toBeVisible();
    await expect(refundedCard).toBeVisible();
    await expect(netCard).toBeVisible();

    await expect(collectedCard).toHaveText('450.000 đ');
    await expect(refundedCard).toHaveText('0 đ');
    await expect(netCard).toHaveText('450.000 đ');

    // 5. 3 Bang du lieu
    await expect(
      page.getByRole('heading', { level: 2, name: 'Doanh thu theo ngày' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Đơn hàng theo trạng thái hiện tại' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: /Top \d+ sản phẩm đã giao thành công/ }),
    ).toBeVisible();

    // Kiem tra dong giao hang trong bang don hang
    await expect(page.getByText('Đã giao hàng').first()).toBeVisible();

    // Kiem tra responsive tren 360px: khong co scrollbar ngang
    if (viewport.width === 360) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }

    // Chup anh man hinh minh chung qua testInfo.outputPath va dinh kem qua testInfo.attach
    const screenshotFileName = `screenshot-admin-reports-${viewport.name}.png`;
    const screenshotPath = testInfo.outputPath(screenshotFileName);
    const screenshotBuffer = await page.screenshot({ path: screenshotPath, fullPage: true });

    await testInfo.attach(screenshotFileName, {
      body: screenshotBuffer,
      contentType: 'image/png',
    });
  });
}
