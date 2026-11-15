# Phân hệ Thông báo (Notifications Module)

**Chức năng:** Quản lý thông báo in-app, phát thông báo thời gian thực qua Server-Sent Events (SSE) và gửi email cập nhật trạng thái đơn hàng cho khách hàng và quản trị viên.

## Hợp đồng với các phân hệ khác

Được công bố qua `apps/api/src/modules/notifications/index.ts`:

| Hàm | Mục đích | Phân hệ gọi |
|---|---|---|
| `handleOrderStatusChange(order, newStatus, previousStatus?)` | Gửi email thông báo cho khách, tạo thông báo in-app cho khách và admin | Orders, Checkout, Settlement |
| `create(input)` | Tạo thông báo in-app và đẩy sự kiện realtime qua SSE | Bất kỳ phân hệ nghiệp vụ nào |
| `listUser(userId, query)` | Lấy danh sách thông báo của tài khoản | Storefront, Account |
| `listAdmin(query)` | Lấy danh sách thông báo quản trị | Admin |
| `userStream(userId)` | Cung cấp luồng SSE realtime cho người dùng | Storefront, Web Client |
| `adminStream()` | Cung cấp luồng SSE realtime cho quản trị viên | Admin Dashboard |
