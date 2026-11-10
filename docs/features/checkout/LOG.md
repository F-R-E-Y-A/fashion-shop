---
title: Checkout — nhật ký
updated: 2026-11-03
status: đang dùng
owner: Bảo
---
# Checkout — nhật ký

**Chức năng:** Ghi thay đổi của luồng checkout; quyết định liên module nằm trong LOG chung.

## 2026-10-18 · PH-11 — xác nhận mua và giữ hàng khi sang payment

**Loại:** thay đổi mã · **Phạm vi:** Checkout API/web · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Bảo yêu cầu làm toàn bộ luồng và cho phép hoàn thiện bằng cổng giả lập trên DB riêng khi chưa có VNPAY sandbox key. Chọn Checkout làm orchestrator để tránh vòng phụ thuộc Orders–Payments và giữ mọi ghi dữ liệu qua service sở hữu bảng. Quyết định, các lựa chọn và trade-off ở [ADR-032](../../LOG.md#adr-032).

Fingerprint buộc xác nhận lại khi giá/địa chỉ/giỏ/ship đổi; idempotency buộc retry HTTP dùng lại đơn. Không giữ transaction mở trong thời gian khách thao tác trên cổng. Test lỗi sau trừ kho kiểm rollback cả payment, lịch sử, kho và giỏ ([checkout-payment.http.spec.ts](../../../apps/api/test/checkout-payment.http.spec.ts)). Trạng thái hôm nay và giới hạn ở [README](README.md).

## 2026-10-18 · PH-11 — return chủ động đối soát và ưu tiên VNPAY

**Loại:** sửa giao diện · **Phạm vi:** Checkout/web · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Theo phạm vi mới của Bảo, ẩn MoMo chưa cấu hình. Return chỉ dùng reference để đọc đơn có ownership, sau đó yêu cầu backend đối soát một lần; query string báo hủy/thành công không quyết định tài chính. Payment link chỉ lấy attempt mới nhất còn pending để tránh mở attempt cũ. [Web tests](../../../apps/web/src/features/checkout/checkout.test.tsx) kiểm lựa chọn VNPAY, retry và return mâu thuẫn với kết quả server.

## 2026-10-20 · PH-11 — giao diện checkout/đơn theo khung giỏ, mã đơn ngắn, sửa hai đường cụt

**Loại:** sửa giao diện · **Phạm vi:** Checkout web, Orders, Cart · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Kiểm trên Chrome (1366 và 390 px, DB E2E riêng) thấy ba trang checkout, kết quả đơn và danh sách đơn chưa theo token, mã đơn dài 34 ký tự tràn khung trên mobile, danh sách đơn nằm ngoài khu tài khoản. Viết lại ba trang theo khung trang giỏ (hai cột, thẻ trắng, tóm tắt espresso, nút amber); danh sách đơn thành tab `/tai-khoan/don-hang`, menu avatar thêm "Đơn hàng của tôi". Mã đơn mới 16 ký tự ([newOrderCode](../../../apps/api/src/modules/orders/orders.service.ts#L16)). Lúc kiểm lộ ra hai đường cụt khi giữ đơn vị cuối, xử lý theo [ADR-035](../../LOG.md#adr-035). Kèm: trang 404 và trạng thái chờ phiên có khung riêng, chữ COD sai trên trang đăng nhập đổi sang VNPAY.

## 2026-10-30 · PH-11 — pool kết nối cấu hình được, chỉ mục giữ hàng theo biến thể, giới hạn tạo đơn

**Loại:** thay đổi mã và cấu hình · **Phạm vi:** Checkout, Inventory, hạ tầng Prisma · **Commit:** [beb19f4](https://github.com/F-R-E-Y-A/fashion-shop/commit/beb19f4), [a5faadb](https://github.com/F-R-E-Y-A/fashion-shop/commit/a5faadb)

Việc 5 trong kế hoạch chịu tải 1000 khách. Pool `pg` trước đây không cấu hình: mặc định 10 kết nối mỗi process (`node_modules/pg/lib/defaults.js:42`) và chờ kết nối không giới hạn, trong khi transaction tạo đơn giữ kết nối tới 15 giây. Nay `DATABASE_POOL_MAX` và `DATABASE_POOL_TIMEOUT_MS` (mặc định 10 và 10000 ms) đi qua [connection.ts](../../../apps/api/src/infra/prisma/connection.ts); giá trị tối ưu chờ đo bằng k6 (việc 6), không đoán trước.

Đọc tồn khả dụng lọc giữ hàng theo biến thể và hạn, nhưng bảng chỉ có chỉ mục `expires_at` và `order_id`; thêm `(product_variant_id, expires_at)` bằng [migration](../../../apps/api/prisma/migrations/20261030090000_ph11_reservation_variant_index/migration.sql), khai trong schema nên `prisma migrate diff` với DB test vẫn ra migration rỗng. Chưa đo hiệu quả: DB test quá nhỏ để planner chọn chỉ mục.

Giới hạn 10 lần tạo đơn và 20 lần tạo lượt thanh toán mỗi phút mỗi tài khoản, khoá HMAC như gợi ý tìm kiếm. Redis lỗi thì cho qua, vì transaction checkout đã tự chặn đơn trùng và bán vượt. Đây là chặn một tài khoản bắn liên tục, không phải backpressure toàn hệ thống.

Bằng chứng: unit `checkout-rate-limit` 3/3 và `connection` 2/2; HTTP cod (thêm ca 11 lần tạo đơn trả 429) + checkout-payment + checkout-momo + checkout-refund + cart → 5 tệp, 51 test đạt trên DB test.

## 2026-10-30 · PH-11 — đo tải checkout trên SKU hot: đúng đắn giữ ở 1000 khách, năng lực chưa đạt

**Loại:** thay đổi mã và số đo · **Phạm vi:** Checkout, hạ tầng Prisma, bộ lọc lỗi HTTP · **Commit:** (commit kế tiếp trên nhánh `feature/ph-11-hardening`)

Việc 6 dùng bộ tải Vitest chạy trong app ([checkout-hot-sku.load.ts](../../../apps/api/test/load/checkout-hot-sku.load.ts), `npm run test:load -w apps/api`) thay cho k6: máy chưa cài k6, và chạy trong app thì kiểm được DB ngay sau tải. Kịch bản: `LOAD_USERS` khách cùng tranh một biến thể còn `LOAD_STOCK`, mỗi khách preview rồi tạo đơn COD (không gọi cổng ngoài). API, PostgreSQL và client tải chạy chung một máy Windows, nên số đo là cận dưới của một process, không phải số production.

Lượt đầu, 200 khách với pool 10 ra 28/389 request 500, log ghi 74 lần `Unable to start a transaction in the given time`: `maxWait` mặc định 2 giây của Prisma. Nay `transactionOptions.maxWait` bằng `DATABASE_POOL_TIMEOUT_MS`; hết kết nối trong hạn (Prisma P2028 hoặc `pg-pool` `timeout exceeded when trying to connect`) trả 503 `SERVER_BUSY` kèm `Retry-After: 2` thay vì 500 ([all-exceptions.filter.ts](../../../apps/api/src/common/filters/all-exceptions.filter.ts)).

| Lượt (`LOAD_USERS` / ramp / pool) | Đơn / giữ hàng | 500 | 503 | p95 preview | p95 tạo đơn |
|---|---|---|---|---|---|
| 1 / 0 / 10 | 1 / 1 | 0 | 0 | 113 ms | 135 ms |
| 50 / 0 / 10 | 50 / 50 | 0 | 0 | 1185 ms | 2240 ms |
| 200 / 0 / 10, trước sửa | 50 / 50 | 28 | 0 | 2822 ms | 4325 ms |
| 200 / 0 / 10, sau sửa | 50 / 50 | 0 | 0 | 3136 ms | 5184 ms |
| 1000 / 3000 ms / 10, sau sửa | 50 / 50 | 0 | 43 | 16062 ms | 19044 ms |
| 1000 / 3000 ms / 30, trước sửa lỗi pg-pool | 50 / 50 | 45 | 182 | 14158 ms | 16181 ms |

Lệnh: `LOAD_USERS=<n> LOAD_RAMP_MS=<ms> DATABASE_POOL_MAX=<pool> npx vitest run --project load` trong `apps/api`, DB test local, 30/10. Không có lượt nào bán vượt. 1000 khách mở kết nối cùng một mili giây thì client nhận `ECONNREFUSED` (hàng chờ listen của server cục bộ đầy), nên lượt 1000 rải đều trong 3 giây.

Mục tiêu p95 tạo đơn dưới 800 ms ở 1000 khách **chưa đạt**. Pool 30 không nhanh hơn pool 10, nên nút thắt không phải số kết nối; một process xử lý khoảng 35–65 request/giây (100 request trong 2,9 giây ở lượt 50 khách). Suy luận, chưa tách đo: CPU của process Node cho chuỗi khoảng 10 query mỗi preview/tạo đơn, cộng khoá SKU hot khi giữ hàng. Hướng tiếp: đo CPU Node và `pg_stat_activity` khi tải, giảm số query mỗi request, chạy nhiều instance API sau PgBouncer, rồi đo lại bằng chính bộ này.


## 2026-11-01 · PH-11 — rút lại nhận định "pool 30 không nhanh hơn pool 10" của lượt đo tải 30/10

**Loại:** số đo · **Phạm vi:** Checkout, hạ tầng Prisma · **Commit:** [bdb4228](https://github.com/F-R-E-Y-A/fashion-shop/commit/bdb4228) (bộ đo), gộp develop ở [49f5e22](https://github.com/F-R-E-Y-A/fashion-shop/commit/49f5e22)

Mục đo tải 30/10 ở trên kết luận số kết nối không phải nút thắt vì pool 30 không nhanh hơn pool 10. Kết luận đó chưa đứng được: trong bảng, lượt pool 30 chạy *trước* sửa lỗi `pg-pool` (45 lần 500, 182 lần 503), còn lượt pool 10 chạy *sau*; hai lượt không cùng mã. Thêm nữa, bộ đo gọi API bằng supertest trong cùng tiến trình Node, nên p95 gồm cả thời gian phía client tranh CPU với server (suy luận, chưa tách đo).

Giữ nguyên: đúng đắn ở 1000 khách (50 đơn / 50 giữ hàng, không bán vượt) và mục tiêu p95 tạo đơn < 800 ms chưa đạt. Muốn kết luận về pool thì đo lại pool 10 và 30 trên cùng commit, client tải chạy ở tiến trình riêng, kèm CPU Node và `pg_stat_activity`.


<a id="adr-043"></a>
## 2026-11-03 · ADR-043 — Giữ điều kiện đơn hàng trong URL

**Loại:** quyết định · **Phạm vi:** Orders/Checkout web · **Trạng thái:** đề xuất · **Người quyết:** Tài, Duy/Bảo review · **Issue:** [#61](https://github.com/F-R-E-Y-A/fashion-shop/issues/61)

### Hiện trạng và phản biện

Trên develop `8fe405e`, link detail/back bỏ điều kiện, draft chỉ khởi tạo một lần từ q, Number nhận page
không phải số nguyên. 14 ca regression đỏ trước sửa ở kho docs; giữ nguyên guard/cache từ PR #58.
Chỉ lưu return trong history state không bền khi mở tab mới; nhận URL return tự do cần thêm kiểm tra và dễ sai.

### Phương án đề xuất

Một codec tab/q/page cho canonical URL, query và request. Detail mang chính query đó; đường về luôn dựng
`/admin/orders` từ allowlist, bỏ tham số lạ/lặp. Canonical dùng replace và chặn query tới khi URL hợp lệ.
Đồng bộ draft theo navigation key như Users. Trang sau rỗng có link phục hồi theo totalPages của response thật,
không tự redirect vì tập dữ liệu có thể tiếp tục đổi. PageSize 20, không thay API hoặc chính sách tiền/kho.

### Thực tế và điều kiện xem lại

Triển khai trên bugfix/admin-orders-navigation, đã fetch và tích hợp develop 63d9798 có PR #60 bằng merge commit.
Giữ cả điều hướng và JSX/CSS shell; chạy lại kiểm chứng sau ghép. Kết quả/check/QA và giới hạn tại kho docs.
AC điều hướng ở orders/use-cases.md là phần đề xuất UC-12.1 từ PR #26, không coi đã được Duy chốt.
Xem lại nếu thêm pageSize/filter, đổi tab backend, chia quyền resource hoặc muốn chia sẻ thêm ngữ cảnh detail.
