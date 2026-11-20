import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { type AddressInfo, createServer } from 'node:net';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { expect, type Page, test, type TestInfo } from '@playwright/test';

import { fixture, login } from './fixture.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(HERE, '../../..');
const API_ROOT = path.join(REPO_ROOT, 'apps/api');

function reserveFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const { port } = addr;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForHttpOk(url: string, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Máy chủ chưa mở cổng
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Hết thời gian chờ máy chủ tại ${url}`);
}

async function fillNewProductForm(
  page: Page,
  opts: { productName: string; productSlug: string; sku: string },
) {
  await page.goto('/admin/products');
  const createLink = page.getByRole('link', { name: '+ Tạo sản phẩm' });
  await expect(createLink).toBeVisible();
  await createLink.click();

  await expect(page).toHaveURL(/\/admin\/products\/new$/u);
  await expect(page.getByRole('heading', { name: 'Tạo sản phẩm mới' })).toBeVisible();

  await page.getByLabel(/Tên sản phẩm/i).fill(opts.productName);
  await page.getByLabel(/Slug đường dẫn/i).fill(opts.productSlug);

  const categorySelect = page.getByLabel(/Danh mục lá/i);
  await expect(categorySelect.locator('option:not([disabled])').nth(1)).toBeAttached();
  const leafValue = await categorySelect.evaluate((el: HTMLSelectElement) => {
    const enabledVisible = Array.from(el.options).find(
      (opt) => opt.value && !opt.disabled && !opt.textContent?.includes('Đang ẩn'),
    );
    const anyLeaf = Array.from(el.options).find((opt) => opt.value && !opt.disabled);
    return enabledVisible?.value ?? anyLeaf?.value ?? '';
  });
  expect(leafValue).toBeTruthy();
  await categorySelect.selectOption(leafValue);

  const colorSelect = page.getByLabel(/Màu sắc/i);
  const colorValue = await colorSelect.evaluate(
    (el: HTMLSelectElement) => Array.from(el.options).find((o) => o.value)?.value ?? '',
  );
  expect(colorValue).toBeTruthy();
  await colorSelect.selectOption(colorValue);

  const sizeSelect = page.getByLabel(/Kích cỡ/i);
  const sizeValue = await sizeSelect.evaluate(
    (el: HTMLSelectElement) => Array.from(el.options).find((o) => o.value)?.value ?? '',
  );
  expect(sizeValue).toBeTruthy();
  await sizeSelect.selectOption(sizeValue);

  await page.getByLabel(/Mã SKU/i).fill(opts.sku);
  await page.getByLabel(/Giá niêm yết/i).fill('420000');
  await page.getByLabel(/Giá giảm/i).fill('360000');
}

async function attachShot(page: Page, testInfo: TestInfo, name: string) {
  const shotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  await testInfo.attach(name, { path: shotPath, contentType: 'image/png' });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 640 },
]) {
  test(`UC-04.2/AC60 tạo sản phẩm khi kho ảnh tắt ở ${viewport.width}px: tạo ẩn không ảnh và chặn công bố 422`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const fx = fixture();
    await login(page, fx.admin);

    const suffix = `noimg-${viewport.width}-${Date.now()}`;
    const productName = `Áo sơ mi không ảnh ${suffix}`;
    const productSlug = `ao-so-mi-khong-anh-${suffix}`;
    const sku = `E2E-NOIMG-${suffix}`;

    await fillNewProductForm(page, { productName, productSlug, sku });

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(hasOverflow).toBe(false);

    const fileInput = page.locator('input[type="file"][aria-label="Chọn ảnh tải lên"]');
    const uploadsEnabled = await fileInput.isEnabled();
    if (!uploadsEnabled) {
      await expect(page.getByText(/Kho ảnh chưa được cấu hình/)).toBeVisible();
    }

    await attachShot(page, testInfo, `noimg-form-${viewport.width}px`);

    await page.getByRole('button', { name: 'Lưu sản phẩm (ẩn mặc định)' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/u);
    const detailUrl = page.url();

    await expect(page.getByRole('heading', { name: productName })).toBeVisible();
    await expect(page.getByText(/Ngừng bán thủ công/i).first()).toBeVisible();

    await page.goto(`/san-pham/${productSlug}`);
    await expect(page.getByRole('heading', { name: /Không tìm thấy sản phẩm/i })).toBeVisible();

    await page.goto(detailUrl);
    if (!uploadsEnabled) {
      const publishBtn = page.getByRole('button', { name: 'Gỡ ngừng bán', exact: true });
      await publishBtn.click();
      const confirmDialog = page.getByRole('dialog');
      await confirmDialog.getByRole('button', { name: 'Gỡ ngừng bán', exact: true }).click();
      await expect(
        page.getByText(/Không thể công bố sản phẩm tạo tay khi chưa có ảnh/i),
      ).toBeVisible();
    }
  });
}

test.describe('AC62 kho ảnh giả lập và DB test riêng: tạo ẩn → công bố → hiện ngoài storefront', () => {
  let fakeApiProc: ChildProcess | null = null;
  let viteProc: ChildProcess | null = null;
  let fakeWebUrl = '';

  test.beforeAll(async () => {
    const envFile = path.join(REPO_ROOT, '.env');
    if (!process.env.DATABASE_URL_TEST && existsSync(envFile)) {
      loadEnvFile(envFile);
    }
    const testDbUrl = process.env.DATABASE_URL_TEST;
    if (!testDbUrl) {
      throw new Error('Thiếu DATABASE_URL_TEST cho lượt E2E kho ảnh giả lập.');
    }

    const apiPort = await reserveFreePort();
    const webPort = await reserveFreePort();
    fakeWebUrl = `http://127.0.0.1:${webPort}`;

    const viteBin = path.join(REPO_ROOT, 'node_modules/.bin/vite');
    let serverLogs = '';

    fakeApiProc = spawn(process.execPath, ['test/e2e/fake-storage-api.mjs'], {
      cwd: API_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: testDbUrl,
        NODE_ENV: 'test',
        PORT: String(apiPort),
        API_PORT: String(apiPort),
      },
      stdio: 'pipe',
    });
    fakeApiProc.stdout?.on('data', (d: Buffer) => {
      serverLogs += d.toString();
    });
    fakeApiProc.stderr?.on('data', (d: Buffer) => {
      serverLogs += d.toString();
    });

    viteProc = spawn(viteBin, ['--port', String(webPort), '--strictPort', '--host', '127.0.0.1'], {
      cwd: WEB_ROOT,
      env: {
        ...process.env,
        API_PORT: String(apiPort),
        VITE_API_URL: '/api',
      },
      stdio: 'pipe',
    });
    viteProc.stderr?.on('data', (d: Buffer) => {
      serverLogs += d.toString();
    });

    try {
      await waitForHttpOk(`http://127.0.0.1:${apiPort}/api/healthz`);
      await waitForHttpOk(`${fakeWebUrl}/`);
    } catch (err) {
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\n--- Server logs ---\n${serverLogs}`,
        { cause: err },
      );
    }
  });

  test.afterAll(() => {
    viteProc?.kill('SIGTERM');
    fakeApiProc?.kill('SIGTERM');
    viteProc = null;
    fakeApiProc = null;
  });

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 360, height: 640 },
  ]) {
    test(`UC-04.2/AC62 luồng đầy đủ với ảnh ở ${viewport.width}px: tải ảnh, tạo ẩn, công bố và xác nhận storefront`, async ({
      browser,
    }, testInfo) => {
      const context = await browser.newContext({ baseURL: fakeWebUrl, viewport });
      const page = await context.newPage();
      const fx = fixture();

      const suffix = `pub-${viewport.width}-${Date.now()}`;
      const productName = `Áo sơ mi AC62 ${suffix}`;
      const productSlug = `ao-so-mi-ac62-${suffix}`;
      const sku = `E2E-AC62-${suffix}`;
      const imageAlt = `Ảnh đại diện AC62 ${viewport.width}px`;
      let detailUrl = '';

      try {
        await login(page, fx.admin);
        await fillNewProductForm(page, { productName, productSlug, sku });

        const fileInput = page.locator('input[type="file"][aria-label="Chọn ảnh tải lên"]');
        await expect(fileInput).toBeEnabled();
        await fileInput.setInputFiles({
          name: 'e2e-ac62.png',
          mimeType: 'image/png',
          buffer: TINY_PNG,
        });
        await expect(page.getByAltText('Ảnh tải lên 1')).toBeVisible();
        await page.getByLabel(/Mô tả thay thế ảnh #1/i).fill(imageAlt);

        const formOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 2,
        );
        expect(formOverflow).toBe(false);
        await attachShot(page, testInfo, `ac62-form-${viewport.width}px`);

        await page.getByRole('button', { name: 'Lưu sản phẩm (ẩn mặc định)' }).click();
        await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/u);
        detailUrl = page.url();

        await expect(page.getByRole('heading', { name: productName })).toBeVisible();
        await expect(page.getByText(/Ngừng bán thủ công/i).first()).toBeVisible();
        await expect(page.locator(`img[alt="${imageAlt}"]`)).toBeVisible();
        await attachShot(page, testInfo, `ac62-hidden-detail-${viewport.width}px`);

        // Khi chưa công bố: storefront chưa lộ sản phẩm
        await page.goto(`/san-pham/${productSlug}`);
        await expect(page.getByRole('heading', { name: /Không tìm thấy sản phẩm/i })).toBeVisible();

        // Công bố từ trang chi tiết quản trị
        await page.goto(detailUrl);
        await page.getByRole('button', { name: 'Gỡ ngừng bán', exact: true }).click();
        const publishDialog = page.getByRole('dialog');
        await expect(publishDialog).toBeVisible();
        await publishDialog.getByRole('button', { name: 'Gỡ ngừng bán', exact: true }).click();

        await expect(
          page.getByText('Đã gỡ ngừng bán thủ công. Trạng thái hiện tại được tải lại từ máy chủ.'),
        ).toBeVisible();
        await expect(page.getByRole('button', { name: 'Ngừng bán', exact: true })).toBeVisible();
        await attachShot(page, testInfo, `ac62-published-admin-${viewport.width}px`);

        // Xác nhận sản phẩm hiện đầy đủ ngoài storefront (tên, giá giảm, ảnh nạp thật, không tràn ngang)
        await page.goto(`/san-pham/${productSlug}`);
        await expect(page.getByRole('heading', { name: productName })).toBeVisible();
        await expect(page.getByText(/360\.000/).first()).toBeVisible();

        const storefrontImg = page.locator(`img[alt="${imageAlt}"]`).first();
        await expect(storefrontImg).toBeVisible();
        await expect(async () => {
          const loaded = await storefrontImg.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          );
          expect(loaded).toBe(true);
        }).toPass({ timeout: 5000 });

        const storefrontOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 2,
        );
        expect(storefrontOverflow).toBe(false);
        await attachShot(page, testInfo, `ac62-storefront-${viewport.width}px`);
      } finally {
        if (detailUrl) {
          try {
            await page.goto(detailUrl);
            const stopBtn = page.getByRole('button', { name: 'Ngừng bán', exact: true });
            if (await stopBtn.isVisible()) {
              await stopBtn.click();
              await page
                .getByRole('dialog')
                .getByRole('button', { name: 'Ngừng bán', exact: true })
                .click();
            }
          } catch {
            // Dọn dẹp tốt nhất có thể
          }
        }
        await context.close();
      }
    });
  }
});
