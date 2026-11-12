---
title: Đánh giá sản phẩm
updated: 2026-11-12
status: đề xuất; mã xong trên nhánh, chưa commit, chưa thử Cloudinary thật
owner: Bảo
---
# Đánh giá sản phẩm

**Chức năng:** Bản đồ phân hệ đánh giá và chấm sao: làm được gì, nằm ở đâu, kiểm bằng gì, còn thiếu gì hôm nay.

| Mục | Hiện trạng |
|---|---|
| Người sở hữu | Bảo; `apps/api/src/modules/reviews`, `apps/web/src/features/reviews` |
| Dòng việc | PH-01, nhánh `feature/ph-01-reviews`; chưa commit ngày 12/11 |
| Ca sử dụng | [UC-11.1, UC-11.2, UC-11.3](use-cases.md) (UC-11.3 là mã mới) |
| Quyết định | [ADR-054](LOG.md#adr-054) luật đánh giá; [ADR-055](../uploads/LOG.md#adr-055) kho ảnh; [ADR-056](../uploads/LOG.md#adr-056) dọn ảnh theo lô, ảnh thu nhỏ |
| Hợp đồng module | [reviews/README.md](../../../apps/api/src/modules/reviews/README.md), [uploads/README.md](../../../apps/api/src/modules/uploads/README.md) |
| Dữ liệu | Migration `20261112051102_ph01_reviews`: thêm cột vào `reviews`, `review_media`; bảng mới `review_helpful_votes`, `review_reports`; `products.rating_average`, `products.rating_count`. Migration `20261112075740_ph01_media_uploads`: bảng `media_uploads`, cột `review_media.thumbnail_url` |

## Người dùng thấy gì

| Nơi | Ai | Có gì |
|---|---|---|
| Thẻ sản phẩm (danh sách, tìm kiếm, liên quan) | Mọi người | Sao và số đánh giá, chỉ khi đã có đánh giá |
| Trang chi tiết, khu `#danh-gia` | Mọi người | Điểm trung bình, phân bố 5 mức bấm để lọc, độ vừa, lọc có ảnh hoặc có chữ, sắp xếp, phân trang, ảnh phóng to, phản hồi của shop |
| Cùng khu đó | Khách đã đăng nhập | Hữu ích, báo cáo; khách vãng lai bấm thì sang đăng nhập rồi quay lại |
| Trang đơn đã giao `/don-hang/:id` | Chủ đơn | Nút "Đánh giá N sản phẩm" |
| `/tai-khoan/danh-gia` | Khách | Tab chờ đánh giá (kèm hạn), tab đã đánh giá (trạng thái, lý do ẩn, phản hồi), form viết và sửa |
| `/admin/reviews` | `ADMIN` | Hàng chờ duyệt, lọc trạng thái, bị báo cáo, tìm; duyệt, ẩn kèm lý do, phản hồi, bỏ báo cáo |

## Đường dẫn API

Công khai: `GET /api/products/:slug/reviews/summary`, `GET /api/products/:slug/reviews`. Khách: `/api/reviews/eligible`, `/api/reviews/mine`, `POST /api/reviews`, `PATCH /api/reviews/:id`, `/api/reviews/:id/helpful`, `/api/reviews/:id/report`. Quản trị: `/api/admin/reviews` và các lệnh `approve`, `reject`, `reply`, `clear-reports`. Ảnh: `/api/uploads/config`, `/api/uploads/tickets`. Hình dạng ở Swagger `/api/docs`.

## So với Shopee và web thời trang

Có: chỉ người đã nhận hàng, hạn đánh giá, ảnh thật, độ vừa với chiều cao và cân nặng, ẩn tên, hữu ích, báo cáo, phản hồi của shop, sửa một lần, lọc theo sao, có ảnh, có chữ.

Chưa có, cố ý: video, xu thưởng khi đánh giá, lọc theo phân loại hàng, nhắc đánh giá qua email. Ghi lại khi có người cần.

## Kiểm chứng ngày 12/11

| Lệnh | Kết quả |
|---|---|
| `npx vitest run --project http test/media-cleanup.http.spec.ts test/reviews.http.spec.ts test/reviews-public.http.spec.ts test/admin-reviews.http.spec.ts` (apps/api) | 4 tệp, 28 bài qua, 145 s |
| `npx vitest run src/features/reviews` (apps/web) | 3 tệp, 19 bài qua |
| `npm run test:http -w apps/api` (cả bộ, chạy trước khi thêm UC-11.3/AC7) | 38 tệp, 589 bài qua, 1947 s |
| `npm run check` (chạy trước khi thêm UC-11.3/AC7) | exit 0: lint 0 lỗi, unit API 61 tệp/579 bài, web 52 tệp/621 bài |
| `npm run test:e2e -w apps/web` | 18 bài qua |
| `npm run evidence:trace -- --uc UC-11 --check` | 25/25 AC có bài tự động; AC biên có ở cả 3 use case |

Kiểm thử HTTP dùng kho ảnh giả. **Chưa tải ảnh thật lên Cloudinary lần nào**: cần Bảo tạo tài khoản, đặt `CLOUDINARY_URL` trên Render rồi thử một đánh giá có ảnh ([TECH_DEBT ND-20](../../TECH_DEBT.md)).

## Còn mở

- Ảnh mồ côi trên kho ([ND-19](../../TECH_DEBT.md)): worker dọn theo lô trên nhánh ([ADR-056](../uploads/LOG.md#adr-056)), chờ Bảo chốt. Ảnh đã xoá có thể còn trên CDN tới 30 ngày vì Cloudinary tắt `invalidate` mặc định.
- Câu hỏi về `STAFF` và đổi trả: [use-cases.md](use-cases.md) mục câu hỏi còn treo.
