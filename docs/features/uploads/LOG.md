---
title: Tải ảnh của người dùng — nhật ký
updated: 2026-11-12
status: đang dùng
owner: Bảo
---
# Tải ảnh của người dùng — nhật ký

**Chức năng:** Vì sao ảnh của người dùng được tải thẳng lên Cloudinary bằng phiếu ký, và máy chủ kiểm gì trước khi gắn ảnh vào dữ liệu.

<a id="adr-055"></a>
## 2026-11-12 · ADR-055 — Ảnh người dùng tải thẳng lên Cloudinary bằng phiếu ký từng ảnh; máy chủ kiểm ảnh trên kho trước khi gắn

**Loại:** quyết định · **Phạm vi:** cả nhóm: thêm dịch vụ ngoài và biến `CLOUDINARY_URL` cho môi trường thử; module `uploads`, `infra/storage`; đánh giá là người dùng đầu tiên · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi thi hành)

### Hiện trạng
- Ảnh sản phẩm hiện là URL ngoài nạp từ dữ liệu crawl, máy chủ không giữ tệp ảnh nào: `select split_part(url,'/',3), count(*) from product_images group by 1` trên cơ sở dữ liệu local ngày 12/11 ra đúng một host CDN ngoài, 1199 ảnh.
- Máy chủ chạy Render gói miễn phí: đĩa mất khi khởi động lại ([TECH_DEBT ND-07](../../TECH_DEBT.md)), nên không lưu tệp tải lên ở đĩa được.
- Đánh giá có ảnh ([ADR-054](../reviews/LOG.md#adr-054)) cần chỗ chứa tệp do khách gửi, tối đa 5 ảnh, 5 MB mỗi ảnh.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Tệp đi qua máy chủ API rồi lưu đĩa hoặc cơ sở dữ liệu | Không thêm dịch vụ | Đĩa Render mất khi khởi động lại; ảnh nặng đi qua API 512 MB RAM; phải tự làm CDN và thu nhỏ ảnh | Dễ |
| B. Kho S3 hoặc R2 với URL ký sẵn | Chuẩn công nghiệp | Phải tự làm thu nhỏ và CDN; cần thẻ thanh toán để mở tài khoản (suy luận theo điều kiện đăng ký của các nhà cung cấp) | Vừa |
| **C. Cloudinary, trình duyệt tải thẳng bằng phiếu ký từng ảnh, máy chủ kiểm qua Admin API trước khi gắn (chọn)** | Gói miễn phí có CDN, tự thu nhỏ và nén ảnh; tệp không đi qua API; bí mật ở máy chủ | Thêm một dịch vụ ngoài; ảnh tải xong mà không gửi đánh giá thành ảnh mồ côi | Vừa: `ImageStorage` là lớp trừu tượng, đổi kho là viết lớp mới |
| Không làm gì | — | Đánh giá không có ảnh thật | — |

**Chọn C**. Trade-off chấp nhận: phụ thuộc Cloudinary; ảnh mồ côi chưa dọn ([ND-19](../../TECH_DEBT.md)).

Chi tiết an toàn:
- Máy chủ đặt khoá `freya/reviews/<userId>/<24 hex>` và ký `allowed_formats`, `overwrite=false`, `public_id`, `timestamp` ([cloudinary-image-storage.ts:76](../../../apps/api/src/infra/storage/cloudinary-image-storage.ts#L76)). Đổi bất kỳ trường nào thì chữ ký sai; `overwrite=false` chặn dùng lại phiếu để thay ảnh đã được duyệt.
- Không tin khoá do trình duyệt gửi: kiểm tiền tố thư mục, rồi hỏi kho ảnh có thật, định dạng, dung lượng; sai thì xoá ảnh và trả 422 ([uploads.service.ts:86](../../../apps/api/src/modules/uploads/uploads.service.ts#L86)).
- 30 phiếu mỗi giờ mỗi tài khoản; Redis lỗi thì cho qua vì phiếu tự hết hạn sau 1 giờ và ảnh vẫn bị kiểm trước khi gắn.
- Web gửi tệp bằng `postExternalForm`, không gắn token của cửa hàng; bài web UC-11.1/AC10 kiểm điều này.

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| AI gợi ý | Claude (advisor, 12/11): bản đầu ký phiếu theo thư mục, trình duyệt tự đặt tên tệp, nên ghi đè được ảnh đã duyệt | sửa: máy chủ đặt khoá từng ảnh và ký `overwrite=false` |

**Kết luận:** Chọn C, chờ Bảo review và chốt.
**Bằng chứng:** `cloudinary-image-storage.spec.ts` (chữ ký, khoá, bí mật); `test/reviews.http.spec.ts` UC-11.1/AC5 với kho giả.

### Kết quả mong đợi → thực tế
Mong đợi: có `CLOUDINARY_URL` trên Render, một đánh giá có ảnh đi trọn luồng trên staging, ảnh hiện qua CDN sau khi quản trị duyệt.
Thực tế: (điền sau khi Bảo tạo tài khoản Cloudinary và chạy thử).

### Điều kiện xem lại
Vượt gói miễn phí của Cloudinary; cần ảnh sản phẩm do quản trị tải lên (thêm mục đích mới trong `UploadsService.ticket`); chuyển hạ tầng sang Azure ([ND-07](../../TECH_DEBT.md)).

<a id="adr-056"></a>
## 2026-11-12 · ADR-056 — Sổ ảnh chưa gắn và worker dọn ảnh mồ côi theo lô 100; kiểm ảnh song song; lưới ảnh dùng bản thu nhỏ

**Loại:** quyết định · **Phạm vi:** feature uploads: bảng `media_uploads`, `MediaCleanupService`; reviews gọi `attach`/`release` trong giao dịch; cột `review_media.thumbnail_url` · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi thi hành)

### Hiện trạng
- Ảnh tải lên mà không gửi đánh giá nằm lại trên kho, không ai biết để dọn ([ND-19](../../TECH_DEBT.md)). Ảnh bị thay khi sửa đánh giá được xoá bằng một lệnh riêng sau giao dịch; kho lỗi đúng lúc đó thì ảnh mồ côi luôn.
- Kiểm ảnh khi gửi đánh giá gọi Admin API lần lượt từng ảnh: N ảnh là N lượt chờ nối tiếp.
- Lưới ảnh 72 px (`Reviews.module.css`, `.photo`) tải bản `c_limit,w_1600` dành cho lightbox.
- Giới hạn Cloudinary đọc ngày 12/11: Admin API gói Free 500 lệnh mỗi giờ, mỗi lệnh tính một ([usage limits](https://cloudinary.com/documentation/admin_api_overview)); xoá theo `public_ids` tối đa 100 khoá mỗi lệnh, mẫu phản hồi chỉ có giá trị `deleted` ([delete resources by public ID](https://cloudinary.com/documentation/admin_api_resources_delete_resources_by_public_id)); `invalidate` mặc định tắt, phải mở yêu cầu hỗ trợ mới bật; không invalidate thì bản trên CDN có thể còn tới 30 ngày ([invalidate cached media](https://cloudinary.com/documentation/invalidate_cached_media_assets_on_the_cdn)).

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Định kỳ liệt kê thư mục trên kho, so với `review_media` (cách ghi ở ND-19) | Không thêm bảng | Mỗi lượt liệt kê toàn bộ ảnh: số lệnh Admin API tăng theo tổng số ảnh, ăn chung hạn mức 500 lệnh mỗi giờ với lệnh kiểm ảnh; phải tự chừa ảnh đang tải dở | Dễ |
| **B. Sổ `media_uploads`: cấp phiếu ghi `PENDING`, gắn ảnh thì xoá dòng trong giao dịch, gỡ ảnh thì ghi `DISCARDED`; worker 15 phút nhận lô 100 dòng bằng `FOR UPDATE SKIP LOCKED`, mỗi lô một lệnh xoá (chọn)** | Số lệnh xoá bằng số ảnh mồ côi chia 100; không bao giờ gắn ảnh đang bị xoá; nhiều máy chủ cùng chạy không xoá trùng; kho lỗi thì thử lại sau hạn thuê | Thêm một bảng và một worker; mỗi phiếu thêm một câu `INSERT` | Vừa: bỏ worker thì bảng chỉ còn là sổ |
| C. Giữ như cũ | Không thêm gì | Ảnh bỏ dở tích luỹ không giới hạn; mỗi lần sửa ảnh tốn một lệnh Admin API | — |

**Chọn B**. Trade-off chấp nhận: thêm một bảng ngắn hạn; ảnh bị gỡ còn trên kho tới lượt dọn sau (khoảng 15 phút khi máy chủ thức) và có thể còn trên CDN tới 30 ngày vì không bật `invalidate`.

Cùng đợt, hai tối ưu không cần quyết định riêng:
- Kiểm ảnh khi gửi đánh giá chạy song song (`Promise.all`, tối đa 5 ảnh, kiểm tiền tố cả lô trước khi gọi kho): thời gian chờ từ N lượt nối tiếp còn một lượt. Số lệnh Admin API không đổi, vẫn một lệnh mỗi ảnh.
- Lưới ảnh dùng bản `c_fill,w_160,h_160,f_auto,q_auto`, lưu ở `review_media.thumbnail_url` lúc gắn; lightbox vẫn mở bản 1600 px. Chưa đo dung lượng thật vì chưa có Cloudinary ([ND-20](../../TECH_DEBT.md)): mức tiết kiệm là suy luận.

Chi tiết:
- Nhận lô là một câu `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 100) RETURNING`, tự commit trước khi gọi kho: không giữ giao dịch qua một lệnh HTTP ([media-cleanup.service.ts](../../../apps/api/src/modules/uploads/media-cleanup.service.ts)).
- Gắn ảnh là một câu `DELETE` có điều kiện `status = 'PENDING'` và đúng chủ, trong giao dịch tạo hay sửa đánh giá; thiếu dòng thì 422 và rollback ([uploads.service.ts](../../../apps/api/src/modules/uploads/uploads.service.ts)).
- Phản hồi 2xx của lệnh xoá coi cả lô xong, vì tài liệu không mô tả giá trị cho khoá không tồn tại. Lỗi thì lô giữ `DELETING` tới hết hạn thuê 30 phút, `attempts` tăng, từ lần thứ 3 ghi cảnh báo.
- Mỗi lượt tối đa 5 lô: 4 lượt mỗi giờ tốn tối đa 20 lệnh cho việc dọn, phần còn lại của 500 lệnh để kiểm ảnh.
- "Song song" ở đây là nhiều worker chạy cùng lúc an toàn nhờ `SKIP LOCKED`, không phải bắn nhiều lệnh xoá cùng lúc: nút thắt là hạn mức lệnh mỗi giờ, không phải độ trễ.
- Render gói miễn phí ngủ khi không có truy cập nên worker chỉ chạy khi máy chủ thức. Dọn ảnh không gấp, chấp nhận.

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| Bảo | Ý tưởng: ký phiếu để trình duyệt tải thẳng lên kho, và worker theo lịch dọn ảnh mồ côi theo lô | Phần ký phiếu đã có ở [ADR-055](#adr-055); phần worker thành phương án B |
| AI gợi ý | Claude (advisor, 12/11): lượt nhận lô phải đổi trạng thái chứ không chỉ đóng dấu thời gian, để lệnh gắn ảnh không thắng được dòng đang bị xoá | sửa: nhận lô đổi sang `DELETING`, gắn chỉ lấy `PENDING` |
| AI gợi ý | Claude (advisor, 12/11): cách quét thư mục ở ND-19 tốn lệnh theo tổng số ảnh | giữ làm phương án A, bị loại |

**Kết luận:** Chọn B, chờ Bảo review và chốt.
**Bằng chứng:** `test/media-cleanup.http.spec.ts` UC-11.1/AC11 (biên 24 giờ, lô 100/100/31, hai lượt chồng nhau không xoá trùng, kho lỗi rồi thử lại sau hạn thuê, không gắn được ảnh đang dọn); `cloudinary-image-storage.spec.ts` (250 khoá thành 3 lệnh); `ProductReviews.test.tsx` UC-11.3/AC6 (lưới dùng bản thu nhỏ).

### Kết quả mong đợi → thực tế
Mong đợi: trên staging có Cloudinary, ảnh bỏ dở quá 24 giờ biến khỏi Media Library sau một lượt dọn; header `X-FeatureRateLimit-Remaining` không tụt bất thường.
Thực tế: (điền sau khi xử lý ND-20).

### Điều kiện xem lại
Đánh giá có ảnh vượt khoảng 100 mỗi giờ (5 lệnh kiểm mỗi đánh giá chạm hạn mức gói Free): xét webhook `notification_url` để kiểm ảnh không tốn lệnh Admin API, hoặc nâng gói. Cần gỡ ảnh khỏi CDN ngay (ảnh vi phạm): mở yêu cầu hỗ trợ bật `invalidate`.
