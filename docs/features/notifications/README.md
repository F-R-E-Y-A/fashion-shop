---
title: Phân hệ thông báo — bản đồ
updated: 2026-11-09
status: đang dùng
owner: Duy
---
# Phân hệ thông báo

**Chức năng:** Bản đồ phân hệ thông báo: email giao dịch theo đơn, SSE thời gian thực, chuông thông báo và thông báo quản trị.

| | |
|---|---|
| **Người sở hữu** | Phan Ngọc Duy · module `apps/api/src/modules/notifications` · `apps/web/src/features/notifications` · bảng trong `prisma/schema/orders.prisma` |
| **Dòng việc** | PH-15 (Issue #73, nhánh `feature/ph-15-notifications`), sprint S9 · 09/11 - 15/11 |
| **Use case** | UC-15.1 trong [use-case-index.md](../../shared/use-case-index.md) |

## Giải quyết việc gì

Khách hàng nhận email giao dịch tự động khi đơn hàng đổi trạng thái và theo dõi thông báo in-app qua chuông thông báo trên thanh điều hướng. Quản trị viên nhận thông báo thời gian thực qua Server-Sent Events khi có đơn mới hoặc yêu cầu cần xử lý.

## Phạm vi sprint này

| Hạng mục | Use case / tiêu chí | Phải có hay có thể trượt |
|---|---|---|
| Email giao dịch theo trạng thái đơn hàng | Gửi email tiếng Việt chuẩn F.R.E.Y.A. qua MailService khi đơn chuyển trạng thái | Phải có |
| Thông báo in-app cho khách hàng | API danh sách, đánh dấu đã đọc, đếm chưa đọc | Phải có |
| Thông báo realtime qua SSE | Luồng sự kiện `/stream` cập nhật chuông không cần polling | Phải có |
| Chuông thông báo trên Storefront | Component NotificationBell kèm badge số lượng và popover danh sách | Phải có |
| Thông báo cho quản trị viên | API admin và sự kiện đơn mới, hoàn tiền, hủy đơn | Phải có |
| Tích hợp khuyến mãi vào thanh toán | Áp dụng PromotionField vào CheckoutPage sau khi gộp PR #41 | Phải có |

## Dữ liệu

Bảng `Notification` nằm trong `orders.prisma` (Duy quản lý) theo [ADR-050](LOG.md#adr-050). Khóa ngoại trỏ về `User` (bảng `users` trong `identity.prisma`) và `Order` (bảng `orders`).

## Hợp đồng với phân hệ khác

- **`OrdersService`:** Gọi `NotificationsService.handleOrderStatusChange()` khi đơn hàng được tạo hoặc chuyển trạng thái (`transition`).
- **`MailService`:** Sử dụng hạ tầng gửi email giao dịch sẵn có tại `apps/api/src/infra/mail/`.
- **`Promotions`:** Nhận kết quả từ `useAppliedPromotion` của feature promotions và tính giảm trừ vào tổng đơn tại `CheckoutPage`.

## Giao diện

- Component `NotificationBell` tại `apps/web/src/features/notifications/components/NotificationBell.tsx`.
- Gắn vào thanh điều hướng cửa hàng tại `apps/web/src/app/StoreLayout.tsx`.

## Kiểm thử và nghiệm thu

| Tiêu chí | Bài kiểm thử | Kết quả |
|---|---|---|
| Đơn vị backend service | `apps/api/src/modules/notifications/notifications.service.spec.ts` | 4/4 pass |
| Chuyển trạng thái đơn bắn thông báo | `apps/api/src/modules/orders/orders.service.spec.ts` | 7/7 pass |
| Chuông thông báo frontend | `apps/web/src/features/notifications/notifications.test.tsx` | 6/6 pass |
| Khuyến mãi tại trang thanh toán | `apps/web/src/features/checkout/checkout.test.tsx` | 30/30 pass |

## Trạng thái hôm nay (2026-11-09)

Mã nguồn backend và frontend đã hoàn thiện, kiểm thử cục bộ pass 100%. Migration `20261109040342_ph15_notifications` đã deploy và nạp seed dữ liệu mẫu thành công.
