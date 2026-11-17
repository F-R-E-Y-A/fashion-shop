---
title: Shipping — chính sách phí, GHN Sandbox và dự phòng mô phỏng
updated: 2026-11-16
status: đã tích hợp GHN Sandbox và dự phòng mô phỏng
owner: Duy
---
# Phí vận chuyển và vận đơn

**Chức năng:** Chính sách tính phí giao hàng, tích hợp tạo và đồng bộ vận đơn GHN Sandbox kèm dự phòng mô phỏng nội bộ.

## 1. Tính phí giao hàng (Quote)

Seed tạo zone nội địa và rate 30.000đ cho xã/phường hoạt động; chạy lại không ghi đè rate đã chỉnh. `ShippingService` đọc zone/rate hoạt động; miễn ship khi tiền hàng sau giảm giá đạt 500.000đ. Địa chỉ thiếu rate bị chặn với HTTP 422 ([shipping.seed.ts](../../../apps/api/prisma/seed/shipping.seed.ts), [shipping.service.ts](../../../apps/api/src/modules/shipping/shipping.service.ts)).

## 2. Tạo vận đơn GHN Sandbox & Dự phòng mô phỏng (`AUTO` / `GHN` / `MOCK`)

Kiến trúc cổng vận chuyển tách interface `ShippingCarrierGateway` ([shipping-carrier.ts](../../../apps/api/src/modules/shipping/shipping-carrier.ts)) gồm `GhnCarrierGateway` ([ghn.carrier.ts](../../../apps/api/src/modules/shipping/ghn.carrier.ts)) và `MockCarrierGateway` ([mock.carrier.ts](../../../apps/api/src/modules/shipping/mock.carrier.ts)):

1. **Tạo vận đơn thật trên GHN Sandbox (`dev-online-gateway.ghn.vn`)**: Khi có `GHN_TOKEN` và `GHN_SHOP_ID`, `GhnCarrierGateway` giải địa chỉ 2 cấp qua Master Data v3 (`/v3/master-data/province/all` và `/ward/all-by-province-id`, cache 60 phút), gửi `POST /v2/shipping-order/create` với `is_new_to_address: true`, `cod_amount`, và danh sách sản phẩm **bên ngoài database transaction** để không giữ lock kết nối khi gọi HTTP.
2. **Dự phòng mô phỏng (`isMock: true`)**:
   - Với `mode = 'AUTO'` (mặc định trên nút `Tạo vận đơn GHN (Sandbox)`): nếu thiếu cấu hình GHN hoặc GHN Sandbox gặp sự cố kết nối/lỗi, hệ thống ghi log cảnh báo và tự động rơi về `MockCarrierGateway` (`GHN-SBX-...`, `fallbackUsed: true`, kèm `fallbackReason` hiển thị cho admin).
   - Với `mode = 'MOCK'` (nút `Tạo vận đơn mô phỏng (Dự phòng)`): tạo thẳng mã mô phỏng nội bộ mà không gọi GHN.
   - Với `mode = 'GHN'`: bắt buộc gọi GHN Sandbox và báo `503 ServiceUnavailableException` nếu chưa cấu hình hoặc GHN từ chối.
3. **Đồng bộ & Webhook nhận trạng thái từ GHN**:
   - Webhook trực tiếp GHN: `POST /api/shipping/webhook/ghn` ([shipment-webhook.controller.ts](../../../apps/api/src/modules/shipping/shipment-webhook.controller.ts)), xác thực `SHIPPING_WEBHOOK_SECRET` qua `x-carrier-token`, header `token`, hoặc query `?token=`, kiểm tra `ShopID` khớp cấu hình, ánh xạ 20+ mã trạng thái GHN ([ghn-status.map.ts](../../../apps/api/src/modules/shipping/ghn-status.map.ts)) sang 5 trạng thái nội bộ (`PENDING`, `IN_TRANSIT`, `DELIVERED`, `FAILED`, `RETURNED`).
   - Đồng bộ chủ động từ Admin: `POST /api/admin/orders/:id/shipment/sync` gọi `/v2/shipping-order/detail` để kéo trạng thái mới nhất khi webhook sandbox không tới được localhost.
4. **Bảo vệ toàn vẹn, ma trận trạng thái và thông báo**:
   - Khóa `OrdersService.lock` đầu giao dịch; cho phép cập nhật sub-status nội bộ (`carrierStatus`, `statusNote`) dù cùng nhóm trạng thái (ví dụ `picking` → `delivering` đều thuộc `IN_TRANSIT`); chặn lùi trạng thái (`canTransitionShipment`).
   - `IN_TRANSIT` → `Order.SHIPPED` · `DELIVERED` → `Order.DELIVERED` + chốt thu COD (`COD:<orderCode>:<uuid>`) · `FAILED` → giữ nguyên đơn, gửi `notifyShipmentFailed` (In-App + Email) · `RETURNED` → hoàn tồn kho (`InventoryService.restock`) + ghi `COD-FAILED` + `Order.CANCELLED` (`cancelSource: 'DELIVERY_FAILED'`) cho đơn COD, hoặc giữ đơn và nhắc hoàn tiền cho đơn trả trước.
5. **Giao diện khách hàng & quản trị**:
   - Khách (`/don-hang/:id`, [OrderPage.tsx](../../../apps/web/src/features/checkout/OrderPage.tsx)): hiển thị rõ `(Thử nghiệm GHN)` kèm link tra cứu `https://donhang.ghn.vn/?order_code=...`, ghi chú trạng thái mới nhất và thời gian dự kiến giao khi `isMock === false`; giữ nhãn `(Mô phỏng Sandbox)` khi `isMock === true`.
   - Admin (`/admin/orders/:id`, [AdminOrderDetailPage.tsx](../../../apps/web/src/features/checkout/admin/AdminOrderDetailPage.tsx)): hiển thị nút tạo GHN Sandbox, nút tạo dự phòng mô phỏng, nút `Đồng bộ từ GHN` cho vận đơn thật và các nút mô phỏng fallback.

[Nhật ký](LOG.md) · [ADR-032](../../LOG.md#adr-032) · [ADR-070](LOG.md#adr-070).
