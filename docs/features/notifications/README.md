---
title: Phân hệ thông báo — bản đồ
updated: 2026-11-14
status: đang dùng
owner: Duy
---
# Phân hệ thông báo

**Chức năng:** Bản đồ phân hệ thông báo: email giao dịch theo đơn, thông báo in-app, chuông thông báo khách hàng và quản trị.

| | |
|---|---|
| **Người sở hữu** | Phan Ngọc Duy · module `apps/api/src/modules/notifications` · `apps/web/src/features/notifications` · bảng trong `prisma/schema/orders.prisma` |
| **Dòng việc** | PH-15 (Issue #73, nhánh `feature/ph-15-notifications`), sprint S9 · 09/11 - 15/11 |
| **Use case** | UC-15.1 trong [use-case-index.md](../../shared/use-case-index.md) |

## Giải quyết việc gì

Khách hàng nhận email giao dịch tự động sau khi giao dịch tạo/đổi trạng thái đơn hàng đã commit thành công và theo dõi thông báo in-app qua chuông thông báo trên thanh điều hướng. Quản trị viên nhận thông báo trên thanh điều hướng quản trị khi có đơn mới hoặc yêu cầu cần xử lý.

## Phạm vi sprint này

| Hạng mục | Use case / tiêu chí | Phải có hay có thể trượt |
|---|---|---|
| Email giao dịch theo trạng thái đơn hàng | Gửi email tiếng Việt chuẩn F.R.E.Y.A. qua MailService sau khi transaction đơn hàng commit | Phải có |
| Thông báo in-app cho khách hàng | API danh sách, đánh dấu đã đọc (`ParseUUIDPipe`), đếm chưa đọc | Phải có |
| Chuông thông báo trên Storefront & Admin | Component `NotificationBell` (`autoFetch`, polling 30 giây qua `apiGet` có Bearer token) kèm badge số lượng và popover danh sách | Phải có |
| Thông báo cho quản trị viên | API `/admin/notifications` và sự kiện đơn mới, cần đối soát, hủy đơn | Phải có |

## Dữ liệu

Bảng `Notification` nằm trong `orders.prisma` (Duy quản lý) theo [ADR-050](LOG.md#adr-050). Khóa ngoại trỏ về `User` (bảng `users` trong `identity.prisma`) và `Order` (bảng `orders`).

## Hợp đồng với phân hệ khác

- **`OrdersService`:** Ghi nhận post-commit hook qua `WeakMap<Prisma.TransactionClient, PostCommitHook[]>` (`attachPostCommitHooks`, `registerPostCommitHook`, `runPostCommitHooks`) khi đơn hàng được tạo hoặc chuyển trạng thái (`transition`), đảm bảo chỉ gửi thông báo và email sau khi `$transaction` đã commit và tách biệt hoàn toàn giữa các transaction Proxy của Prisma 7.10.
- **`MailService`:** Sử dụng hạ tầng gửi email giao dịch sẵn có tại `apps/api/src/infra/mail/`.

## Giao diện

- Component `NotificationBell` tại `apps/web/src/features/notifications/components/NotificationBell.tsx`.
- Gắn vào thanh điều hướng cửa hàng tại `apps/web/src/app/StoreLayout.tsx` và thanh điều hướng quản trị tại `apps/web/src/app/AdminLayout.tsx` (`autoFetch` bật mặc định).

## Kiểm thử và nghiệm thu

| Tiêu chí | Bài kiểm thử | Kết quả |
|---|---|---|
| Đơn vị backend service | `apps/api/src/modules/notifications/notifications.service.spec.ts` | 4/4 pass |
| Post-commit hooks (WeakMap & rollback) | `apps/api/src/modules/orders/orders.service.spec.ts` | 12/12 pass |
| Đặt 2 đơn liên tiếp qua HTTP tạo đủ 2 thông báo | `apps/api/test/cod.http.spec.ts` | pass |
| Chuông thông báo frontend | `apps/web/src/features/notifications/notifications.test.tsx` | 8/8 pass |

## Trạng thái hôm nay (2026-11-14)

Mã nguồn backend và frontend đã hoàn thiện và xử lý toàn bộ phản hồi review trên PR #74. Migration `20261113080000_ph15_notifications` khớp lịch sử `develop`.
