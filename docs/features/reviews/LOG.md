---
title: Đánh giá sản phẩm — nhật ký
updated: 2026-11-12
status: đang dùng
owner: Bảo
---
# Đánh giá sản phẩm — nhật ký

**Chức năng:** Vì sao phân hệ đánh giá chạy như hiện nay: ai được viết, khi nào hiện, cách giữ điểm sao đúng khi nhiều người thao tác cùng lúc.

<a id="adr-054"></a>
## 2026-11-12 · ADR-054 — Chỉ người đã nhận hàng được đánh giá; chữ sạch hiện ngay, có ảnh hay chữ nghi vấn thì chờ duyệt

**Loại:** quyết định · **Phạm vi:** module `reviews` (mới), hàm đọc thêm ở `orders`, hai cột điểm và hàm ghi ở `products`, web `features/reviews`, trang chi tiết, thẻ sản phẩm, trang đơn, menu tài khoản và quản trị · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi thi hành)

### Hiện trạng
- Bảng `reviews`, `review_media` có từ trước nhưng chưa mã nào đọc hay ghi: `git show HEAD:apps/api/prisma/schema/identity.prisma` có `model Review` ở dòng 283, `model ReviewMedia` ở dòng 307; `git grep -n -i "prisma.review\|\.review\.\|reviewMedia" HEAD -- apps/api/src apps/api/prisma/seed*` không ra dòng nào (12/11, `HEAD` = `af438f2`).
- Danh mục use case của Duy có UC-11.1 "Đánh giá và nhận xét sản phẩm", UC-11.2 "Duyệt và phản hồi đánh giá" ở mức "Nên có", chưa ai nhận ([PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26), `46a238c`).
- Bảo yêu cầu ngày 12/11: hệ thống đánh giá đầu cuối, chuẩn production, giống Shopee và các web thời trang.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Ai đăng nhập cũng viết, hiện ngay | Dễ làm, nhiều đánh giá sớm | Đánh giá ảo, spam, quảng cáo; điểm sao không đáng tin | Khó: dữ liệu bẩn đã hiện |
| B. Chỉ người mua, mọi đánh giá chờ duyệt | Sạch tuyệt đối | Quản trị phải duyệt từng dòng; khách chờ lâu mới thấy | Dễ |
| **C. Chỉ người mua; chữ sạch không ảnh hiện ngay, có ảnh hoặc chữ có link, số điện thoại, từ tục thì chờ duyệt (chọn)** | Đánh giá thật, phần lớn hiện ngay; ảnh, thứ máy không lọc được, có người xem | Bộ lọc chữ bỏ sót được; cần trang quản trị | Dễ: đổi luật ở một hàm thuần |
| Không làm gì | Không tốn công | Thiếu UC-11, trang chi tiết thiếu bằng chứng xã hội | — |

**Chọn C** vì cân giữa tốc độ hiện và độ tin cậy, đúng cách Shopee và các web thời trang làm: chỉ đơn đã giao, có hạn đánh giá, có ảnh thật, có độ vừa. Trade-off chấp nhận: từ tục lách chính tả vẫn có thể hiện ngay; khách khác báo cáo và quản trị ẩn sau.

