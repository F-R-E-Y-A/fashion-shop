# Phân hệ Thông báo (Notifications Module)

**Chức năng:** Quản lý thông báo in-app, phát thông báo thời gian thực qua Server-Sent Events (SSE) và gửi email giao dịch đa mốc đơn hàng/vận chuyển cho khách hàng và quản trị viên.

## Hợp đồng với các phân hệ khác

Được công bố qua `apps/api/src/modules/notifications/index.ts`:

| Hàm | Mục đích | Phân hệ gọi |
|---|---|---|
| `handleOrderStatusChange(order, newStatus, previousStatus?, context?)` | Gửi email giao dịch kèm link đầy đủ (`WEB_PUBLIC_URL`), tạo thông báo in-app và SSE cho khách và admin theo ngữ cảnh (`OrderStatusNotificationContext`) | Orders, Checkout, Settlement, Shipping |
| `notifyShipmentCreated(order, shipment)` | Thông báo cho khách khi shop vừa gắn mã vận đơn cho đơn đang `PROCESSING` | Shipping |
| `notifyShipmentFailed(info)` | Thông báo cho cả khách hàng và admin khi vận đơn gặp sự cố `FAILED` hoặc hoàn kho `RETURNED` (đơn trả trước) | Shipping |
| `create(input)` | Tạo thông báo in-app và đẩy sự kiện realtime qua SSE | Bất kỳ phân hệ nghiệp vụ nào |
| `listUser(userId, query)` | Lấy danh sách thông báo của tài khoản | Storefront, Account |
| `listAdmin(query)` | Lấy danh sách thông báo quản trị | Admin |
| `userStream(userId)` | Cung cấp luồng SSE realtime cho người dùng | Storefront, Web Client |
| `adminStream()` | Cung cấp luồng SSE realtime cho quản trị viên | Admin Dashboard |

[Tài liệu chi tiết và ma trận bước/nội dung/kênh](../../../../../docs/features/notifications/README.md) · [ADR-072](../../../../../docs/features/notifications/LOG.md#adr-072).
