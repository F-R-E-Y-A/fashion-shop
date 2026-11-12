---
title: Đánh giá sản phẩm — Nhật ký
updated: 2026-11-12
status: đề xuất thảo luận — chờ Duy/Bảo review trước merge
owner: Tài
---
# Đánh giá sản phẩm — Nhật ký

**Chức năng:** Ghi nhận các quyết định kiến trúc và thay đổi mã cho phân hệ Đánh giá sản phẩm.

## 2026-11-12 · Đề xuất Đợt 1 (Issue #96) — Khách gửi đánh giá và xem danh sách đã duyệt

**Loại:** thay đổi mã · **Phạm vi:** Reviews API/web · **Commit:** chưa commit, nền `af438f2`.

Theo yêu cầu Issue #96, triển khai đợt khách hàng gửi đánh giá và xem danh sách công khai.

1. **Ranh giới module:** Tạo `ReviewsModule` sở hữu bảng `reviews` (schema `identity.prisma`). Đọc trạng thái đơn hàng qua helper chỉ đọc `OrdersService.getReviewEligibility` và `getOrderItemReviewEligibility` xuất từ `orders/index.ts`. Kiểm tra hiển thị sản phẩm qua `ProductsService.findBySlug`.
2. **Quy tắc DELIVERED & Hoàn tiền (Đề xuất):** Đơn hàng đủ điều kiện đánh giá khi có ít nhất một bản ghi `DELIVERED` trong `OrderStatusHistory`, bất kể sau đó có phát sinh các trạng thái như hoàn tiền một phần (`PARTIALLY_REFUNDED`). Đề xuất này cần Bảo và Duy review kỹ lưỡng trước khi merge chính thức.
3. **Idempotency & Concurrency:** Khách hàng gửi lại cùng `orderItemId` với cùng payload chuẩn hóa (sao và nội dung đã trim) sẽ nhận lại đánh giá đã commit; nếu khác nội dung hoặc điểm sao sẽ trả lỗi 409 Conflict. Xử lý concurrency collision qua mã lỗi Prisma `P2002`.
4. **Bảo mật Public Storefront:** API `GET /api/products/:slug/reviews` áp dụng allowlist nghiêm ngặt (`id`, `rating`, `content`, `createdAt`), lọc `moderationStatus: APPROVED` và `deletedAt: null`, trả kèm header `Cache-Control: no-store`. Tuyệt đối không để lộ danh tính khách hàng, avatar hay thông tin kiểm duyệt.
5. **Giao diện & Kiểm thử:** Tích hợp `OrderReviewItem` vào `OrderPage` và `ProductReviewsSection` vào `ProductDetailPage`. Đạt 100% kiểm thử Unit (NestJS, React Testing Library), kiểm thử tích hợp HTTP (16 test cases) và kiểm thử E2E Playwright trên cả desktop (1280px) và mobile (360px).
