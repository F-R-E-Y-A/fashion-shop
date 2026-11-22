---
title: Thứ tự khoá cơ sở dữ liệu
updated: 2026-11-22
status: đang dùng
owner: Bảo
---
# Thứ tự khoá cơ sở dữ liệu

**Chức năng:** Mỗi giao dịch khoá gì, theo thứ tự nào, để thêm mã mới không tạo vòng chờ (deadlock) và biết xung đột còn sót trả gì.

Mọi khoá dưới đây là khoá trong transaction: advisory `pg_advisory_xact_lock` hoặc khoá dòng `SELECT … FOR UPDATE/SHARE`. Tất cả tự nhả khi commit hoặc rollback. Không có khoá phiên, khoá Redis hay khoá trong bộ nhớ. Đọc từ mã nhánh `feature/ph-11-concurrency` ngày 22/11.

## Luật

1. **Lấy khoá theo đúng thứ tự trong bảng chuỗi đơn hàng.** Bỏ bậc được, đảo bậc thì không.
2. **Nhiều khoá cùng loại thì sắp theo khoá**, như giỏ (`cart-transaction.ts:18`), biến thể (`inventory-operations.ts:8`) và danh mục (`category-visibility.ts:81`, `ORDER BY id`).
3. **Trạng thái dùng để quyết định phải đọc sau khi đã có khoá.** Đọc trước khoá rồi mới quyết là lỗi đọc cũ. `cancel` từng mắc lỗi này ([ADR-125](../features/checkout/LOG.md#adr-125)).
4. **Deadlock hoặc lỗi tuần tự hoá còn sót** (P2034, hoặc P2010 kèm 40P01/40001) thì chạy lại transaction nếu đường đó có retry. Đường không có retry trả 409 `CONCURRENT_UPDATE`, không trả 500 ([ADR-124](../LOG.md#adr-124), `infra/prisma/db-errors.ts:35`).

## Chuỗi đơn hàng: giỏ → đơn → voucher → kho

| Bậc | Khoá | Ở đâu | Ai lấy |
|---|---|---|---|
| 1 | advisory `checkout:<idempotencyKey>` | `checkout.service.ts:460` | chỉ tạo đơn |
| 2 | advisory `cart:<owner>` (băm sha256, sắp theo owner) | `cart-transaction.ts:17-20` | tạo đơn `checkout.service.ts:461`; `withOrder` `:694`; CRUD và merge giỏ `cart-transaction.ts:37` |
| 3 | advisory `order:<id>` | `orders.service.ts:144` | `withOrder` `checkout.service.ts:695`; vận chuyển `shipping.service.ts:326, 471, 524, 585, 873` |
| 4 | dòng `vouchers` FOR UPDATE | `promotions.service.ts:272` | tạo đơn ghi lượt voucher `checkout.service.ts:549` |
| 5 | advisory `inventory:<variantId>` (sắp theo id) | `inventory-operations.ts:7-10` | `reserve`, `release`, `restock`, `restockReturned` `inventory.service.ts:33, 56, 73, 100`; chỉnh tồn `admin-inventory.service.ts:188` |
| 6 | advisory `refund-transfer:<reference>` | `checkout.service.ts:1227` | ghi hoàn chuyển khoản, sau bậc 2–3 |

`withOrder` (`checkout.service.ts:685-702`) là cửa vào chung cho mọi thao tác trên một đơn đã có. Nó lấy bậc 2 rồi bậc 3, rồi mới đọc đơn trong cùng transaction. Các đường đi qua đây:

- Khách huỷ, gồm cả huỷ-và-hoàn: `:717`, `:747`.
- IPN, return và query của cổng: `settlement.service.ts:87`.
- Worker hết hạn: `settlement.service.ts:188` gọi `cancel(…, true)`.
- Quản trị đơn: `order-admin.service.ts:137`.
- Trả hàng: `returns.service.ts:107, 199` và `admin-returns.service.ts:303`.

Vì cả ba bên IPN, khách huỷ và worker cùng xếp hàng trên khoá giỏ của chủ đơn, kết cục chỉ phụ thuộc ai lấy khoá trước. Bài `PH-11 Pha 3` trong [checkout-payment.http.spec.ts](../../apps/api/test/checkout-payment.http.spec.ts) ép từng thứ tự (`UC-07.4/AC8`, `UC-08.2/AC10`).

Vận chuyển chỉ lấy bậc 3 rồi tới bậc 5: `restock` ở `shipping.service.ts:1183`. Sau đó nó xoá lượt voucher ở `:1186`. Bỏ bậc 2 vẫn đúng luật 1, vì không đường nào giữ bậc 3 rồi mới xin bậc 2.

### Vì sao huỷ đơn không ngược chiều với tạo đơn ở voucher và kho

Tạo đơn khoá dòng voucher (bậc 4) rồi mới giữ kho (bậc 5) (`checkout.service.ts:549` rồi `:575`). Huỷ thì nhả kho trước (`checkout.service.ts:760`, `inventory.release`), rồi mới gọi `releaseVoucherUsage`. Hàm này chỉ `deleteMany` dòng `voucher_usages` (`promotions.service.ts:332-336`) và không khoá dòng `vouchers`.

Xoá dòng con không khoá dòng cha. Hai bên cũng không đụng cùng một dòng `voucher_usages`, nên không có vòng chờ (suy luận theo cách PostgreSQL kiểm khoá ngoại; chưa có bài đo riêng). Nếu sau này huỷ đơn cần khoá dòng voucher, ví dụ để cộng lại lượt dùng, thì phải gọi trước `inventory.release`.

## Các miền khác: không giao với chuỗi đơn hàng

| Miền | Khoá | Ở đâu | Ghi chú |
|---|---|---|---|
| Danh mục → sản phẩm | dòng `categories` FOR UPDATE, sắp theo id; rồi dòng `products` FOR UPDATE | `category-visibility.ts:79-91`, `product-status.ts:24`; đổi trạng thái `admin-products.service.ts:887-907` | Luôn danh mục trước. Đường này có retry `runCategoryTxWithRetry` |
| Tạo sản phẩm | advisory `product-create:<id>` → danh mục | `admin-products.service.ts:363`, `:380` | |
| Đánh giá → sản phẩm | dòng `reviews` FOR UPDATE → dòng `products` FOR UPDATE khi tính điểm | `admin-reviews.service.ts:203`, `reviews.service.ts:390`, `products.service.ts:591` | Cùng thứ tự cho khách và quản trị (ADR-054) |
| Khuyến mãi | dòng `promotions` FOR UPDATE; tạo theo id thì advisory `hashtext(id)` | `promotion-concurrency.ts:13`, `promotions.service.ts:743` | Chỉ thao tác quản trị; tạo đơn không khoá dòng khuyến mãi |
| Sổ địa chỉ | advisory `user-addresses:<userId>` | `addresses.service.ts:185` | Chỉ trong `addresses.service.ts:84, 116, 155` |
| OTP | advisory HMAC `otp-issue:<purpose>:<email>` | `otp.service.ts:122-125` | Băm để email không vào tham số SQL |
| Phiên đăng nhập | dòng `users` FOR SHARE (tạo/xoay phiên), FOR NO KEY UPDATE (đăng xuất, đổi mật khẩu) | `user-session-lock.ts:31, 50`; `auth.service.ts:423, 501` | |
| Báo cáo | `pg_try_advisory_xact_lock` | `reporting-aggregator.service.ts:42` | Không chờ: không lấy được thì bỏ lượt |
| Dọn ảnh mồ côi | `FOR UPDATE SKIP LOCKED` | `media-cleanup.service.ts:125` | Không chờ |

Không miền nào ở bảng trên lấy khoá giỏ, đơn, voucher hay kho trong cùng transaction (`grep` `lockForCheckout|orders.lock|lockStock|lockVoucher` trên `src/modules` ngày 22/11). Vì vậy không thể có vòng chờ với chuỗi đơn hàng.

Tạo đơn chèn dòng tham chiếu `users`, nên lấy FOR KEY SHARE trên dòng đó. Khoá này không xung đột với FOR SHARE hay FOR NO KEY UPDATE của luồng phiên, nên đặt hàng không phải chờ đăng nhập hay đăng xuất (suy luận theo bảng xung đột khoá dòng của PostgreSQL).

## Thêm mã mới

- Thao tác trên một đơn đã có thì đi qua `CheckoutService.withOrder`, đừng tự lấy `orders.lock`, trừ khi chắc chắn không bao giờ cần khoá giỏ (như vận chuyển).
- Cần khoá mới thì đặt nó vào đúng bậc trong bảng và cập nhật tài liệu này trong cùng pull request.
- Khoá advisory mới đặt tiền tố miền, như `<miền>:<id>`, và dùng `hashtextextended(…, 0)`. Riêng `promotions.service.ts:743` còn dùng `hashtext(id)` không tiền tố. Không gây lỗi đúng, chỉ là không cùng khuôn.
- Có tranh chấp thì viết bài HTTP ép thứ tự bằng khoá, như `inOrder` trong bài `PH-11 Pha 3`. Không dựa vào `Promise.all` chạy may rủi, và luôn kiểm ngược bằng cách bỏ khoá xem bài có đỏ không.
