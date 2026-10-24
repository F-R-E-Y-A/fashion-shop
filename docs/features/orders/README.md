---
title: Orders — snapshot và vòng đời thanh toán
updated: 2026-10-18
status: phục vụ checkout PH-11, chưa có quản trị giao vận
owner: Duy
---
# Đơn hàng

**Chức năng:** Phạm vi ghi đơn hàng, snapshot và trạng thái trước/sau thanh toán.

OrdersService sở hữu Order, OrderItem, OrderStatusHistory; public contract ở [README module](../../../apps/api/src/modules/orders/README.md). Đơn tạo bằng checkout có snapshot địa chỉ, tên/biến thể/giá và tiền ship; không đọc lại giá hiện tại để sửa đơn đã tạo ([orders.service.ts:71](../../../apps/api/src/modules/orders/orders.service.ts#L71)).

| Trạng thái | Ý nghĩa của luồng PH-11 |
|---|---|
| PENDING_PAYMENT | Chờ cổng xác nhận; deadline cố định |
| CONFIRMED | Có tiền và đã chốt kho bằng hold hợp lệ |
| CANCELLED | Hủy hoặc hết hạn; giữ dòng hàng trong giỏ |
| PAYMENT_REVIEW | Có tiền nhưng hold không còn hợp lệ hoặc trả nhiều lần; cần shop xử lý |

Xem đơn/danh sách và các thao tác trong [Checkout](../checkout/README.md), Swagger `/api/docs`. Mọi endpoint khách kiểm principal; không có endpoint khách tự đặt trạng thái paid. Danh sách hiện trả tối đa 50 đơn mới nhất ([orders.service.ts:62](../../../apps/api/src/modules/orders/orders.service.ts#L62)). Giao vận, dashboard shop và refund tự động chưa triển khai.

[Nhật ký](LOG.md) · [ADR-027](../../LOG.md#adr-027).
