---
title: Shipping — chính sách phí ban đầu
updated: 2026-10-18
status: quote nội địa cho checkout PH-11
owner: Duy
---
# Phí vận chuyển

**Chức năng:** Chính sách phí shop thu, dữ liệu biểu phí và phạm vi chưa tích hợp hãng vận chuyển.

Seed tạo zone nội địa và rate 30.000đ cho xã hoạt động; chạy lại không ghi đè rate đã chỉnh. ShippingService đọc zone/rate hoạt động; miễn ship khi tiền hàng sau giảm giá đạt 500.000đ. Địa chỉ thiếu rate bị chặn rõ ràng ([shipping.seed.ts](../../../apps/api/prisma/seed/shipping.seed.ts), [shipping.service.ts:11](../../../apps/api/src/modules/shipping/shipping.service.ts#L11)).

Đây là chính sách Freya được chọn theo uỷ quyền của Bảo, không phải giá cước hoặc deadline nội bộ Shopee. Chưa có API hãng vận chuyển, tính cân nặng, vùng xa hay shipment tracking. Order snapshot phí khi tạo. Public contract ở [README module](../../../apps/api/src/modules/shipping/README.md); luồng ở [Checkout](../checkout/README.md).

[Nhật ký](LOG.md) · [ADR-032](../../LOG.md#adr-032).
