# Shipping — hợp đồng public

Import `ShippingModule`/`ShippingService` qua `index.ts`.

- `quote(areaId, subtotalAfterDiscount, tx?)`: trả `{ rateId, fee }` dạng string Decimal (`0.00` khi đơn từ 500.000đ trở lên; chỉ nhận `areaId` đã được Users kiểm tra).
- `getCarrierConfig()`: trả cấu hình kết nối GHN Sandbox (`ghnConfigured`, `mode: 'GHN_SANDBOX' | 'MOCK_ONLY'`).
- `createShipment(orderId, dto, actorUserId?)`: tạo vận đơn theo `mode` (`AUTO` ưu tiên GHN Sandbox và tự dự phòng mô phỏng khi lỗi, `GHN` bắt buộc cổng GHN, `MOCK` mô phỏng `GHN-SBX-...`), chuyển đơn `CONFIRMED` → `PROCESSING` hoặc gửi `notifyShipmentCreated` nếu đã `PROCESSING`.
- `syncShipmentFromCarrier(orderId, actorUserId?)`: truy vấn trạng thái thực tế từ GHN Sandbox (`POST/GET /v2/shipping-order/detail`) và đồng bộ `Shipment`/`Order`.
- `updateShipmentStatus(orderId, status, actorUserId?, note?, meta?)`: cập nhật trạng thái vận đơn, giữ khóa `OrdersService.lock`, đồng bộ `Order`/`Payment`/`Inventory`/`Notifications`.
- `handleGhnWebhook(rawPayload)` & `handleWebhook(payload)`: xử lý callback từ GHN (`POST /api/shipping/webhook/ghn`) hoặc webhook nội bộ (`POST /api/shipping/webhook`), bảo vệ idempotency và chặn lùi trạng thái.

[Chính sách và luồng nghiệp vụ](../../../../../docs/features/shipping/README.md) · [ADR-032](../../../../../docs/LOG.md#adr-032) · [ADR-070](../../../../../docs/features/shipping/LOG.md#adr-070).
