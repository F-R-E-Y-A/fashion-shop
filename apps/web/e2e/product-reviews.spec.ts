import { expect, test } from '@playwright/test';

import { fixture, login } from './fixture.js';

/**
 * E2E (Issue #96 - Customer Reviews & Public List):
 * 1. Khách đặt hàng COD, Admin xác nhận và giao hàng thành công (DELIVERED).
 * 2. Khách mở trang chi tiết đơn hàng (/don-hang/:id):
 *    - Bấm nút "Viết đánh giá" để mở form.
 *    - Thấy form đánh giá sản phẩm đủ điểm sao (1..5), bộ đếm ký tự (0/2000).
 *    - Chọn 5 sao và nhập nội dung nhận xét.
 *    - Gửi đánh giá thành công: form chuyển sang hiển thị "Đang chờ duyệt", điểm sao và nội dung đã gửi.
 * 3. Kiểm tra hiển thị responsive ở cả desktop (1280px) và mobile (360px).
 * 4. Khách mở trang chi tiết sản phẩm (/san-pham/:slug):
 *    - Thấy khu vực "Đánh giá của khách hàng".
 *    - Thấy trạng thái trống "Chưa có đánh giá được duyệt" (vì review còn PENDING chưa được duyệt).
 *    - Bảo đảm đánh giá chưa duyệt không rò rỉ ra public.
 */
test('E2E Issue #96: Khách gửi đánh giá đơn đã giao và kiểm tra danh sách public trên desktop & mobile', async ({
  browser,
}, testInfo) => {
  const fx = fixture();
  const { slug, color, size } = fx.product;
  const productUrl = `/san-pham/${slug}?color=${color}&size=${size}`;

  // 1. Khách đặt hàng COD
  const customerContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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

  // 2. Admin giao hàng thành công
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

  // 3. Khách tải lại đơn hàng - Kiểm tra ở Desktop (1280px)
  await customer.reload();
  await expect(customer.getByRole('heading', { name: 'Đã giao hàng' })).toBeVisible();

  // Bấm nút "Viết đánh giá" để mở form
  const openReviewBtn = customer.getByRole('button', { name: 'Viết đánh giá' });
  await expect(openReviewBtn).toBeVisible();
  await openReviewBtn.click();

  // Kiểm tra khu vực đánh giá xuất hiện
  await expect(customer.getByText('Điểm đánh giá (1 đến 5 sao)')).toBeVisible();
  const reviewTextarea = customer.getByPlaceholder('Chia sẻ trải nghiệm sử dụng sản phẩm...');
  await expect(reviewTextarea).toBeVisible();
  await expect(customer.getByText('0/2000 ký tự')).toBeVisible();

  // Đổi sang mobile viewport 360px để kiểm tra responsive
  await customer.setViewportSize({ width: 360, height: 640 });
  await expect(customer.getByText('Điểm đánh giá (1 đến 5 sao)')).toBeVisible();
  await expect(reviewTextarea).toBeVisible();
  const mobileScreenshot = await customer.screenshot({
    path: testInfo.outputPath('screenshot-order-review-mobile-360.png'),
    fullPage: true,
  });
  await testInfo.attach('screenshot-order-review-mobile-360', {
    body: mobileScreenshot,
    contentType: 'image/png',
  });

  // Đổi lại desktop viewport 1280px
  await customer.setViewportSize({ width: 1280, height: 720 });
  const form1280Screenshot = await customer.screenshot({
    path: testInfo.outputPath('screenshot-order-review-form-1280.png'),
    fullPage: true,
  });
  await testInfo.attach('screenshot-order-review-form-1280', {
    body: form1280Screenshot,
    contentType: 'image/png',
  });

  // Chọn 5 sao và nhập nội dung
  await customer.getByRole('radio', { name: '5 sao' }).check();
  await reviewTextarea.fill('Sản phẩm mặc rất vừa vặn, vải thoáng mát và đẹp!');
  await expect(customer.getByText('48/2000 ký tự')).toBeVisible();

  // Gửi đánh giá
  const submitBtn = customer.getByRole('button', { name: 'Gửi đánh giá' });
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();

  // Sau khi gửi: Thấy thông báo chờ duyệt và hiển thị review đã gửi
  await expect(customer.getByText('Đang chờ duyệt')).toBeVisible({ timeout: 10_000 });
  await expect(customer.getByText('5/5 sao')).toBeVisible();
  await expect(
    customer.getByText('Sản phẩm mặc rất vừa vặn, vải thoáng mát và đẹp!'),
  ).toBeVisible();
  const submittedScreenshot = await customer.screenshot({
    path: testInfo.outputPath('screenshot-order-review-submitted.png'),
    fullPage: true,
  });
  await testInfo.attach('screenshot-order-review-submitted', {
    body: submittedScreenshot,
    contentType: 'image/png',
  });

  // 4. Mở trang chi tiết sản phẩm xem danh sách công khai
  await customer.goto(productUrl);
  await expect(customer.getByRole('heading', { name: 'Đánh giá của khách hàng' })).toBeVisible();

  // Đánh giá đang ở trạng thái PENDING nên công khai hiển thị "Chưa có đánh giá được duyệt"
  await expect(customer.getByText('Chưa có đánh giá được duyệt')).toBeVisible();
  const publicScreenshot = await customer.screenshot({
    path: testInfo.outputPath('screenshot-product-reviews-public.png'),
    fullPage: true,
  });
  await testInfo.attach('screenshot-product-reviews-public', {
    body: publicScreenshot,
    contentType: 'image/png',
  });

  // Dọn dẹp context
  await customerContext.close();
  await adminContext.close();
});
