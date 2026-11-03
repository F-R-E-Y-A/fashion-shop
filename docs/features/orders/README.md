---
title: Orders — snapshot và vòng đời thanh toán
updated: 2026-11-03
status: phục vụ checkout PH-11, chưa có quản trị giao vận
owner: Duy
---
# Đơn hàng

**Chức năng:** Phạm vi ghi đơn hàng, snapshot và trạng thái trước/sau thanh toán.

OrdersService sở hữu Order, OrderItem, OrderStatusHistory; public contract ở [README module](../../../apps/api/src/modules/orders/README.md). Đơn tạo bằng checkout có snapshot địa chỉ, tên/biến thể/giá và tiền ship; không đọc lại giá hiện tại để sửa đơn đã tạo ([orders.service.ts:171](../../../apps/api/src/modules/orders/orders.service.ts#L171)).

| Trạng thái | Ý nghĩa của luồng PH-11 |
|---|---|
| PENDING_PAYMENT | Chờ cổng xác nhận; deadline cố định |
| CONFIRMED | Có tiền và đã chốt kho bằng hold hợp lệ |
| CANCELLED | Hủy hoặc hết hạn; giữ dòng hàng trong giỏ |
| PAYMENT_REVIEW | Có tiền nhưng hold không còn hợp lệ hoặc trả nhiều lần; cần shop xử lý |
| PENDING_CONFIRMATION | COD chờ shop gọi xác nhận; giữ hàng 3 ngày |
| PROCESSING | Shop đang chuẩn bị/giao; COD đã chốt kho, chưa thu tiền; khách hết tự hủy |
| DELIVERED | Đã giao; COD ghi tiền mặt lúc này |
| PARTIALLY_REFUNDED, REFUNDED | Theo tổng sổ hoàn của thanh toán |

Xem đơn/danh sách và các thao tác trong [Checkout](../checkout/README.md), Swagger `/api/docs`. Mọi endpoint khách kiểm principal; không có endpoint khách tự đặt trạng thái paid. Danh sách hiện trả tối đa 50 đơn mới nhất ([orders.service.ts:121](../../../apps/api/src/modules/orders/orders.service.ts#L121)). ADMIN xem mọi đơn và bấm các bước tay ở `/admin/orders` ([ADR-038](../../LOG.md#adr-038)); bảng bước thêm `PENDING_CONFIRMATION → PROCESSING`, `PROCESSING → DELIVERED/CANCELLED`, `SHIPPED → CANCELLED`, `CONFIRMED → CANCELLED`, `CANCELLED → (PARTIALLY_)REFUNDED` ([orders.service.ts:40](../../../apps/api/src/modules/orders/orders.service.ts#L40)) — Duy cần duyệt. Chưa nối hãng vận chuyển: `SHIPPED` chưa ai ghi.

[Nhật ký](LOG.md) · [ADR-032](../../LOG.md#adr-032).


## Điều hướng quản trị — Issue #61

[Đặc tả phần điều hướng UC-12.1](use-cases.md) đang đề xuất, chờ Duy thống nhất mã/AC với PR #26.
URL/Back/Forward/chi tiết và phục hồi trang rỗng được kiểm trong Checkout web; không thêm nghiệp vụ giao vận
hay đổi quyền ghi OrdersService. README Checkout giữ trạng thái triển khai; minh chứng ở kho docs.
