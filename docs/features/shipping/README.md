---
title: Shipping — chính sách phí và vận chuyển
updated: 2026-11-13
status: đã tích hợp vận chuyển và webhook hãng
owner: Duy
---
# Phí vận chuyển và vận đơn

**Chức năng:** Chính sách tính phí giao hàng, tạo vận đơn hãng, webhook nhận trạng thái và theo dõi đơn hàng.

## 1. Tính phí giao hàng (Quote)

Seed tạo zone nội địa và rate 30.000đ cho xã hoạt động; chạy lại không ghi đè rate đã chỉnh. ShippingService đọc zone/rate hoạt động; miễn ship khi tiền hàng sau giảm giá đạt 500.000đ. Địa chỉ thiếu rate bị chặn rõ ràng ([shipping.seed.ts](../../../apps/api/prisma/seed/shipping.seed.ts), [shipping.service.ts](../../../apps/api/src/modules/shipping/shipping.service.ts)).

## 2. Vận đơn và theo dõi giao hàng (Shipment & Tracking)

Luồng vận chuyển mô phỏng Sandbox (Duy - PH-02):
1. **Admin tạo vận đơn**: Admin tạo vận đơn qua `POST /api/admin/orders/:id/shipment`, nhận mã vận đơn mô phỏng `GHN-SBX-...` (`isMock: true`).
2. **Shipper giao hàng**: Shipper / hệ thống đối tác mô phỏng gửi cập nhật qua webhook.
3. **Webhook cập nhật**: Endpoint `POST /api/shipping/webhook` yêu cầu xác thực header bí mật `x-carrier-token` cấu hình qua biến môi trường server `SHIPPING_WEBHOOK_SECRET` (từ chối 401 nếu thiếu cấu hình hoặc sai token; không dùng secret mặc định). Các nút mô phỏng trên trang Admin gọi trực tiếp endpoint `PATCH /api/admin/orders/:id/shipment/status` để bảo mật, không để lộ token xác thực ở frontend. Tách danh tính hãng khỏi `actorUserId` (chỉ ghi nhận UUID của người dùng trong hệ thống; webhook lưu `undefined` để tránh lỗi cú pháp UUID).
4. **Bảo vệ toàn vẹn và ma trận chuyển trạng thái**: Chặn cập nhật vận chuyển nếu đơn hàng đã bị hủy (`CANCELLED`). Kiểm tra bước chuyển hợp lệ `canTransitionShipment`, chặn lùi trạng thái khi nhận sự kiện cũ/đến muộn (ví dụ đơn đã `DELIVERED` không bị lùi về `IN_TRANSIT`), xử lý sự kiện trùng lặp dạng idempotent.
5. **Đồng bộ trạng thái**:
   - `IN_TRANSIT` -> Đơn chuyển `SHIPPED`
   - `DELIVERED` -> Đơn chuyển `DELIVERED`, tự động chốt thanh toán COD với receipt chuẩn `COD:<orderCode>:<uuid>` (tương thích module Báo cáo tài chính Reporting #112)
   - `FAILED` / `RETURNED` -> Đơn chuyển `CANCELLED`, hoàn tồn kho qua `InventoryService.restock()`, ghi nhận thanh toán `COD-FAILED:<orderCode>`
6. **Khách theo dõi**: Trang chi tiết đơn hàng (`/don-hang/:id`) hiển thị timeline 4 bước: Shop xác nhận -> Đơn vị vận chuyển đã lấy hàng -> Đang giao đến bạn -> Giao thành công, hiển thị nhãn Sandbox rõ ràng thay vì link sang trang hãng thật gây 404.

[Nhật ký](LOG.md) · [ADR-032](../../LOG.md#adr-032).
