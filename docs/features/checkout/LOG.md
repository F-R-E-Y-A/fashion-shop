---
title: Checkout — nhật ký
updated: 2026-10-30
status: đang dùng
owner: Bảo
---
# Checkout — nhật ký

**Chức năng:** Ghi thay đổi của luồng checkout; quyết định liên module nằm trong LOG chung.

## 2026-10-18 · PH-11 — xác nhận mua và giữ hàng khi sang payment

**Loại:** thay đổi mã · **Phạm vi:** Checkout API/web · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Bảo yêu cầu làm toàn bộ luồng và cho phép hoàn thiện bằng cổng giả lập trên DB riêng khi chưa có VNPAY sandbox key. Chọn Checkout làm orchestrator để tránh vòng phụ thuộc Orders–Payments và giữ mọi ghi dữ liệu qua service sở hữu bảng. Quyết định, các lựa chọn và trade-off ở [ADR-032](../../LOG.md#adr-032).

Fingerprint buộc xác nhận lại khi giá/địa chỉ/giỏ/ship đổi; idempotency buộc retry HTTP dùng lại đơn. Không giữ transaction mở trong thời gian khách thao tác trên cổng. Test lỗi sau trừ kho kiểm rollback cả payment, lịch sử, kho và giỏ ([checkout-payment.http.spec.ts](../../../apps/api/test/checkout-payment.http.spec.ts)). Trạng thái hôm nay và giới hạn ở [README](README.md).

## 2026-10-18 · PH-11 — return chủ động đối soát và ưu tiên VNPAY

**Loại:** sửa giao diện · **Phạm vi:** Checkout/web · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Theo phạm vi mới của Bảo, ẩn MoMo chưa cấu hình. Return chỉ dùng reference để đọc đơn có ownership, sau đó yêu cầu backend đối soát một lần; query string báo hủy/thành công không quyết định tài chính. Payment link chỉ lấy attempt mới nhất còn pending để tránh mở attempt cũ. [Web tests](../../../apps/web/src/features/checkout/checkout.test.tsx) kiểm lựa chọn VNPAY, retry và return mâu thuẫn với kết quả server.

## 2026-10-20 · PH-11 — giao diện checkout/đơn theo khung giỏ, mã đơn ngắn, sửa hai đường cụt

**Loại:** sửa giao diện · **Phạm vi:** Checkout web, Orders, Cart · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Kiểm trên Chrome (1366 và 390 px, DB E2E riêng) thấy ba trang checkout, kết quả đơn và danh sách đơn chưa theo token, mã đơn dài 34 ký tự tràn khung trên mobile, danh sách đơn nằm ngoài khu tài khoản. Viết lại ba trang theo khung trang giỏ (hai cột, thẻ trắng, tóm tắt espresso, nút amber); danh sách đơn thành tab `/tai-khoan/don-hang`, menu avatar thêm "Đơn hàng của tôi". Mã đơn mới 16 ký tự ([newOrderCode](../../../apps/api/src/modules/orders/orders.service.ts#L16)). Lúc kiểm lộ ra hai đường cụt khi giữ đơn vị cuối, xử lý theo [ADR-035](../../LOG.md#adr-035). Kèm: trang 404 và trạng thái chờ phiên có khung riêng, chữ COD sai trên trang đăng nhập đổi sang VNPAY.

## 2026-10-30 · PH-11 — pool kết nối cấu hình được, chỉ mục giữ hàng theo biến thể, giới hạn tạo đơn

**Loại:** thay đổi mã và cấu hình · **Phạm vi:** Checkout, Inventory, hạ tầng Prisma · **Commit:** (điền khi commit trên nhánh `feature/ph-11-hardening`)

Việc 5 trong kế hoạch chịu tải 1000 khách. Pool `pg` trước đây không cấu hình: mặc định 10 kết nối mỗi process (`node_modules/pg/lib/defaults.js:42`) và chờ kết nối không giới hạn, trong khi transaction tạo đơn giữ kết nối tới 15 giây. Nay `DATABASE_POOL_MAX` và `DATABASE_POOL_TIMEOUT_MS` (mặc định 10 và 10000 ms) đi qua [connection.ts](../../../apps/api/src/infra/prisma/connection.ts); giá trị tối ưu chờ đo bằng k6 (việc 6), không đoán trước.

Đọc tồn khả dụng lọc giữ hàng theo biến thể và hạn, nhưng bảng chỉ có chỉ mục `expires_at` và `order_id`; thêm `(product_variant_id, expires_at)` bằng [migration](../../../apps/api/prisma/migrations/20261030090000_ph11_reservation_variant_index/migration.sql), khai trong schema nên `prisma migrate diff` với DB test vẫn ra migration rỗng. Chưa đo hiệu quả: DB test quá nhỏ để planner chọn chỉ mục.

Giới hạn 10 lần tạo đơn và 20 lần tạo lượt thanh toán mỗi phút mỗi tài khoản, khoá HMAC như gợi ý tìm kiếm. Redis lỗi thì cho qua, vì transaction checkout đã tự chặn đơn trùng và bán vượt. Đây là chặn một tài khoản bắn liên tục, không phải backpressure toàn hệ thống.

Bằng chứng: unit `checkout-rate-limit` 3/3 và `connection` 2/2; HTTP cod (thêm ca 11 lần tạo đơn trả 429) + checkout-payment + checkout-momo + checkout-refund + cart → 5 tệp, 51 test đạt trên DB test.

