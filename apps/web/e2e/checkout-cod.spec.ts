import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

/**
 * E2E-07 (PH-11): luong COD tron ven qua giao dien. Khach chon bien the, them gio, dat COD; admin
 * xac nhan (chot kho, ADR-038) roi ghi da giao, da thu tien; khach thay don da giao va ton kho giam.
 * Nghiep vu tung buoc da co bai HTTP o apps/api/test/cod.http.spec.ts; bai nay kiem cac tang noi voi nhau.
 */
test('E2E-07 COD: khách đặt hàng, admin xác nhận rồi ghi đã giao, khách thấy đơn đã giao', async ({
  browser,
}) => {
  const fx = fixture();
  const { slug, color, size } = fx.product;
  const productUrl = `/san-pham/${slug}?color=${color}&size=${size}`;

  const customer = await (await browser.newContext()).newPage();
  await login(customer, fx.customer);

  // Doc ton dang hien thay vi so seed: chay lap (--repeat-each) thi lan sau con it hon mot.
  await customer.goto(productUrl);
  const stockStatus = customer.getByRole('status').filter({ hasText: /^Còn \d+ sản phẩm$/u });
  const stock = Number((await stockStatus.textContent())?.match(/\d+/u)?.[0]);
  expect(stock).toBeGreaterThan(0);
  await customer.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(customer.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ.' })).toBeVisible();

  await customer.goto('/gio-hang');
  await customer.getByRole('button', { name: 'Tiến hành đặt hàng' }).click();
  await expect(customer).toHaveURL(/\/thanh-toan$/u);

  await customer.getByRole('radio', { name: 'COD — thanh toán khi nhận hàng' }).check();
  await customer.getByRole('button', { name: 'Xác nhận đặt hàng (COD)' }).click();
  await expect(customer).toHaveURL(/\/don-hang\/[0-9a-f-]{36}$/u);
  const orderId = customer.url().split('/').at(-1)!;
  await expect(
    customer.getByRole('heading', { name: 'Chờ xử lý · thanh toán khi nhận hàng' }),
  ).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await login(admin, fx.admin);
  await admin.goto(`/admin/orders/${orderId}`);

  await admin.getByRole('button', { name: 'Xác nhận và giao COD' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Xác nhận và giao COD' }).click();
  await expect(admin.getByText('Đã xác nhận đơn COD và chốt kho.')).toBeVisible();

  await admin.getByRole('button', { name: 'Đã giao, đã thu tiền' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Đã giao, đã thu tiền' }).click();
  await expect(admin.getByText('Đã ghi nhận giao hàng.')).toBeVisible();

  await customer.reload();
  await expect(customer.getByRole('heading', { name: 'Đã giao hàng' })).toBeVisible();
  await expect(customer.getByText('Đơn đã giao thành công.')).toBeVisible();

  await customer.goto(productUrl);
  await expect(
    customer.getByRole('status').filter({ hasText: `Còn ${stock - 1} sản phẩm` }),
  ).toBeVisible();
});
