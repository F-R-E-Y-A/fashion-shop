---
title: Shipping — chính sách phí, GHN Sandbox và dự phòng mô phỏng
updated: 2026-11-20
status: đã tích hợp GHN Sandbox và dự phòng mô phỏng
owner: Duy
---
# Phí vận chuyển và vận đơn

**Chức năng:** Chính sách tính phí giao hàng, tích hợp tạo và đồng bộ vận đơn GHN Sandbox kèm dự phòng mô phỏng nội bộ.

## 1. Tính phí giao hàng (Quote)

Seed tạo zone nội địa và rate 30.000đ cho xã/phường hoạt động; chạy lại không ghi đè rate đã chỉnh. `ShippingService` đọc zone/rate hoạt động; miễn ship khi tiền hàng sau giảm giá đạt 500.000đ. Địa chỉ thiếu rate bị chặn với HTTP 422 ([shipping.seed.ts](../../../apps/api/prisma/seed/shipping.seed.ts), [shipping.service.ts](../../../apps/api/src/modules/shipping/shipping.service.ts)).

## 2. Tạo vận đơn GHN Sandbox & Dự phòng mô phỏng (`AUTO` / `GHN` / `MOCK`)

Kiến trúc cổng vận chuyển tách interface `ShippingCarrierGateway` ([shipping-carrier.ts](../../../apps/api/src/modules/shipping/shipping-carrier.ts)) gồm `GhnCarrierGateway` ([ghn.carrier.ts](../../../apps/api/src/modules/shipping/ghn.carrier.ts)) và `MockCarrierGateway` ([mock.carrier.ts](../../../apps/api/src/modules/shipping/mock.carrier.ts)):

1. **Tạo vận đơn thật trên GHN Sandbox (`dev-online-gateway.ghn.vn`)**: Khi có `GHN_TOKEN` và `GHN_SHOP_ID`, `ShippingService` chạy quy trình 2 pha để tránh xung đột với hủy đơn/hoàn tiền hoặc bấm tạo trùng:
   - **Pha 1 (dưới khóa `OrdersService.lock`)**: chuyển đơn `CONFIRMED` → `PROCESSING` (khóa luồng khách tự hủy/hoàn tiền) và ghi nhận intent `Shipment` (`isMock: false, trackingNumber: null, carrierStatus: 'creating'`) trước khi gọi HTTP ra ngoài.
   - **Gọi GHN ngoài transaction**: `GhnCarrierGateway` giải địa chỉ 2 cấp qua Master Data v3 (`/v3/master-data/province/all` và `/ward/all-by-province-id`, cache 60 phút), gửi `POST /v2/shipping-order/create` với `is_new_to_address: true`, `cod_amount`, và danh sách sản phẩm mà không giữ kết nối/lock DB.
   - **Pha 2 (dưới khóa `OrdersService.lock`)**: cập nhật mã vận đơn thật (hoặc áp dụng trạng thái khôi phục nếu khác `PENDING`), chuyển sang mô phỏng nếu GHN xác nhận chưa tạo đơn (`mode = 'AUTO'`), đánh dấu `create_uncertain` nếu chưa xác minh được (`503`), hoặc hoàn tác intent nếu `mode = 'GHN'` bị GHN từ chối rõ ràng.
2. **Dự phòng mô phỏng (`isMock: true`) và xử lý vận đơn GHN bị hủy trước khi lấy hàng (`cancel`)**:
   - Với `mode = 'AUTO'` (mặc định trên nút `Tạo vận đơn GHN (Sandbox)`): nếu `createOrder` gặp lỗi/timeout, hệ thống tra cứu lại qua `/v2/shipping-order/detail-by-client-code` bằng `client_order_code` để khôi phục vận đơn GHN thật nếu GHN đã kịp tạo (kể cả khi GHN đã chuyển sang `IN_TRANSIT`/`DELIVERED`/`FAILED`/`RETURNED`, áp dụng đồng bộ trạng thái đơn/COD/kho trong cùng giao dịch). Phản hồi HTTP 200 nhưng body không phải JSON hoặc thiếu `data`/`order_code`, hay trang 404 không có envelope JSON hợp lệ đều bị ném `503` (ghi `create_uncertain`, chặn `MOCK` cho đến khi đối soát lại); chỉ tự động rơi về `MockCarrierGateway` (`GHN-SBX-...`, `fallbackUsed: true`) khi GHN xác nhận rõ không tìm thấy đơn (`code_message` nhóm `ORDER_NOT_FOUND`, `ghnCode: 404`, hoặc thông báo không tìm thấy đơn — không coi mọi `HTTP 400` như `CLIENT_NOT_OWNER_OF_SHOP` là không tìm thấy).
   - Với `mode = 'MOCK'` (nút `Tạo vận đơn mô phỏng (Dự phòng)`): tạo thẳng mã mô phỏng nội bộ mà không gọi GHN; bị chặn `409` dưới khóa đơn nếu đơn đã có vận đơn GHN thật (`isMock === false`, gồm cả đang `creating`/`create_uncertain`), trừ trường hợp GHN đã hủy vận đơn trước khi lấy hàng (`FAILED` + `carrierStatus === 'cancel'` + `order.status === 'PROCESSING'`).
   - Với `mode = 'GHN'`: bắt buộc gọi GHN Sandbox và báo `503 ServiceUnavailableException` nếu chưa cấu hình hoặc GHN từ chối (dọn/khôi phục intent nếu GHN xác nhận chưa tạo đơn).
   - **Khi GHN hủy vận đơn trước lúc lấy hàng (`cancel`, hàng còn tại kho, đơn đang `PROCESSING`)**: admin có thể chọn **tạo vận đơn thay thế** (GHN dùng `client_order_code` hậu tố `-Rxxxx` để không trùng mã đơn cũ trên GHN, hoặc tạo mô phỏng) hoặc **chốt hủy đơn COD & hoàn kho** qua `POST /admin/orders/:id/delivery-failed` sau khi xác nhận hàng vẫn còn ở kho.
