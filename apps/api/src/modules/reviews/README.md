---
title: Hợp đồng module reviews
updated: 2026-11-12
status: đề xuất, chưa commit, chờ review
owner: Bảo
---
# Phân hệ `reviews` — đánh giá và chấm sao

**Chức năng:** Cửa công bố, bảng sở hữu, phân hệ được gọi và thứ tự khoá của phân hệ đánh giá sản phẩm.

**Dòng việc:** PH-01, nhánh `feature/ph-01-reviews` · **Ca sử dụng:** UC-11.1, UC-11.2, UC-11.3 · **Quyết định:** [ADR-054](../../../../../docs/features/reviews/LOG.md#adr-054) · **Tài liệu feature:** [docs/features/reviews/](../../../../../docs/features/reviews/README.md)

## Cửa công bố

`index.ts` chỉ xuất `ReviewsModule`. Chưa phân hệ nào gọi vào reviews. Điểm sao ra ngoài qua hai cột `products.rating_average` và `products.rating_count`; reviews không tự ghi hai cột này mà gọi `ProductsService.updateRatingSummary`.

## Bảng sở hữu

`reviews`, `review_media`, `review_helpful_votes`, `review_reports` trong `prisma/schema/identity.prisma`. Ràng buộc CHECK (số sao 1–5, chiều cao, cân nặng, bộ đếm không âm) viết tay trong migration `20261112051102_ph01_reviews`.

## Gọi phân hệ khác

| Phân hệ | Hàm | Để làm gì |
|---|---|---|
| Orders | `purchasedItem`, `deliveredItems`, `purchasedItems` | Ai được viết, hạn 30 ngày, bản chụp sản phẩm lúc mua |
| Products | `storefrontProductId`, `updateRatingSummary` | Trang công khai 404 như trang chi tiết; ghi điểm sao |
| Uploads | `resolveReviewMedia` trước giao dịch; `attach`, `release` trong giao dịch | Kiểm ảnh trên kho (song song) trước khi gắn; lấy phiếu chờ của ảnh mới; ảnh bị thay vào hàng xoá để worker dọn theo lô ([ADR-056](../../../../../docs/features/uploads/LOG.md#adr-056)) |
| Auth | `AuthGuard`, `RequireRoles(ADMIN)`, `CurrentUser` | Khách, quản trị; `OptionalAuthGuard` cho danh sách công khai |

## Tệp

| Tệp | Vai trò |
|---|---|
| `review-policy.ts` | Hàm thuần: hạn viết và sửa, luật cần duyệt tay, chuẩn hoá chữ, tên hiển thị, làm tròn điểm. Có `review-policy.spec.ts` |
| `reviews.service.ts` | Khách: tổng hợp, danh sách, chờ đánh giá, viết, sửa, bình chọn, báo cáo |
| `admin-reviews.service.ts` | Quản trị: hàng đợi, duyệt, ẩn, phản hồi, bỏ báo cáo; ghi `audit_logs` |
| `review-ratings.service.ts` | Gom điểm từ đánh giá `APPROVED` chưa xoá rồi gọi Products |
| `review-rows.ts` | `select` của Prisma và hàm đổi dòng sang response; trang công khai không có email hay userId |
| `optional-auth.guard.ts` | Không có header thì cho qua như khách; có thì kiểm token như `AuthGuard` |

## Luật giữ nhất quán

- **Thứ tự khoá:** dòng `reviews` trước, dòng `products` sau. Mọi đường ghi điểm theo cùng thứ tự nên không khoá chéo ([admin-reviews.service.ts:23](admin-reviews.service.ts#L23)).
- **Sửa của khách:** `updateMany` có điều kiện `editCount` cũ, chưa `REJECTED`, chưa xoá. Hai lần sửa đồng thời thì một lần thắng ([reviews.service.ts:321](reviews.service.ts#L321)).
- **Duyệt và ẩn của quản trị:** gửi kèm `editCount` đã thấy; khách sửa sau khi trang quản trị tải thì 409 `REVIEW_CHANGED`, không đổi trạng thái.
- **Ảnh:** khoá ảnh `UNIQUE`; trùng khoá khi tạo thì phân biệt "đã có đánh giá" với "ảnh đã gắn chỗ khác" bằng cách đọc lại ([reviews.service.ts:276](reviews.service.ts#L276)).
- **Phiếu hữu ích, báo cáo:** `createMany` với `skipDuplicates`, bấm lại không đếm thêm. Báo cáo chỉ đánh dấu cho quản trị, không tự ẩn.

Kiểm thử: `test/reviews.http.spec.ts`, `test/reviews-public.http.spec.ts`, `test/admin-reviews.http.spec.ts`, `test/media-cleanup.http.spec.ts` chạy trên PostgreSQL thật, kho ảnh giả `test/helpers/fake-image-storage.ts`.
