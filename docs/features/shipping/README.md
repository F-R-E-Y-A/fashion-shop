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

Luồng vận chuyển (Duy - PH-02):
1. **Admin tạo vận đơn**: Admin tạo vận đơn trên F.R.E.Y.A qua `POST /api/admin/orders/:id/shipment`, nhận mã vận đơn hãng (GHN/GHTK).
2. **Shipper giao hàng**: Shipper cập nhật trạng thái trên app hãng vận chuyển.
3. **Webhook cập nhật**: Hãng gửi webhook về `POST /api/shipping/webhook` với trạng thái `IN_TRANSIT`, `DELIVERED`, hoặc `FAILED`.
4. **Đồng bộ trạng thái**:
   - `IN_TRANSIT` -> Đơn chuyển `SHIPPED`
   - `DELIVERED` -> Đơn chuyển `DELIVERED`, tự động chốt thanh toán COD nếu có
   - `FAILED` / `RETURNED` -> Đơn chuyển `CANCELLED`, hoàn tồn kho qua `InventoryService.restock()`
5. **Khách theo dõi**: Trang chi tiết đơn hàng (`/don-hang/:id`) hiển thị timeline 4 bước: Shop xác nhận -> Đơn vị vận chuyển đã lấy hàng -> Đang giao đến bạn -> Giao thành công, kèm link tra cứu trên website hãng.

[Nhật ký](LOG.md) · [ADR-032](../../LOG.md#adr-032).