3. **Đồng bộ & Webhook nhận trạng thái từ GHN**:
   - Webhook trực tiếp GHN: `POST /api/shipping/webhook/ghn` ([shipment-webhook.controller.ts](../../../apps/api/src/modules/shipping/shipment-webhook.controller.ts)), xác thực `SHIPPING_WEBHOOK_SECRET` qua `x-carrier-token`, header `token`, hoặc query `?token=`, kiểm tra `ShopID` khớp cấu hình, đối chiếu `isMock === false` và khớp `trackingNumber` trong cùng khóa giao dịch, ánh xạ 20+ mã trạng thái GHN ([ghn-status.map.ts](../../../apps/api/src/modules/shipping/ghn-status.map.ts)) sang 5 trạng thái nội bộ (`PENDING` gồm `ready_to_pick`/`picking`, `IN_TRANSIT` từ `picked` trở đi, `DELIVERED`, `FAILED` gồm `delivery_fail`/`waiting_to_return`/`scrap`/`cancel`, và chỉ `returned` mới sang `RETURNED`).
   - Đồng bộ chủ động từ Admin: `POST /api/admin/orders/:id/shipment/sync` gọi `/v2/shipping-order/detail` để kéo trạng thái mới nhất khi webhook sandbox không tới được localhost.
4. **Bảo vệ toàn vẹn, thứ tự sự kiện và thông báo**:
   - Khóa `OrdersService.lock` đầu giao dịch; chặn thao tác mô phỏng (`PATCH /shipment/status`) và chặn cả hai route chốt thủ công cũ (`POST /admin/orders/:id/delivered`, `POST /admin/orders/:id/delivery-failed`) trên đơn đã có vận đơn GHN thật (`isMock === false`); lưu mốc `carrier_updated_at` (`Time`/`updated_date`) kết hợp kiểm tra đổi dòng `updatedAt` khi đồng bộ để chặn sự kiện/sync cũ ghi đè trạng thái mới hơn (đặc biệt trên cạnh giao lại `FAILED` → `IN_TRANSIT`/`DELIVERED`).
   - Cho phép cập nhật sub-status nội bộ (`ready_to_pick` → `picking` trong `PENDING`, `picked` → `delivering` trong `IN_TRANSIT`) và giao lại `FAILED` → `IN_TRANSIT`/`DELIVERED` khi sự kiện mới hơn và đơn chưa `CANCELLED`.
   - `IN_TRANSIT` → `Order.SHIPPED` · `DELIVERED` → `Order.DELIVERED` + chốt thu COD (`COD:<orderCode>:<uuid>`) · `FAILED` → giữ nguyên đơn, gửi `notifyShipmentFailed` (In-App + Email), không tự cộng kho · `RETURNED` → hoàn tồn kho (`InventoryService.restock`) + ghi `COD-FAILED` + trả lượt voucher + `Order.CANCELLED` (`cancelSource: 'DELIVERY_FAILED'`) cho đơn COD, hoặc giữ đơn và nhắc hoàn tiền cho đơn trả trước.
5. **Giao diện khách hàng & quản trị**:
   - Khách (`/don-hang/:id`, [OrderPage.tsx](../../../apps/web/src/features/checkout/OrderPage.tsx)): hiển thị rõ `(Thử nghiệm GHN)` kèm link tra cứu `https://donhang.ghn.vn/?order_code=...`, ghi chú trạng thái mới nhất và thời gian dự kiến giao khi `isMock === false`; giữ nhãn `(Mô phỏng Sandbox)` khi `isMock === true`.
   - Admin (`/admin/orders/:id`, [AdminOrderDetailPage.tsx](../../../apps/web/src/features/checkout/admin/AdminOrderDetailPage.tsx)): hiển thị nút tạo GHN Sandbox, nút tạo dự phòng mô phỏng; vận đơn thật (`isMock === false`) chỉ hiện nút `Đồng bộ từ GHN` (ẩn toàn bộ nút mô phỏng và nút chốt giao/giao thất bại thủ công cũ), còn vận đơn mô phỏng (`isMock !== false`) hiện các nút mô phỏng fallback.

[Nhật ký](LOG.md) · [ADR-032](../../LOG.md#adr-032) · [ADR-070](LOG.md#adr-070).
