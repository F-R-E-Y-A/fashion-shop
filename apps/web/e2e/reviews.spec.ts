import { expect, type Locator, type Page, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

/**
 * E2E-08 (PH-01): danh gia di het mot vong qua giao dien that. Khach dat COD, admin giao; trang don
 * moi danh gia; khach viet chu sach o 360 px nen bai hien ngay o trang san pham; admin an kem ly do
 * thi bai roi khoi trang cong khai, khach thay ly do va het nut sua. Luat tung buoc co bai HTTP o
 * apps/api/test/reviews*.http.spec.ts; bai nay kiem cac tang noi voi nhau va bo cuc o 360, 1280 px.
 */

/** Vung nam tron trong be ngang cua khung nhin va khong tran noi dung (khong sinh cuon ngang). */
async function expectFits(page: Page, region: Locator) {
  const width = page.viewportSize()?.width ?? 0;
  const box = await region.boundingBox();
  expect(box, 'vung phai dang hien').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  expect(await region.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

test('E2E-08 UC-11.1/AC1 UC-11.1/AC2 UC-11.3/AC1 UC-11.2/AC3 UC-11.3/AC7 đánh giá: khách viết từ đơn đã giao, hiện ngay ở trang sản phẩm; admin ẩn kèm lý do thì gỡ khỏi trang', async ({
  browser,
}, testInfo) => {
  const fx = fixture();
  const { slug, color, size } = fx.product;
  const productUrl = `/san-pham/${slug}?color=${color}&size=${size}`;
  // Ma rieng tung lan chay de tim dung bai khi --repeat-each; chu thuong va so, khong thanh so dien thoai.
  const token = `ma${Date.now().toString(36)}`;
  const content = `Vải dày, mặc mát, màu đúng như ảnh (${token}).`;
  const reason = 'Nội dung không khớp sản phẩm (kiểm thử E2E).';

  // 1. Khach dat COD, admin xac nhan roi ghi da giao (nhu E2E-07).
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  await login(customer, fx.customer);
  await customer.goto(productUrl);
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

  // 2. Trang don da giao moi danh gia dung so dong con cho cua don nay (UC-11.1/AC1).
  await customer.reload();
  await expect(customer.getByRole('heading', { name: 'Đã giao hàng' })).toBeVisible();
  await customer.getByRole('link', { name: 'Đánh giá 1 sản phẩm' }).click();
  await expect(customer).toHaveURL(new RegExp(`/tai-khoan/danh-gia\\?don=${orderId}$`, 'u'));

  // 3. Viet o 360 px: hop vua khung; chu sach khong anh thi dang ngay (UC-11.1/AC2).
  await customer.setViewportSize({ width: 360, height: 740 });
  await customer
    .getByRole('region', { name: 'Sản phẩm chờ đánh giá' })
    .getByRole('button', { name: 'Viết đánh giá' })
    .click();
  const form = customer.getByRole('dialog', { name: 'Đánh giá sản phẩm' });
  await expect(form).toBeVisible();
  await expectFits(customer, form);
  // O chon sao an di (sr-only), khach bam vao ngoi sao trong nhan.
  await form.locator('label').filter({ hasText: '5 sao' }).click();
  await expect(form.getByRole('radio', { name: /^5 sao/u })).toBeChecked();
  await form.getByRole('button', { name: 'Vừa vặn' }).click();
  await form.getByLabel('Chiều cao (cm)').fill('170');
  await form.getByLabel('Cân nặng (kg)').fill('65');
  await form.getByPlaceholder('Chất liệu, màu sắc, form dáng có đúng mô tả không?').fill(content);
  await testInfo.attach('form-danh-gia-360', {
    body: await customer.screenshot(),
    contentType: 'image/png',
  });
  await form.getByRole('button', { name: 'Gửi đánh giá' }).click();
  await expect(
    customer.getByRole('status').filter({ hasText: 'Đã đăng đánh giá. Cảm ơn bạn!' }),
  ).toBeVisible();
  await expect(form).toHaveCount(0);
  const written = customer.getByRole('region', { name: 'Đánh giá đã viết' });
  const mine = written.getByRole('listitem').filter({ hasText: token });
  await expect(mine.getByText('Đang hiển thị', { exact: true })).toBeVisible();
  await expectFits(customer, written);

  // Don het dong cho: loc theo don ra danh sach rong (UC-11.1/AC1).
  await customer.goto(`/tai-khoan/danh-gia?don=${orderId}`);
  await expect(
    customer.getByText('Không có sản phẩm nào chờ đánh giá.', { exact: false }),
  ).toBeVisible();

  // 4. Khach vang lai thay bai ngay o 1280 va 360 px: ten rut gon, do vua, khong lo email (UC-11.3/AC1).
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(productUrl);
  const section = guest.getByRole('region', { name: 'Đánh giá sản phẩm' });
  // Khu danh gia chi tai khi cuon toi.
  await section.scrollIntoViewIfNeeded();
  const card = section.getByRole('listitem').filter({ hasText: token });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Khach E2E');
  await expect(card).toContainText('Kích cỡ: Vừa vặn');
  await expect(card).toContainText('Cao 170 cm');
  await expect(card).toContainText('Nặng 65 kg');
  await expect(section.getByLabel(/^5 sao: [1-9]\d* đánh giá$/u)).toBeVisible();
  await expect(section).not.toContainText(fx.customer.email);
  await expectFits(guest, section);
  await guest.setViewportSize({ width: 360, height: 740 });
  await expect(card).toBeVisible();
  await expectFits(guest, section);
  await testInfo.attach('khu-danh-gia-360', {
    body: await section.screenshot(),
    contentType: 'image/png',
  });

  // 5. Admin an kem ly do (UC-11.2/AC3).
  await admin.goto('/admin/reviews');
  await admin.getByRole('tab', { name: 'Đang hiển thị' }).click();
  await admin.getByPlaceholder('Nội dung, email khách, tên sản phẩm').fill(token);
  await admin.getByRole('button', { name: 'Tìm', exact: true }).click();
  await admin
    .getByRole('listitem')
    .filter({ hasText: token })
    .getByRole('button', { name: 'Ẩn', exact: true })
    .click();
  const hide = admin.getByRole('dialog', { name: 'Ẩn đánh giá' });
  await hide.getByLabel('Lý do ẩn (khách sẽ thấy)').fill(reason);
  await hide.getByRole('button', { name: 'Ẩn đánh giá' }).click();
  await expect(admin.getByRole('status').filter({ hasText: 'Đã ẩn đánh giá.' })).toBeVisible();

  // 6. Bai duy nhat vua bi an: trang cong khai ve trang thai trong (UC-11.3/AC7).
  await guest.setViewportSize({ width: 1280, height: 720 });
  await guest.reload();
  await section.scrollIntoViewIfNeeded();
  await expect(
    section.getByText('Chưa có đánh giá nào. Khách đã nhận hàng có thể đánh giá trong 30 ngày.'),
  ).toBeVisible();
  await expect(section).not.toContainText(token);

  // Khach thay bai da an kem ly do, khong con nut sua (UC-11.2/AC3).
  await customer.goto('/tai-khoan/danh-gia?tab=da-danh-gia');
  const rejected = customer
    .getByRole('region', { name: 'Đánh giá đã viết' })
    .getByRole('listitem')
    .filter({ hasText: token });
  await expect(rejected.getByText('Đã ẩn', { exact: true })).toBeVisible();
  await expect(rejected).toContainText(`Lý do ẩn: ${reason}`);
  await expect(rejected.getByRole('button', { name: /^Sửa/u })).toHaveCount(0);

  await Promise.all([customerContext.close(), adminContext.close(), guestContext.close()]);
});
