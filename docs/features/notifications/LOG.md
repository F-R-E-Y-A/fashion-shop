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
