---
title: Phân hệ thông báo — bản đồ và ma trận đa kênh
updated: 2026-11-16
status: đang dùng — đã rà đủ bước, nội dung và kênh theo góp ý (4)
owner: Duy
---
# Phân hệ thông báo

**Chức năng:** Bản đồ phân hệ thông báo và ma trận đầy đủ bước chuyển, nội dung tiếng Việt, kênh phát hành cho khách hàng và quản trị.

| | |
|---|---|
| **Người sở hữu** | Phan Ngọc Duy · `apps/api/src/modules/notifications` · `apps/web/src/features/notifications` · `orders.prisma` |
| **Dòng việc** | PH-15 (Issue #73, PR #74 đã gộp) và rà soát hoàn thiện đợt cuối (2026-11-16) |
| **Use case** | UC-15.1 trong [use-case-index.md](../../shared/use-case-index.md) |

## Ma trận thông báo khi đơn đổi trạng thái (Góp ý 4)

Toàn bộ được kích hoạt qua post-commit hook (`WeakMap`) sau khi transaction DB commit thành công ([notifications.service.ts](../../../apps/api/src/modules/notifications/notifications.service.ts)):

| Sự kiện / Trạng thái | Kênh cho Khách (In-App DB + SSE) | Kênh Email Khách (`MailService`) | Kênh cho Admin (In-App + SSE) | Nội dung chính |
|---|---|---|---|---|
| `PENDING_PAYMENT` | Có (`userId`) | Có (`customerEmail`) | Không | Mã đơn, tổng tiền VNĐ, nhắc hoàn tất thanh toán trước khi hết giữ hàng |
| `PENDING_CONFIRMATION` (COD) | Có | Có | Có | Xác nhận đã tiếp nhận đơn COD, nhắc admin gọi xác nhận |
| `PAYMENT_REVIEW` | Có | Có | Có (cảnh báo) | Báo giao dịch đang đối soát (không thanh toán lại), nhắc admin kiểm tra |
| `CONFIRMED` | Có | Có | Có | Xác nhận đã nhận thanh toán thành công, chuẩn bị đóng gói |
| `PROCESSING` | Có | Có | Không | Đang đóng gói, đính kèm tên hãng & mã vận đơn nếu đã tạo |
| Gắn vận đơn lúc đang `PROCESSING` | Có (`notifyShipmentCreated`) | Có | Không | Thông báo mã vận đơn mới, đơn vị vận chuyển, ngày dự kiến giao |
| `SHIPPED` | Có | Có | Không | Đang giao hàng, kèm mã vận đơn & đơn vị vận chuyển |
| Vận đơn `FAILED` | Có (`notifyShipmentFailed`) | Có | Có | Báo giao chưa thành công, lý do cụ thể từ GHN/mô phỏng, nhắc giữ liên lạc |
| `DELIVERED` | Có | Có | Có nếu từ webhook GHN | Xác nhận giao thành công, nhắc đánh giá (30 ngày) / đổi trả (15 ngày) |
| `CANCELLED` (`CUSTOMER` / `EXPIRED` / `ADMIN` / `DELIVERY_FAILED`) | Có | Có | Có | Phân biệt rõ 4 nguồn hủy (`cancelSource`) kèm lý do cụ thể |
| `PARTIALLY_REFUNDED` / `REFUNDED` | Có | Có | Có | Hiển thị chính xác số tiền hoàn (`refundedAmount`), thời gian tiền về |

Nguyên tắc an toàn nội dung email & liên kết:
- Nhãn trạng thái trong email map qua `ORDER_STATUS_LABELS` (tiếng Việt hoàn chỉnh, không lộ raw enum như `SHIPPED`).
- Toàn bộ trường do người dùng/hãng nhập (`reason`, `note`, `title`, `message`) được thoát ký tự HTML qua `escapeHtml()`.
- Liên kết trong email dùng địa chỉ tuyệt đối `${WEB_PUBLIC_URL}/don-hang/${order.id}` (rút từ `webPublicOrigin()` trong [env.ts](../../../apps/api/src/infra/config/env.ts)), gửi bất đồng bộ không làm treo transaction đơn hàng khi SMTP lỗi/chậm.

## Hợp đồng và giao diện

- **Backend:** `NotificationsService` nhận `OrderStatusNotificationContext` từ `OrdersService.transition`, `CheckoutService`, `OrderAdminService` và `ShippingService`.
- **Frontend:** `NotificationBell` ([NotificationBell.tsx](../../../apps/web/src/features/notifications/components/NotificationBell.tsx)) hiển thị thời gian kèm `dd/mm HH:mm`, polling định kỳ 30 giây qua `apiGet` (kèm Bearer token), hỗ trợ modal focus trap, Escape đóng và xóa cache khi nhận 403.

## Quyết định liên quan

Xem chi tiết tại [ADR-050](LOG.md#adr-050) và [ADR-071](LOG.md#adr-071).
