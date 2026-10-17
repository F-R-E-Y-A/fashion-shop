---
title: Giỏ hàng — bản đồ PH-02
updated: 2026-10-17
status: đã tích hợp, tiếp tục nghiệm thu
owner: Duy
---
# Giỏ hàng

**Chức năng:** Trạng thái PH-02, ranh giới với xác thực và sản phẩm, nơi đọc API, giao diện và phần cần nghiệm thu.

| Mục | Hiện trạng |
|---|---|
| Người sở hữu | Duy; `apps/api/src/modules/cart`, `apps/web/src/features/cart`, bảng trong `orders.prisma` |
| Dòng việc | PH-02, [PR #15](https://github.com/F-R-E-Y-A/fashion-shop/pull/15), đã gộp ngày 02/10 |
| Commit tích hợp hiện tại | `262ac81` trong lịch sử `develop`; GitHub PR còn ghi merge SHA cũ `ff22f9e` trước đợt sửa lịch sử |
| Đặc tả | Chuẩn hoá HT-04 tại [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26), chưa gộp ngày 04/10 |

## Đã cài trong mã

Controller giỏ hỗ trợ đọc giỏ, thêm dòng, sửa số lượng, xoá dòng, xoá toàn giỏ và gộp giỏ khách vào tài khoản (`apps/api/src/modules/cart/cart.controller.ts:31`, `:39`, `:48`, `:58`, `:67`, `:76`). Hình dạng thật xem Swagger `/api/docs`, không chép schema phản hồi vào tài liệu.

Người đăng nhập lấy principal từ `CurrentUser`; khách vãng lai dùng `x-guest-token`. Client không tự truyền `user_id` để nhận diện người đăng nhập (`cart.controller.ts:14`, `:27`, `:33`). Route `/gio-hang` đã nối vào app (`apps/web/src/app/routes.tsx:48`).

## P0 ownership — phạm vi CRUD

Đọc, thêm, sửa và xoá giỏ dùng principal đã xác thực nếu có; token khách không thay đổi chủ tài khoản. Giỏ tài khoản mới luôn có `guestToken: null`. Lookup khách bắt buộc `userId: null`; token phải dài 1–64 ký tự chữ ASCII, số, `_` hoặc `-`, giữ tương thích UUID của frontend và token opaque cũ theo dạng này ([cart-transaction.ts:8](../../../apps/api/src/modules/cart/cart-transaction.ts#L8), [cart.service.ts:47](../../../apps/api/src/modules/cart/cart.service.ts#L47)). Header Authorization có mặt, kể cả rỗng, phải đi qua AuthGuard; thông tin sai không được hạ xuống guest (`apps/api/src/modules/cart/optional-auth.guard.ts:16`).

Giỏ legacy có cả `userId` và `guestToken` vẫn dùng được qua principal chủ tài khoản. Guest CRUD với token đó trả 409 trước khi đọc dòng hàng hoặc ghi; không tự tách token, xoá hay chuyển chủ giỏ. Lỗi unique được retry bằng transaction mới, vẫn chỉ lookup theo cùng ownership; tối đa ba lần thử rồi trả 409 (`apps/api/src/modules/cart/cart-transaction.ts:28`). Không có migration hoặc repair trong bản sửa này.

## Gộp giỏ nguyên tử — bản sửa chờ review

Nguồn merge chỉ được là giỏ có `userId: null`. Token legacy nằm trên giỏ tài khoản trả 409, kể cả khi đó là chính tài khoản đang đăng nhập; không cộng hay xoá giỏ đó. Token sai định dạng hoặc header rỗng trả 400; thiếu header, nguồn đã bị gộp hoặc không tồn tại thì chỉ trả giỏ tài khoản, không tạo lại giỏ guest ([cart.service.ts:195](../../../apps/api/src/modules/cart/cart.service.ts#L195)).

Mọi thao tác Cart, gồm đọc/tạo giỏ, CRUD và merge, chạy trong transaction với khoá advisory theo chủ sở hữu. Merge khoá cả guest token và user, theo cùng thứ tự ở mọi request; khoá được băm trước khi truyền vào SQL. `ReadCommitted` bảo đảm truy vấn sau khi chờ khoá thấy commit mới nhất. Đọc nguồn, cộng các dòng, xoá nguồn và tạo snapshot phản hồi cùng transaction; lỗi thì rollback toàn bộ ([cart-transaction.ts:20](../../../apps/api/src/modules/cart/cart-transaction.ts#L20), [cart.service.ts:65](../../../apps/api/src/modules/cart/cart.service.ts#L65), [mergeCarts:195](../../../apps/api/src/modules/cart/cart.service.ts#L195)).

Hai request cùng nguồn không cộng hai lần; hai nguồn cùng tài khoản không tranh tạo giỏ đích. Các biến thể trùng vẫn cộng số lượng như trước, không áp trần nghiệp vụ mới; tổng vượt `Int` PostgreSQL trả 409 và giữ nguyên hai giỏ. Lỗi P2002/P2034 chỉ được retry sau khi transaction cũ rollback, tối đa ba lần thử ([cart.service.ts:215](../../../apps/api/src/modules/cart/cart.service.ts#L215), [cart-transaction.ts:40](../../../apps/api/src/modules/cart/cart-transaction.ts#L40)).

Idempotency áp dụng cho nguồn đã tiêu thụ, không phải một idempotency key vĩnh viễn. Nếu một request guest đến sau merge, nó có thể tạo giỏ guest mới dưới token cũ; retry merge sẽ xử lý nguồn mới đó. Client cần bỏ token sau merge thành công và phối hợp các request đang gửi khi đổi phiên. Bản sửa này chưa thay frontend, không khẳng định đã nghiệm thu toàn bộ luồng Auth–Cart trên trình duyệt.

### Kiểm thử

- Unit/HTTP với Prisma giả: [ownership unit](../../../apps/api/src/modules/cart/cart.ownership.spec.ts), [ownership HTTP](../../../apps/api/src/modules/cart/cart.ownership.http.spec.ts), [merge unit](../../../apps/api/src/modules/cart/cart.merge.spec.ts). HTTP mock dùng JWT/guard/controller/service thật, không chứng minh khoá PostgreSQL.
- PostgreSQL thật: [cart-merge.http.spec.ts](../../../apps/api/test/cart-merge.http.spec.ts), helper [create-cart-test-app.ts](../../../apps/api/test/helpers/create-cart-test-app.ts). Có CRUD, legacy cùng/khác tài khoản, merge lặp, 8 merge đồng thời, hai tài khoản tranh nguồn, hai nguồn chung đích, rollback sau ghi/xoá nguồn, tràn số lượng, guest add đồng thời và validation/401.
- Suite Cart mới chỉ dựng Cart + AuthGuard + JWT + PostgreSQL; không khởi động AuthService, Redis hoặc SMTP. Bài cũ `apps/api/test/cart.http.spec.ts` dùng cả ứng dụng và cần Redis.
- Mọi suite PostgreSQL gọi `resetDatabase()`/TRUNCATE; chỉ chạy trên database test cô lập. Không chạy lên database đang sử dụng.

Đề xuất xử lý legacy ở pha riêng: thống kê metadata cần thiết, backup và duyệt kế hoạch repair. Có thể xoá liên kết guest token trên giỏ tài khoản, giữ `userId`, cart ID và dòng hàng; đây là thay đổi dữ liệu chưa thực hiện. Sau repair mới cân nhắc constraint một loại chủ sở hữu. Client giữ token legacy vẫn nhận 409; việc cấp lại token là phần tiếp theo cần chốt.

## Phối hợp và nghiệm thu

- Xác thực qua cửa `auth/index.ts`; sản phẩm công bố hợp đồng biến thể ở [README module products](../../../apps/api/src/modules/products/README.md).
- Giỏ hàng và [tồn kho](../inventory/README.md) là hai nghiệp vụ khác nhau; tồn kho chưa có hàm đọc để Catalog lọc cỡ theo số lượng còn.
- Tiếp tục kiểm luồng đăng nhập → gộp giỏ → thay số lượng/xoá, chuẩn bị hợp đồng với checkout. Đây là kế hoạch nghiệm thu, không khẳng định kiểm tay toàn bộ đã hoàn tất.

Lịch sử đối chiếu ở [LOG.md](LOG.md).
