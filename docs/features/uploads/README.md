---
title: Tải ảnh của người dùng
updated: 2026-11-12
status: đề xuất; đã commit, PR vào develop chờ duyệt, chưa thử Cloudinary thật
owner: Bảo
---
# Tải ảnh của người dùng

**Chức năng:** Bản đồ phân hệ cấp phiếu tải ảnh lên kho và kiểm ảnh: ai dùng, cấu hình gì, kiểm bằng gì, còn thiếu gì.

| Mục | Hiện trạng |
|---|---|
| Người sở hữu | Bảo; `apps/api/src/modules/uploads`, `apps/api/src/infra/storage`; web gọi qua `features/reviews/use-reviews.ts` và `postExternalForm` ở `core/http.ts` |
| Người dùng đầu tiên | [Đánh giá sản phẩm](../reviews/README.md), ảnh thật của khách |
| Quyết định | [ADR-055](LOG.md#adr-055) phiếu ký từng ảnh; [ADR-056](LOG.md#adr-056) sổ ảnh chưa gắn, dọn theo lô, ảnh thu nhỏ |
| Hợp đồng module | [uploads/README.md](../../../apps/api/src/modules/uploads/README.md) |
| Cấu hình | `CLOUDINARY_URL` trong `.env.example` và `render.yaml` (`sync: false`); để trống thì tắt tải ảnh, phần còn lại vẫn chạy |

## Luồng một ảnh

1. Web hỏi `GET /api/uploads/config`; kho tắt thì ẩn ô chọn ảnh.
2. Web kiểm sơ bộ định dạng và dung lượng, rồi xin phiếu `POST /api/uploads/tickets` (đã đăng nhập, 30 phiếu mỗi giờ). Máy chủ ghi dòng `PENDING` vào sổ `media_uploads`.
3. Web gửi các tệp song song, mỗi tệp thẳng tới Cloudinary bằng các trường trong phiếu; **không** kèm token của cửa hàng.
4. Web gửi khoá ảnh kèm đánh giá. Máy chủ kiểm khoá thuộc thư mục của người gửi, hỏi Admin API **song song** xem ảnh có thật, đúng định dạng, không quá 5 MB. Trong giao dịch tạo đánh giá, máy chủ lấy dòng `PENDING` của từng ảnh rồi lưu URL bản lớn và bản thu nhỏ.
5. Ảnh không được gắn sau 24 giờ, ảnh bị gỡ khi sửa và ảnh sai định dạng: worker 15 phút một lượt xoá trên kho theo lô 100 ảnh mỗi lệnh.

## Hạn mức Cloudinary

Admin API gói Free: 500 lệnh mỗi giờ ([ADR-056](LOG.md#adr-056) dẫn nguồn). Kiểm ảnh tốn một lệnh mỗi ảnh; dọn ảnh tốn tối đa 5 lệnh mỗi lượt, 20 lệnh mỗi giờ. Tải ảnh lên và phát ảnh qua CDN không tính vào hạn mức này.

## Kiểm chứng ngày 12/11

| Lệnh | Kết quả |
|---|---|
| `npx vitest run --project unit src/infra/storage` (apps/api) | 7 bài qua: chữ ký, khoá trong thư mục, bí mật không lộ, URL bản thu nhỏ, 250 khoá thành 3 lệnh xoá 100/100/50, lô lỗi thì dừng |
| `npx vitest run --project http test/media-cleanup.http.spec.ts test/reviews.http.spec.ts test/reviews-public.http.spec.ts test/admin-reviews.http.spec.ts` (apps/api) | 4 tệp, 28 bài qua, 145 s, kho giả. UC-11.1/AC5: khoá người khác, ảnh chưa tải, sai định dạng vào hàng xoá, kho lỗi 503. UC-11.1/AC11: biên 24 giờ, lô 100/100/31, hai lượt chồng nhau, thử lại sau hạn thuê, ảnh đang dọn không gắn được |
| `npx vitest run src/features/reviews` (apps/web) | 3 tệp, 19 bài qua. UC-11.1/AC10: phiếu, gửi thẳng tới kho không kèm token. UC-11.3/AC6: lưới dùng bản thu nhỏ |

**Chưa chạy với Cloudinary thật** ([ND-20](../../TECH_DEBT.md)): số lệnh thật và dung lượng tiết kiệm chưa đo. Ảnh mồ côi ([ND-19](../../TECH_DEBT.md)) xử lý trên nhánh bằng ADR-056, chờ Bảo chốt.
