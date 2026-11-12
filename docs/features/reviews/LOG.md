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
