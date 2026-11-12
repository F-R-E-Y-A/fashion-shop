---
title: Hợp đồng module uploads
updated: 2026-11-12
status: đề xuất, chưa commit; chưa thử với Cloudinary thật
owner: Bảo
---
# Phân hệ `uploads` — phiếu tải ảnh và kiểm ảnh

**Chức năng:** Cửa công bố của phân hệ cấp phiếu tải ảnh thẳng lên kho và kiểm ảnh trước khi phân hệ khác gắn vào dữ liệu.

**Quyết định:** [ADR-055](../../../../../docs/features/uploads/LOG.md#adr-055) (phiếu ký), [ADR-056](../../../../../docs/features/uploads/LOG.md#adr-056) (sổ ảnh và dọn theo lô) · **Tài liệu feature:** [docs/features/uploads/](../../../../../docs/features/uploads/README.md) · **Người dùng đầu tiên:** đánh giá sản phẩm ([reviews](../reviews/README.md))

## Cửa công bố

`index.ts` xuất `UploadsModule`, `UploadsService` và kiểu `ResolvedMedia`. Phân hệ gọi không đọc khoá ảnh do trình duyệt gửi mà chỉ dùng URL đã qua `resolveReviewMedia`.

| Hàm | Ai gọi | Hợp đồng |
|---|---|---|
| `ticket(userId, purpose)` | Đường dẫn `POST /api/uploads/tickets` | Phiếu cho **một** ảnh: máy chủ đặt khoá `<thư mục>/<userId>/<24 hex>`, ký kèm `overwrite=false` và định dạng cho phép, ghi dòng `PENDING` vào sổ `media_uploads`. 30 phiếu mỗi giờ mỗi tài khoản |
| `uploadConfig()` | Đường dẫn `GET /api/uploads/config` | Kho có bật không, giới hạn dung lượng và định dạng; giao diện ẩn ô chọn ảnh khi tắt |
| `resolveReviewMedia(userId, keys)` | Reviews, trước giao dịch | Mọi khoá phải nằm trong thư mục của người này (kiểm cả lô trước), rồi hỏi kho **song song**: đã có, đúng định dạng, không quá 5 MB. Sai thì 422 `INVALID_MEDIA` và ảnh sai vào hàng xoá; kho lỗi thì 503 `UPLOADS_UNAVAILABLE`. Trả `url` (1600 px) và `thumbnailUrl` (160 px) |
| `attach(userId, keys, tx)` | Reviews, **trong** giao dịch tạo hay sửa đánh giá | Lấy dòng `PENDING` của từng khoá bằng một câu `DELETE` có điều kiện; thiếu dòng (đang bị dọn, đã dọn, của người khác) thì 422 và giao dịch rollback |
| `release(userId, keys, tx)` | Reviews, **trong** giao dịch sửa | Ảnh bị gỡ vào hàng xoá (`DISCARDED`); rollback thì không ảnh nào bị xoá nhầm |

## Sổ ảnh và worker dọn

- Bảng `media_uploads` thuộc phân hệ này; phân hệ khác chỉ đi qua `attach` và `release`. Bảng chỉ giữ ảnh đang chờ gắn hoặc chờ xoá nên không phình.
- `MediaCleanupService` chạy 15 phút một lượt, mỗi lượt tối đa 5 lô, mỗi lô 100 khoá = một lệnh xoá. Nhận lô bằng `FOR UPDATE SKIP LOCKED` và tự commit trước khi gọi kho. Kho lỗi thì lô giữ `DELETING` 30 phút rồi được nhận lại.
- Đến hạn dọn: `DISCARDED`; `PENDING` quá 24 giờ; `DELETING` quá hạn thuê. Tắt khi `NODE_ENV=test` (kiểm thử gọi `sweep(now)` trực tiếp) và khi kho tắt.

## Kho ảnh ở `infra/storage`

`ImageStorage` là lớp trừu tượng, không biết đánh giá hay sản phẩm. `StorageModule` chọn `CloudinaryImageStorage` khi `CLOUDINARY_URL` hợp lệ, ngược lại `DisabledImageStorage` (mọi lệnh tải ảnh trả 503 `UPLOADS_DISABLED`, phần còn lại của đánh giá vẫn chạy).

- Chữ ký: `cloudinary-image-storage.ts:76` ký `allowed_formats`, `overwrite`, `public_id`, `timestamp`. Trình duyệt đổi khoá sang thư mục người khác, đổi định dạng hay bỏ `overwrite=false` thì chữ ký sai. `overwrite=false` chặn dùng lại phiếu để thay ảnh đã được duyệt bằng ảnh khác.
- Bí mật API không bao giờ nằm trong phiếu; `cloudinary-image-storage.spec.ts` kiểm điều này.
- `remove` tự chia lô 100 khoá mỗi lệnh (giới hạn của Cloudinary), chạy nối tiếp; không gửi `invalidate` vì Cloudinary mặc định tắt tính năng này.
- `thumbnailUrl` là bản `c_fill,w_160,h_160,f_auto,q_auto` cho lưới ảnh 72 px; `deliveryUrl` là bản `c_limit,w_1600` cho lightbox.
- Kiểm thử HTTP dùng `test/helpers/fake-image-storage.ts` thay cho kho thật.

## Biến môi trường

`CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>` (`.env.example`, `render.yaml` để `sync: false`). Để trống thì tắt tải ảnh.
