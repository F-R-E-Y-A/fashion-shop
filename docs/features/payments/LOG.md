---
title: Payments — nhật ký
updated: 2026-10-28
status: đang dùng
owner: Bảo
---
# Payments — nhật ký

**Chức năng:** Lý do và phạm vi thay đổi tích hợp thanh toán.

## 2026-10-18 · PH-11 — một adapter VNPAY, IPN và query dùng chung settlement

**Loại:** thay đổi mã · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Theo uỷ quyền hoàn thiện luồng, dùng VNPAY trước để nghiệm thu một cổng từ đầu tới cuối. SOAP không tăng bảo đảm transaction của ngân hàng; chưa thêm protocol khi không có đối tác/rubric bắt buộc. So sánh phương án ở [ADR-032](../../LOG.md#adr-032).

Giữ Payment và reference bền vững; timeout không đồng nghĩa thất bại. Callback/query chung một settlement có khoá và transaction, không giảm trạng thái SUCCEEDED về FAILED. Bảo chưa có sandbox key, yêu cầu cứ làm và hướng dẫn cấp sau: fake HTTP chỉ trong test, không fallback trên app. [README](README.md) ghi giới hạn refund/đối soát thật.

## 2026-10-18 · PH-11 — MoMo adapter và công cụ HTTPS tunnel

**Loại:** thay đổi mã và cấu hình · **Phạm vi:** Payments, Checkout và web · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Theo yêu cầu Bảo, mở rộng sang hai cổng và chuẩn bị tunnel trước khi lấy merchant key. Strategy/Adapter/Registry giữ protocol riêng bên Payments, dùng chung settlement cho kho/đơn/giỏ. MoMo init intent được lưu trong transaction hiện có; network sau commit để không giữ khoá DB qua thời gian chờ cổng. Phương án và trade-off ở [ADR-033](../../LOG.md#adr-033).

Hướng dẫn [setup](setup.md) thay phần chỉ có VNPAY bằng đăng ký cả hai, cấu hình key/callback, same-origin login và giới hạn Quick Tunnel. Không ghi domain ngắn hạn vào tài liệu như cấu hình cố định. Cổng chưa có key vẫn bị vô hiệu hoá; chưa nghiệm thu gateway thật.

## 2026-10-18 · PH-11 — ưu tiên VNPAY và sửa lịch QueryDR theo sandbox thật

**Loại:** sửa mã và nghiệm thu · **Phạm vi:** Payments, Checkout/web · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Bảo yêu cầu VNPAY trước, MoMo để sau. Key VNPAY đã được nhập local; không đưa vào mã/nhật ký. Checkout ẩn cổng chưa cấu hình, giữ VNPAY để giải thích trạng thái chưa sẵn sàng. Return tự gọi backend đối soát một lần, không chuyển tiền theo query string của trình duyệt. Link trả tiền chỉ lấy attempt mới nhất còn pending.

Thử PAY/NCB/OTP thật trên DB fixture qua HTTPS phát hiện worker một phút gọi sớm khi khách chưa trả tiền, rồi QueryDR trả 94. [Bảng mã VNPAY](https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/) quy định giới hạn 5 phút. Dùng interval theo adapter, VNPAY 305 giây và đợi interval trước query nền đầu; return vẫn chủ động query nếu chưa query lần nào. Không giảm bảo đảm chữ ký để làm demo xanh.

Đã nhận QueryDR chữ ký hợp lệ và ghi CONFIRMED/SUCCEEDED, kho trừ một lần, giữ lượng thêm mới trong giỏ. Replay payload VNPAY ký thật bị nhận diện trùng; tamper bị từ chối. Chưa coi là nghiệm thu IPN do VNPAY chủ động gửi: endpoint vẫn cần đăng ký bên provider. Bằng chứng lệnh/output/SHA ở nhật ký ngoài repo theo quy ước.

## 2026-10-18 · PH-11 — phân biệt kết quả API query với trạng thái giao dịch hủy

**Loại:** sửa mapping gateway · **Phạm vi:** Payments · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

QueryDR của giao dịch hủy thực tế trả ResponseCode=00 (query thành công) và TransactionStatus=11 (giao dịch bị hủy), có HMAC hợp lệ. Bảng 2.5.7.2 trang 36 của [đặc tả chính thức](https://sandbox.vnpayment.vn/apis/files/VNPAY%20Payment%20Gateway_Techspec%20Post%20method%202.1.0-VN.pdf) xác nhận 08 quá thời gian, 11 hủy; 09 là hoàn tiền bị từ chối, không phải thất bại thanh toán. Adapter dùng FAILED cho 02/08/11, giữ 09 và trạng thái chưa rõ ở PENDING để không cho tạo lượt thu tiền mới khi chưa chắc chắn ([vnpay.adapter.ts:40](../../../apps/api/src/modules/payments/vnpay.adapter.ts#L40)).

Thêm [adapter contract tests](../../../apps/api/src/modules/payments/vnpay.adapter.spec.ts) và ca HTTP query-hủy-thử lại cùng deadline. Không dùng ResponseCode trên URL trình duyệt để quyết định trạng thái tiền.

<a id="adr-036"></a>
## 2026-10-28 · ADR-036 — Hoàn tiền giữ lệnh chờ dưới khoá đơn và chỉ ghi sổ khi cổng trả 00

**Loại:** quyết định · **Phạm vi:** Payments, Checkout (PH-11), ADMIN vận hành · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** [0ead671](https://github.com/F-R-E-Y-A/fashion-shop/commit/0ead671)

### Hiện trạng
- Trước sửa, mọi kiểm tra của `refundPayment` chạy ngoài khoá và khoá đơn chỉ lấy sau khi đã gọi cổng: hai lệnh song song cùng thấy số còn lại và cùng gọi Refund API ([checkout.service.ts:313-364 tại c7c59ba](https://github.com/F-R-E-Y-A/fashion-shop/blob/c7c59ba/apps/api/src/modules/checkout/checkout.service.ts#L313-L364)).
- Gọi cổng timeout 8 giây ([vnpay.service.ts:185](../../../apps/api/src/modules/payments/vnpay.service.ts#L185)); lần thử lại tạo `vnp_RequestId` mới nên có thể hoàn trùng.
- Đơn `PARTIALLY_REFUNDED` không nằm trong danh sách được hoàn; tổng đã hoàn cộng `vnp_Amount`, chỉ đúng với VNPAY.
- [Đặc tả VNPAY 2.1.0](https://sandbox.vnpayment.vn/apis/files/VNPAY%20Payment%20Gateway_Techspec%20Post%20method%202.1.0-VN.pdf) mục 2.5.5 (trang 21–26) không nói mã phản hồi refund nào chắc chắn là "chưa hoàn"; [bảng mã lỗi](https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/) đã có link ở [setup.md](setup.md) nhưng chưa đối chiếu cho refund. Trang 22 ghi `02` hoàn toàn phần, `03` hoàn một phần.
- Cũng theo trang 23 và 26, chuỗi ký request refund là `RequestId|Version|Command|TmnCode|TransactionType|TxnRef|Amount|TransactionNo|TransactionDate|CreateBy|CreateDate|IpAddr|OrderInfo` và phản hồi mang `vnp_ResponseId`, ký `ResponseId|Command|ResponseCode|Message|TmnCode|TxnRef|Amount|BankCode|PayDate|TransactionNo|TransactionType|TransactionStatus|OrderInfo`. Mã hiện ký theo thứ tự khác, thiếu `TransactionNo` và đòi `vnp_RequestId` trong phản hồi ([vnpay-signature.ts:32-58](../../../apps/api/src/modules/payments/vnpay-signature.ts#L32-L58)), nên với cổng thật lệnh hoàn sẽ không thành công (suy luận từ đặc tả, chưa thử sandbox). Nhờ quyết định này, lệnh đó chỉ nằm chờ đối soát, không ghi sai sổ; sửa chữ ký là việc riêng.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Bảng `refunds` có sẵn | Sổ riêng, đúng mô hình | `return_id` bắt buộc, phải migration và gắn luồng đổi trả chưa có | Được, nhưng tốn migration |
| **B. Lệnh `REFUND-INTENT:*` trong `payment_transactions`, claim dưới khoá đơn (chọn)** | Không migration; cùng cơ chế advisory lock như `pending()`; fail closed | Lệnh chưa rõ chặn hoàn tiếp tới khi ADMIN chốt tay | Được: chuyển sổ sang `refunds` khi làm đổi trả |
| Không làm gì | — | Hoàn trùng khi bấm lặp hoặc timeout | — |

**Chọn B.** Ba bước: dưới khoá đơn kiểm và ghi lệnh `RECEIVED`; gọi cổng ngoài transaction; dưới khoá đơn ghi `REFUND:{requestId}`, lệnh `PROCESSED`, chuyển đơn theo tổng sổ. Mọi kết quả khác `00` (timeout, sai chữ ký, mã lỗi) giữ lệnh `RECEIVED` và trả 503 `REFUND_PENDING`; ADMIN chốt bằng `POST /api/admin/payments/:id/refund/resolve` (`SUCCEEDED` ghi `REFUND:MANUAL:*`, `FAILED` mở lại quyền hoàn), cũng dưới khoá đơn. Trade-off chấp nhận: đối soát tay, chưa tự query trạng thái hoàn qua QueryDR vì ngữ nghĩa QueryDR cho giao dịch hoàn chưa được kiểm trên sandbox. ADMIN chỉ chốt được lệnh đã có lỗi trả về hoặc quá 60 giây, để không chốt lệnh còn đang chờ cổng.

### Kết quả mong đợi → thực tế
Mong đợi: [checkout-refund.http.spec.ts](../../../apps/api/test/checkout-refund.http.spec.ts) — hai lệnh song song chỉ gọi cổng một lần; hoàn một phần hai lần ra `PARTIALLY_REFUNDED` rồi `REFUNDED`; mất kết nối hoặc mã lỗi giữ lệnh chờ và chặn lệnh mới; không chốt được lệnh đang chờ cổng; chỉ ADMIN.
Thực tế: 2026-10-28 · `npx vitest run test/checkout-refund.http.spec.ts test/checkout-payment.http.spec.ts test/cod.http.spec.ts` → 3 tệp, 29 test đạt trên DB test local; chưa thử Refund API sandbox thật.

### Điều kiện xem lại
Đối chiếu được bảng mã lỗi cho refund để phân loại mã chắc chắn từ chối; kiểm được QueryDR cho giao dịch hoàn để tự đối soát; làm luồng đổi trả (chuyển sổ sang bảng `refunds`).

## 2026-10-28 · PH-11 — ký Refund API VNPAY theo đặc tả 2.1.0

**Loại:** thay đổi mã · **Phạm vi:** Payments, Checkout · **Commit:** [44b5c57](https://github.com/F-R-E-Y-A/fashion-shop/commit/44b5c57)

Đối chiếu [đặc tả 2.1.0](https://sandbox.vnpayment.vn/apis/files/VNPAY%20Payment%20Gateway_Techspec%20Post%20method%202.1.0-VN.pdf) mục 2.5.5 (trang 21–26) cho thấy refund ký sai thứ tự, thiếu `vnp_TransactionNo` và đòi `vnp_RequestId` trong phản hồi, trong khi VNPAY trả `vnp_ResponseId` ([ADR-036](#adr-036)). Đã sửa [vnpay-signature.ts](../../../apps/api/src/modules/payments/vnpay-signature.ts) theo trang 23 và 26; request gửi kèm số giao dịch cổng lấy từ receipt thanh toán thành công. Cách đọc đặc tả được kiểm bằng `queryResponseFields` đã chạy trên sandbox, khớp trang 20.

`02` chỉ gửi khi hoàn trọn số đã thu ở lần đầu; phần còn lại sau một lần hoàn một phần gửi `03` (trang 22: 02 toàn phần, 03 một phần). URL mặc định của refund đổi sang cùng endpoint với QueryDR (`VNPAY_QUERY_URL`), vẫn ghi đè được bằng `VNPAY_REFUND_URL`; đặc tả không ghi URL riêng nên đây là suy luận.

Bằng chứng: `npx vitest run src/modules/payments test/checkout-refund.http.spec.ts` → 4 tệp, 26 test đạt, gồm ca so chữ ký với chuỗi viết tay theo trang 23. Chưa thử Refund API sandbox thật: lần thử đầu là nghiệm thu cần làm.


## 2026-11-01 · PH-11 — hoàn tiền MoMo qua Refund API, mở hủy và hoàn cho đơn trả MoMo

**Loại:** thay đổi mã · **Phạm vi:** Payments, Checkout · **Commit:** (điền khi gộp)

[ADR-038](../../LOG.md#adr-038) chỉ mở "hủy và hoàn" khi cổng có Refund API, nên đơn trả MoMo không hủy được ở cả trang khách lẫn trang quản trị, và tiền MoMo về muộn trên đơn đã hủy nằm ở `PAYMENT_REVIEW` không có nút xử lý. `MomoAdapter.refund` gọi `/v2/gateway/api/refund`, ký `accessKey, amount, description, orderId, partnerCode, requestId, transId` theo thứ tự chữ cái, hoàn theo `transId` đã ghi làm receipt lúc thu; `MomoAtmAdapter` kế thừa. Luồng ba bước và fail closed của [ADR-036](LOG.md#adr-036) giữ nguyên: mã khác 0, phản hồi lệch lệnh hay không tới được cổng đều giữ lệnh `RECEIVED` chờ ADMIN chốt.

Chưa đối chiếu được trang đặc tả: `developers.momo.vn` trả 403 cho công cụ đọc; thứ tự trường ký lấy từ kết quả tìm kiếm trên trang [Reverse & Refund](https://developers.momo.vn/v3/docs/payment/api/payment-api/refund/) (suy luận, cần mở trang bằng trình duyệt để xác nhận). Phản hồi refund không kiểm chữ ký, giống `query`: chỉ nhận từ allowlist HTTPS và khớp `partnerCode`, `orderId`, `requestId`, `amount`. Chưa thử MoMo sandbox thật.

Bằng chứng: `npx vitest run src/modules/payments/momo.adapter.spec.ts` → 8 test đạt; `npx vitest run --project http test/checkout-momo.http.spec.ts test/checkout-refund.http.spec.ts` → 2 tệp, 19 test đạt, gồm khách hủy đơn trả MoMo ra `REFUNDED` và MoMo từ chối thì đơn vẫn hủy, lệnh giữ chờ, bấm lại không gửi lệnh thứ hai. Tài liệu đã sửa theo: [README.md](README.md) mục hoàn tiền.