Các luật đi kèm (đặc tả ở [use-cases.md](use-cases.md)):
- Một dòng đơn một đánh giá; viết trong 30 ngày từ lần chuyển `DELIVERED`, đơn còn ở `DELIVERED` hoặc `PARTIALLY_REFUNDED` ([review-policy.ts:7](../../../apps/api/src/modules/reviews/review-policy.ts#L7)).
- Sửa đúng một lần trong 30 ngày, sửa xong duyệt lại; đã bị ẩn thì không sửa, để khách không sửa lách sau khi bị ẩn.
- Điểm sản phẩm lưu sẵn trên `products` (`rating_average`, `rating_count`), tính lại trong **cùng giao dịch** với thay đổi đánh giá; trang danh sách đọc catalog trong bộ nhớ nên không gom nhóm mỗi lần tải.
- Thứ tự khoá: dòng `reviews` trước, dòng `products` sau. `updateRatingSummary` khoá dòng sản phẩm rồi mới đếm, nên hai giao dịch đồng thời không ghi đè số của nhau ở READ COMMITTED ([products.service.ts:429](../../../apps/api/src/modules/products/products.service.ts#L429)).
- Khách sửa dùng `updateMany` có điều kiện `editCount` cũ; quản trị duyệt hay ẩn gửi kèm `editCount` đã thấy, lệch thì 409 `REVIEW_CHANGED`. Không có điều kiện này thì khách đăng chữ sạch kèm ảnh, chờ quản trị mở hàng đợi, sửa thành quảng cáo, và lần bấm "Duyệt" trên bản cũ sẽ duyệt bản mới.
- Phiếu hữu ích, báo cáo: một người một lần mỗi đánh giá, bấm lại không đếm thêm; báo cáo không tự ẩn để một nhóm người không ẩn được đánh giá xấu một cách hợp lệ.

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| AI gợi ý | Claude (advisor, 12/11): ghi điểm bằng `update` của Prisma làm nhảy `updated_at`, đụng kiểm phiên bản khi quản trị sửa sản phẩm | sửa: ghi bằng SQL thô, trigger vẫn tăng `catalog_revision` |
| AI gợi ý | Claude (advisor): phiếu tải theo thư mục cho phép ghi đè ảnh đã duyệt | sửa: máy chủ đặt khoá từng ảnh, ký `overwrite=false` ([ADR-055](../uploads/LOG.md#adr-055)) |
| AI gợi ý | Claude (advisor): chưa có bài nào chứng minh điểm mới tới được danh sách sản phẩm đọc từ bộ nhớ; web chưa kiểm token hết hạn | giữ: thêm assert ở `reviews-public.http.spec.ts` và bài web làm mới token |
| AI sai | Claude Code viết `composes` trên bộ chọn thuộc tính trong CSS module, cú pháp không hợp lệ | Claude Code tự rà và bỏ trước khi chạy test |
| AI sai | Claude Code viết `beforeEach(() => request.mockReset())`: hàm trả về mock nên Vitest gọi nó như hàm dọn dẹp, sinh lỗi giả | bắt bằng `vitest run`, đổi sang thân hàm có ngoặc |

**Kết luận:** Chọn C, chờ Bảo review và chốt.
**Bằng chứng:** `npx vitest run --project http test/reviews.http.spec.ts test/reviews-public.http.spec.ts test/admin-reviews.http.spec.ts` → 3 tệp, 23 bài qua, 120 s (12/11, chưa commit). `npx vitest run src/features/reviews` (web) → 3 tệp, 16 bài qua.

### Kết quả mong đợi → thực tế
Mong đợi: sau khi gộp, `npm run check` xanh; trên staging, một đơn thử qua `DELIVERED` viết được đánh giá có ảnh, quản trị duyệt, điểm hiện trên thẻ sản phẩm.
Thực tế: (điền sau khi có `CLOUDINARY_URL` trên Render và chạy thử).

### Điều kiện xem lại
Có vai `STAFF` (ai được duyệt); có đổi trả (`returns`) chạy thật (đánh giá của đơn đã trả có còn tính không); bộ lọc chữ bỏ sót nhiều thì thêm kiểm duyệt bằng dịch vụ ngoài.

<a id="adr-058"></a>
## 2026-11-12 · ADR-058 — Bản trên `feature/ph-01-reviews` làm nền cho đánh giá; bài kiểm còn thiếu lấy từ PR #98 của Tài

**Loại:** quyết định · **Phạm vi:** module `reviews`, web `features/reviews`; Issue #96, #97 và nhánh `feature/ph-03-product-reviews` của Tài · **Trạng thái:** đề xuất · **Người quyết:** Bảo; Tài xác nhận khi duyệt PR vào `develop` · **Commit:** (điền khi thi hành)

### Hiện trạng
- Hai bản cùng làm UC-11. PR #98 của Tài đã gộp vào `feature/ph-03-product-reviews` ngày 12/11 (merge `b1401b1`), chưa vào `develop`. Bản này theo [ADR-054](#adr-054).
- Bản PR #98 luôn ghi `PENDING` khi tạo ([reviews.service.ts:149](https://github.com/F-R-E-Y-A/fashion-shop/blob/b1401b1fcca1a0373dad7f030bc41b738263c41f/apps/api/src/modules/reviews/reviews.service.ts#L149)) và chưa có đường duyệt (để Issue #97). Khách chỉ có `GET orders/:orderId/reviews` và `POST reviews` ([reviews.controller.ts:29](https://github.com/F-R-E-Y-A/fashion-shop/blob/b1401b1fcca1a0373dad7f030bc41b738263c41f/apps/api/src/modules/reviews/reviews.controller.ts#L29), [:44](https://github.com/F-R-E-Y-A/fashion-shop/blob/b1401b1fcca1a0373dad7f030bc41b738263c41f/apps/api/src/modules/reviews/reviews.controller.ts#L44)). Chưa có hạn viết, sửa bài, điểm trung bình, ảnh.
- Bản này thiếu một số bài mà PR #98 có. Đã lấy sang ở `431a706`: hoàn tiền sau giao, sao 6 và 4.5, trường lạ `userId` và `moderationStatus`, xoá mềm, gửi đồng thời. Bài `no-store` bắt được một lỗi thật: danh sách công khai trả `isOwn`, `viewerHasVoted` theo người xem mà không đặt `Cache-Control`.
- Chưa lấy sang: E2E, web giữ nội dung khi gửi không rõ kết quả, unit cho hàm đọc của `orders`.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. PR #98 làm nền, đắp phần còn lại lên | Giữ mã của Tài; không thêm migration | Viết lại duyệt, điểm, ảnh, sửa bài; tới khi có trang duyệt thì trang công khai rỗng vì mọi bài chờ duyệt (suy luận) | Dễ, trước khi gộp vào `develop` |
| **B. Bản này làm nền, lấy bài kiểm và ý hay từ PR #98 (chọn)** | Đủ UC-11.1 tới UC-11.3, có trang duyệt và ảnh; giữ được bài kiểm của Tài | Mã trùng của PR #98 không vào `develop`; luật khác PR #98, Tài phải đồng ý | Dễ, trước khi gộp vào `develop` |
| Không làm gì | Không tốn công | Hai bản cùng phạm vi treo; không ai biết bản nào vào `develop` | — |

**Chọn B** vì bản này đã làm phần PR #98 để lại cho Issue #97 và các phần PR #98 chưa có, còn bài kiểm của PR #98 lấy sang được. Trade-off chấp nhận: chỗ hai bản khác luật thì theo bản này. Đơn `REFUNDED` hoặc đang `PAYMENT_REVIEW` không viết được; hạn 30 ngày; chữ sạch không ảnh hiện ngay; trang công khai hiện tên rút gọn, phân loại, chiều cao, cân nặng; nhận xét tối đa 1.500 ký tự; gửi trùng luôn 409; mặc định sắp "hữu ích nhất".

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| AI gợi ý | Claude Code (Opus 5.5) so hai bản theo luật và bài kiểm ngày 12/11, đề xuất lấy bản này làm nền và chuyển 9 nhóm bài từ PR #98 | giữ: 5 nhóm đã chuyển, 4 nhóm làm tiếp |
| Người phản biện | Tài: chưa trả lời; Bảo mặc định Tài đồng ý và nhờ Tài xác nhận khi duyệt PR | chờ |

**Kết luận:** Chọn B, chờ Tài xác nhận.
**Bằng chứng:** `gh pr view 98` → `MERGED`, `task/product-reviews-customer` vào `feature/ph-03-product-reviews`, merge `b1401b1` (12/11). Trên `431a706`: `npx vitest run --project http test/reviews.http.spec.ts test/reviews-public.http.spec.ts` (apps/api) → 2 tệp, 22 bài qua; `npm run check` → exit 0.

### Kết quả mong đợi → thực tế
Mong đợi: Tài duyệt PR này vào `develop`; Issue #96, #97 đóng theo PR này; `feature/ph-03-product-reviews` không mở PR vào `develop`.
Thực tế: (điền sau khi Tài duyệt).

### Điều kiện xem lại
Tài không đồng ý luật nào ở trên thì thêm mục mới cho luật đó.

<a id="adr-059"></a>
## 2026-11-12 · ADR-059 — Khách xoá được đánh giá của mình lúc nào cũng được; xoá mềm, dòng đơn không viết lại được, ảnh vào hàng xoá

**Loại:** quyết định · **Phạm vi:** module `reviews` (`DELETE /api/reviews/:id`), web `features/reviews` (tab "Đã đánh giá") · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi thi hành)

### Hiện trạng
- Kế hoạch tuần ở kho docs ghi "Viết, sửa, xóa đánh giá"; tới `06ef9d7` khách chưa xoá được: `reviews.controller.ts` chỉ có `DELETE :id/helpful`.
- Cột `reviews.deleted_at` có sẵn và mọi truy vấn đọc đã lọc `deletedAt: null` ([reviews.service.ts:66](../../../apps/api/src/modules/reviews/reviews.service.ts#L66)). Bài xoá mềm vẫn giữ `order_item_id` unique nên viết lại 409 (bài `UC-11.1/AC2` ở `431a706`).

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Không cho xoá | Đơn giản; đánh giá xấu không bị rút | Trái kế hoạch tuần; khách không gỡ được chữ và ảnh của chính mình | Dễ |
| B. Xoá cứng, cho viết lại | Khách viết lại từ đầu | Lách được luật sửa một lần và kiểm duyệt: bài bị ẩn thì xoá rồi viết lại; mất dấu vết khi có tranh chấp | Khó: dữ liệu đã mất |
| **C. Xoá mềm lúc nào cũng được, dòng đơn giữ chỗ (409), ảnh vào hàng xoá (chọn)** | Khách gỡ được chữ và ảnh; không lách được luật; CSDL còn dấu vết | Xoá nhầm thì không viết lại được dòng đơn đó | Dễ: muốn cho viết lại thì đổi điều kiện kiểm trùng |
| Không làm gì | Không tốn công | Thiếu phần "xóa" của kế hoạch tuần | — |

**Chọn C** vì giữ được quyền của khách với nội dung của mình mà không mở đường lách BR5 (sửa một lần) và BR4 (kiểm duyệt). Trade-off chấp nhận: khách xoá nhầm mất quyền đánh giá dòng đơn đó, hộp xác nhận ghi rõ điều này; ảnh đã xoá có thể còn trên CDN tới 30 ngày như ảnh bị thay khi sửa ([ADR-056](../uploads/LOG.md#adr-056)).

Các luật đi kèm:
- Khoá dòng `reviews` bằng `FOR UPDATE` trước khi đặt `deleted_at` và đọc trạng thái, rồi mới tính lại điểm (khoá `products` sau), cùng thứ tự với quản trị duyệt hay ẩn ([ADR-054](#adr-054)). Xoá đúng lúc quản trị duyệt thì điểm cuối cùng không tính bài đã xoá ([reviews.service.ts:383](../../../apps/api/src/modules/reviews/reviews.service.ts#L383)).
- Bài của người khác hay đã xoá: 404 `REVIEW_NOT_FOUND`. Web coi 404 khi xoá là đã xong (xoá ở tab khác) và tải lại danh sách.
- Phiếu hữu ích, báo cáo của bài đã xoá giữ trong CSDL; bài không còn hiện ở trang công khai, trang của khách hay hàng chờ quản trị.

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| Câu hỏi phản biện | Claude Code tự hỏi: khách xoá nhầm thì sao, có nên cho viết lại? | giữ C: cho viết lại là mở lại đường lách kiểm duyệt; hộp xác nhận ghi "Không viết lại được đánh giá cho sản phẩm này của đơn này." |

**Kết luận:** Chọn C, chờ Bảo chốt.
**Bằng chứng:** `npx vitest run --project http test/reviews.http.spec.ts` (apps/api) → 1 tệp, 19 bài qua, gồm 5 bài `UC-11.1/AC12`, `AC13` (xoá bài đang hiện, bài có ảnh chờ duyệt, bài đã ẩn, xoá đúng lúc quản trị duyệt, 404/401/400). `npx vitest run src/features/reviews` (apps/web) → 3 tệp, 21 bài qua.

### Kết quả mong đợi → thực tế
Mong đợi: sau khi gộp, khách xoá được trên staging; điểm sản phẩm và trang công khai đổi ngay; ảnh của bài đã xoá biến khỏi kho sau một lượt worker.
Thực tế: (điền sau khi gộp và chạy thử trên staging).

### Điều kiện xem lại
Khách phàn nàn xoá nhầm nhiều lần; có tranh chấp cần khôi phục bài đã xoá; có đổi trả (`returns`) chạy thật.
