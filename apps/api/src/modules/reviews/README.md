---
title: Hợp đồng module reviews
updated: 2026-11-12
status: đề xuất; chờ review nghiệp vụ và giao diện
owner: Tài
---
# Phân hệ `reviews` — Đánh giá sản phẩm

**Chức năng:** Cung cấp API gửi/xem đánh giá khách hàng (đợt 1) và kiểm duyệt đánh giá (đợt 2).

**Chủ sở hữu:** Tài · **Dòng việc:** PH-03 (Issue #96) · **Bảng:** `reviews`, `review_media` trong `prisma/schema/identity.prisma` · **Tài liệu feature:** [docs/features/reviews/](../../../../../docs/features/reviews/README.md)

| Tệp | Vai trò | Luật |
|---|---|---|
| `dto/*.dto.ts`, `dto/*.response.ts` | Hình dạng vào và ra, có chú thích Swagger | Không import Prisma |
| `*.controller.ts` | Nhận HTTP, kiểm dữ liệu vào, gọi service | Không import Prisma, không có logic |
| `reviews.service.ts` | Nghiệp vụ đánh giá, truy vấn qua `PrismaService` | Chỉ ghi bảng `reviews` của Tài |
| `index.ts` | Cửa duy nhất cho phân hệ khác | Xuất service, module và DTO |
| `*.spec.ts` | Kiểm thử đơn vị, Prisma giả | Tên bài ghi mã nghiệp vụ/Issue |

## Hợp đồng công bố

Phân hệ khác tương tác với đánh giá qua `ReviewsService` (import từ `./index.js`).

| Hàm | Ai gọi | Trạng thái |
|---|---|---|
| `getOrderReviewContext(orderId, userId)` | `GET /api/orders/:orderId/reviews` | Đợt 1 (Issue #96) |
| `createReview(userId, dto)` | `POST /api/reviews` | Đợt 1 (Issue #96) |
| `getPublicProductReviews(slug, query)` | `GET /api/products/:slug/reviews` | Đợt 1 (Issue #96) |
