import { expect, type Locator, type Page, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

/**
 * E2E-09 (PH-11, viec 57): tra hang di het mot vong qua giao dien that. Khach dat COD, admin giao;
 * khach gui yeu cau tu trang don (hop vua khung 360 px); admin duyet, nhan hang, hoan chuyen khoan
 * kem ma giao dich; khach thay da hoan. Luat tung buoc (han 15 ngay, so luong, chay dua, cong VNPAY)
 * co bai HTTP o apps/api/test/returns.http.spec.ts; bai nay kiem cac tang noi voi nhau.
 */

async function expectFits(page: Page, region: Locator) {
  const width = page.viewportSize()?.width ?? 0;
  const box = await region.boundingBox();
  expect(box, 'vung phai dang hien').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

test('E2E-09 UC-14.1/AC1 UC-14.2/AC1 trả hàng COD: khách gửi từ đơn đã giao, admin duyệt, nhận hàng, hoàn chuyển khoản', async ({
  browser,
}, testInfo) => {
  const fx = fixture();
  const { slug, color, size } = fx.product;
  const token = `ma${Date.now().toString(36)}`;
  const description = `Áo hơi chật vai, còn tem (${token}).`;
  const transfer = `FT${Date.now()}`;

  // 1. Khach dat COD, admin xac nhan roi ghi da giao (nhu E2E-07, E2E-08).
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  await login(customer, fx.customer);
  await customer.goto(`/san-pham/${slug}?color=${color}&size=${size}`);
  await customer.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(customer.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ.' })).toBeVisible();
  await customer.goto('/gio-hang');
  await customer.getByRole('button', { name: 'Tiến hành đặt hàng' }).click();
  await expect(customer).toHaveURL(/\/thanh-toan$/u);
  await customer.getByRole('radio', { name: 'COD — thanh toán khi nhận hàng' }).check();
  await customer.getByRole('button', { name: 'Xác nhận đặt hàng (COD)' }).click();
  await expect(customer).toHaveURL(/\/don-hang\/[0-9a-f-]{36}$/u);
  const orderId = customer.url().split('/').at(-1)!;

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await login(admin, fx.admin);
  await admin.goto(`/admin/orders/${orderId}`);
  await admin.getByRole('button', { name: 'Xác nhận và giao COD' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Xác nhận và giao COD' }).click();
  await expect(admin.getByText('Đã xác nhận đơn COD và chốt kho.')).toBeVisible();
  await admin.getByRole('button', { name: 'Đã giao, đã thu tiền' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Đã giao, đã thu tiền' }).click();
  await expect(admin.getByText('Đã ghi nhận giao hàng.')).toBeVisible();

  // 2. Khach gui yeu cau tu trang don o 360 px (UC-14.1/AC1).
  await customer.setViewportSize({ width: 360, height: 740 });
  await customer.reload();
  await expect(customer.getByRole('heading', { name: 'Đã giao hàng' })).toBeVisible();
  await customer.getByRole('button', { name: 'Yêu cầu trả hàng' }).click();
  const form = customer.getByRole('dialog', { name: 'Yêu cầu trả hàng' });
  await expect(form).toBeVisible();
  await expect(form).toContainText('15 ngày kể từ khi giao');
  // Hop dai mo o dau hop, khong cuon xuong nut Huy (PR #140).
  expect(await form.evaluate((element) => element.scrollTop)).toBe(0);
  await expectFits(customer, form);
  await form.getByRole('checkbox').first().check();
  await form.getByRole('radio', { name: 'Cỡ không vừa' }).check();
  await form.getByPlaceholder('Tình trạng hàng, chỗ bị lỗi, cỡ bạn thường mặc…').fill(description);
  await form.getByLabel('Ngân hàng').fill('Ngân hàng Thử Nghiệm');
  await form.getByLabel('Số tài khoản').fill('0123 4567 89');
  await form.getByLabel('Tên chủ tài khoản').fill('KHACH E2E');
  await testInfo.attach('hop-tra-hang-360', {
    body: await customer.screenshot(),
    contentType: 'image/png',
  });
  await form.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(customer).toHaveURL(/\/tai-khoan\/tra-hang\/[0-9a-f-]{36}$/u);
  const returnId = customer.url().split('/').at(-1)!;
  await expect(customer.getByText('Chờ shop duyệt').first()).toBeVisible();
  await expect(customer.getByText(description)).toBeVisible();
  const heading = await customer.getByRole('heading', { name: /^Trả hàng đơn / }).textContent();
  const orderCode = heading!.replace('Trả hàng đơn ', '').trim();

  // Trang don doi nut thanh lien ket toi yeu cau dang xu ly: khong gui trung duoc.
  await customer.goto(`/don-hang/${orderId}`);
  await expect(customer.getByRole('link', { name: 'Xem yêu cầu trả hàng' })).toHaveAttribute(
    'href',
    `/tai-khoan/tra-hang/${returnId}`,
  );
  await expect(customer.getByRole('button', { name: 'Yêu cầu trả hàng' })).toHaveCount(0);

  // 3. Admin thay yeu cau o tab cho duyet, duyet kem ghi chu (UC-14.2/AC1).
  await admin.goto('/admin/returns');
  await admin.getByRole('link', { name: orderCode }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/returns/${returnId}`, 'u'));
  await expect(admin.getByText('0123456789')).toBeVisible();
  await admin.getByRole('button', { name: 'Duyệt', exact: true }).click();
  const approve = admin.getByRole('dialog', { name: 'Duyệt yêu cầu trả hàng' });
  await approve.getByRole('textbox').fill('Gửi về kho, ghi mã đơn ngoài gói.');
  await approve.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(
    admin.getByRole('status').filter({ hasText: 'Đã duyệt yêu cầu trả hàng.' }),
  ).toBeVisible();

  // 4. Nhan hang: kho cong lai (so luong kiem o bai HTTP).
  await admin.getByRole('button', { name: 'Đã nhận hàng' }).click();
  await admin
    .getByRole('dialog', { name: 'Xác nhận đã nhận hàng' })
    .getByRole('button', { name: 'Đã nhận hàng' })
    .click();
  await expect(
    admin.getByRole('status').filter({ hasText: 'Đã ghi nhận hàng về kho' }),
  ).toBeVisible();

  // 5. Hoan COD: thieu ma giao dich thi chan, co ma thi hoan tat.
  await admin.getByRole('button', { name: 'Hoàn tiền' }).click();
  const refund = admin.getByRole('dialog', { name: 'Hoàn tiền cho khách' });
  await refund.getByRole('button', { name: 'Hoàn tiền' }).click();
  await expect(refund.getByText(/Mã giao dịch gồm 4 đến 64 ký tự/u)).toBeVisible();
  await refund.getByLabel('Mã giao dịch chuyển khoản').fill(transfer);
  await refund.getByRole('button', { name: 'Hoàn tiền' }).click();
  await expect(
    admin.getByRole('status').filter({ hasText: 'Đã hoàn tiền; yêu cầu hoàn tất.' }),
  ).toBeVisible();
  await expect(admin.getByText(`REFUND:MANUAL:${transfer}`)).toBeVisible();
  // So tai khoan khach xoa khi yeu cau ket thuc (ADR-067 luat 5).
  await expect(admin.getByText('0123456789')).toHaveCount(0);

  // 6. Khach thay da hoan o chi tiet va danh sach.
  await customer.goto(`/tai-khoan/tra-hang/${returnId}`);
  await expect(customer.getByText('Đã hoàn tiền').first()).toBeVisible();
  await customer.goto('/tai-khoan/tra-hang');
  const card = customer.getByRole('listitem').filter({ hasText: orderCode });
  await expect(card).toContainText('Đã hoàn tiền');
  await expect(card).toContainText('Đã hoàn:');

  await Promise.all([customerContext.close(), adminContext.close()]);
});
