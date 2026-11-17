---
title: Nhật ký quyết định — phân hệ thông báo
updated: 2026-11-14
status: đang dùng
owner: Duy
---
# Nhật ký phân hệ thông báo

**Chức năng:** Lưu trữ các quyết định kiến trúc và thay đổi kỹ thuật của phân hệ thông báo.

<a id="adr-050"></a>
## 2026-11-09 · ADR-050 — Kiến trúc phân hệ thông báo đa kênh: In-App, Server-Sent Events và Transactional Email

**Loại:** quyết định · **Phạm vi:** `apps/api/src/modules/notifications`, `apps/web/src/features/notifications`, `apps/api/prisma/schema/orders.prisma` · **Trạng thái:** đề xuất · **Người quyết:** Duy · **Commit:** (điền khi thi hành)

### Hiện trạng
Hệ thống bán hàng F.R.E.Y.A. đã hoàn thiện các khâu giỏ hàng, đặt hàng (PH-11) và khuyến mãi (PH-10, PR #41). Tuy nhiên, khách hàng và quản trị viên chưa có kênh cập nhật kịp thời khi trạng thái đơn hàng thay đổi (ví dụ xác nhận thanh toán thành công, bắt đầu giao hàng, hủy đơn hoặc hoàn tiền).

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Polling định kỳ từ client (Short Polling) | Cài đặt đơn giản | Gây tải thừa lên database và API server khi lượng truy cập tăng | Dễ |
| B. WebSocket hai chiều | Hai chiều thời gian thực | Cần duy trì stateful connection, phức tạp khi scale ngang qua reverse proxy | Khó |
| **C. Server-Sent Events (SSE) kết hợp Transactional Email và In-App Storage (chọn)** | Tận dụng HTTP tiêu chuẩn, nhẹ, một chiều từ server phù hợp tính chất thông báo; email đảm bảo thông tin quan trọng luôn tới khách; in-app lưu vết lịch sử | Cần xử lý reconnect SSE phía client | Dễ |

**Chọn C** vì thông báo đơn hàng có đặc thù phân phối một chiều từ máy chủ tới người dùng. SSE hoạt động trên giao thức HTTP thông thường qua NestJS `@Sse()`, không đòi hỏi hạ tầng socket riêng biệt. Kết hợp với `MailService` sẵn có giúp gửi email giao dịch ngay khi đơn đổi trạng thái.

### Kết quả mong đợi → thực tế
Mong đợi:
- `npm run check` đạt 100% xanh.
- `GET /api/notifications/stream` đẩy sự kiện realtime tới `EventSource`.
- Đổi trạng thái đơn gửi email giao dịch tiếng Việt chính xác.
Thực tế:
- 2026-11-09: Unit tests backend `notifications.service.spec.ts` 4/4 pass, component tests `notifications.test.tsx` 6/6 pass, `orders.service.spec.ts` 7/7 pass.
- 2026-11-13: Qua review PR #74, trên frontend chuyển `NotificationBell` sang polling 30 giây qua `apiGet` (đảm bảo đính kèm header `Authorization: Bearer` và đi qua `BASE_URL` trên staging), đồng thời gom thông báo và email vào post-commit hook sau khi transaction đơn hàng commit.
- 2026-11-14: Đổi lưu trữ post-commit hook trong `OrdersService` từ thuộc tính `Symbol` trên `tx` sang `WeakMap<Prisma.TransactionClient, PostCommitHook[]>` (do `tx` của Prisma 7.10 là `Proxy` chuyển tiếp phép gán thuộc tính xuống `PrismaClient` gốc), bổ sung log cảnh báo khi `registerPostCommitHook` được gọi ngoài vùng gắn hook, bật `autoFetch` cho chuông quản trị viên trên `AdminLayout` và thêm kiểm thử HTTP đặt 2 đơn liên tiếp tạo đủ 2 bản ghi thông báo (`orders.service.spec.ts` 12/12 pass, `cod.http.spec.ts` pass).

### Điều kiện xem lại
Khi lượng người dùng đồng thời vượt quá 10,000 kết nối trực tiếp, xem xét chuyển sang Redis Pub/Sub hoặc message broker phân tán.

<a id="adr-071"></a>
## 2026-11-16 · ADR-071 — Chuẩn hóa thông báo đa kênh theo đủ vòng đời đơn hàng, sự cố vận chuyển và lý do hủy

**Loại:** quyết định · **Phạm vi:** `apps/api/src/modules/notifications`, `apps/api/src/modules/orders`, `apps/api/src/modules/checkout`, `apps/api/src/modules/shipping` · **Trạng thái:** đề xuất · **Người quyết:** Duy · **Commit:** (điền khi thi hành)

### Hiện trạng
Qua rà soát góp ý (4) trên [notifications.service.ts](../../../apps/api/src/modules/notifications/notifications.service.ts): (a) email còn hiển thị raw enum `status` thay vì nhãn tiếng Việt; (b) email gửi link tương đối `/don-hang/:id` khiến bấm từ hộp thư bị hỏng; (c) mọi ca hủy đơn dùng chung một câu thông điệp bất kể hủy do khách, hết hạn thanh toán, admin hủy hay giao thất bại hoàn kho; (d) chưa có thông báo khi gắn vận đơn mới ở trạng thái `PROCESSING` hoặc khi shipper báo giao thất bại (`FAILED`).

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Giữ nguyên switch status cơ bản | Ít sửa code gọi từ Orders/Checkout/Shipping | Thiếu thông tin mã vận đơn, link trong mail không bấm được, hiểu nhầm lý do hủy | Dễ |
| **B. Mở rộng `OrderStatusNotificationContext` truyền `cancelSource`, `trackingNumber`, `refundedAmount` và thêm `notifyShipmentCreated`, `notifyShipmentFailed` (chọn)** | Đủ mọi mốc đơn hàng & vận chuyển, nội dung tiếng Việt thoát HTML an toàn, link đầy đủ theo `WEB_PUBLIC_URL`, vẫn giữ tương thích ngược cho caller 3 tham số | Cần cập nhật các test kiểm tra `transition` truyền thêm context | Dễ |

**Chọn B** vì giải quyết triệt để đủ bước — đúng nội dung — đúng kênh mà không phá vỡ các call-site hiện tại hay cần thêm bảng CSDL mới.

### Kết quả mong đợi → thực tế
Mong đợi:
- Unit tests `notifications.service.spec.ts`, `orders.service.spec.ts`, `shipping.service.spec.ts` kiểm tra đủ nhãn tiếng Việt, escape HTML, link `WEB_PUBLIC_URL`, 4 nguồn `cancelSource` và thông báo sự cố `FAILED`.
Thực tế: đang kiểm định toàn kho cùng đợt hoàn thiện cuối kỳ.

### Điều kiện xem lại
Khi nhóm mở rộng thêm kênh thông báo khác như SMS/Zalo OA hoặc Web Push Notification.
