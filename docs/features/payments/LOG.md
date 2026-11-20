---
title: Payments — nhật ký
updated: 2026-11-20
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

<a id="adr-111"></a>
## 2026-11-20 · ADR-111 — Đơn trả trước được hoàn tay bằng mã chuyển khoản, cổng hoàn qua API bật theo môi trường

**Loại:** quyết định · **Phạm vi:** Payments, Checkout, Returns, trang đơn admin; ADMIN vận hành staging · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** [279cdb5](https://github.com/F-R-E-Y-A/fashion-shop/commit/279cdb5)

### Hiện trạng
- Tại `8e539fd`, hệ thống coi cổng có hàm `refund` và đủ khoá là hoàn được, không xét môi trường: [checkout.service.ts:422](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/checkout/checkout.service.ts#L422) (`selfRefundablePayment`), [:583](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/checkout/checkout.service.ts#L583) (`refundPayment`), [order-admin.service.ts:133](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/checkout/order-admin.service.ts#L133) (nút hoàn trang đơn admin).
- Đơn trả trước không có đường hoàn ngoài cổng; COD thì có, qua `recordManualRefund` [checkout.service.ts:810](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/checkout/checkout.service.ts#L810), gọi từ trả hàng nhánh `BANK_TRANSFER` [admin-returns.service.ts:143](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/returns/admin-returns.service.ts#L143), mà [return-rows.ts:47](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/returns/return-rows.ts#L47) chỉ trả `BANK_TRANSFER` cho COD.
- Staging: hai lệnh hoàn VNPAY cho yêu cầu trả `14c1b42f…` đều quá 8 s (18/11; lần đầu chốt `FAILED`, lần hai còn treo). Ngày 20/11 06:17Z, `POST /api/orders/:id/reconcile` trên Render mất 8,14 s và 8,12 s, `last_checked_at` lùi 280 s (vào nhánh `backoff`); cùng phút, `curl -d {}` từ máy local tới `sandbox.vnpayment.vn/merchant_webapi/api/transaction` trả 200 trong 0,13–0,16 s, 3/3 lần. Timeout cứng 8000 ms ở [vnpay.service.ts:124](../../../apps/api/src/modules/payments/vnpay.service.ts#L124) và [:191](../../../apps/api/src/modules/payments/vnpay.service.ts#L191).
- Nguyên nhân, đo ngày 20/11 khoảng 09:00Z bằng check-host.net: `curl "https://check-host.net/check-tcp?host=sandbox.vnpayment.vn:443&max_nodes=40"` rồi đọc `check-result/<id>` → node Việt Nam `vn1` nối được trong 0,055 s, 38 node nước khác `Connection timed out`, 1 node không trả kết quả; dò riêng `sg1`, `hk1`, `jp1`, `vn1` → chỉ `vn1` nối được; đối chứng `pay.vnpay.vn:443` → 40/40 node nối được. Log Render 7 ngày chỉ có `VNPAY query unavailable (TimeoutError)` lặp lại, không có dòng phản hồi nào của VNPAY. Kết luận: `sandbox.vnpayment.vn` (103.220.84.173) chỉ nhận kết nối TCP từ IP Việt Nam, nên máy chủ đặt ở Singapore không gọi được `merchant_webapi`, cả `refund` lẫn `querydr`; không phải lỗi mã, không phải Render chặn chiều ra. Riêng việc chính dải IP ra của Render bị bỏ gói là suy luận: gói Free không có Shell để đo từ trong máy chủ.
- Chưa có lần hoàn VNPAY sandbox thật nào thành công, kể cả từ máy ở Việt Nam ([ADR-036](#adr-036), phần Thực tế 28/10: "chưa thử Refund API sandbox thật"); `curl -d {}` ở trên chỉ chứng minh nối được.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Tăng timeout, gọi lại VNPAY | Không đổi luồng | Không chữa được: VNPAY sandbox bỏ gói TCP từ IP ngoài Việt Nam, chờ lâu hơn vẫn không có phản hồi; mỗi lần thử để thêm một lệnh treo | Có |
| **B. Cờ `REFUND_GATEWAYS` + hoàn tay bằng `transferReference` (chọn)** | Đóng được mọi ca treo bằng sổ có mã đối chiếu; staging không còn tạo lệnh treo VNPAY | ADMIN chuyển khoản ngoài hệ thống; khách không tự hủy-hoàn đơn `CONFIRMED` của cổng bị tắt | Có: bỏ biến là về như cũ |
| C. Chỉ thêm hoàn tay, không cờ | Ít mã | Nút hoàn qua cổng vẫn hiện trên staging và tiếp tục treo | Có |
| Không làm gì | — | Lệnh treo không có cách đóng ngoài chốt `SUCCEEDED` sai sự thật | — |

**Chọn B** (Bảo chọn R1 ngày 20/11). `REFUND_GATEWAYS` ([env.ts:112](../../../apps/api/src/infra/config/env.ts#L112)): bỏ trống là mọi cổng có refund, `none` là tắt hết, còn lại là danh sách mã cổng. `GatewayRegistry.autoRefund` ([gateway-registry.ts:34](../../../apps/api/src/modules/payments/gateway-registry.ts#L34)) đọc cờ mỗi lần gọi; `CheckoutService.autoRefund` là facade cho returns. `POST /api/admin/payments/:id/refund` có `transferReference` thì gọi `refundManually` ([checkout.service.ts:675](../../../apps/api/src/modules/checkout/checkout.service.ts#L675)), ghi `REFUND:MANUAL:{mã}` dưới khoá đơn bằng `recordManualRefund`; còn lệnh qua cổng chưa chốt thì 409 `REFUND_PENDING`, đơn `CONFIRMED` thì 409, payment COD thì 409 (COD hoàn qua trả hàng). Trang đơn admin nhận `refundMode` `GATEWAY`/`MANUAL` và hiện ô mã chuyển khoản. Trả hàng: `refundMethodOf` trả `BANK_TRANSFER` cho COD và cổng bị tắt; đơn trả trước gửi kèm `transferReference` cũng đi nhánh tay, và dòng `refunds` đã có từ lần gọi cổng được cập nhật thành `SUCCEEDED` thay vì tạo dòng thứ hai. Staging đặt `REFUND_GATEWAYS=MOMO,MOMO_ATM` trong `render.yaml`.

Trade-off chấp nhận: cổng tắt hoàn tự động thì đơn `CONFIRMED` không hủy-hoàn được, cả khách lẫn ADMIN (`actions.cancelRefund` false, `POST /api/admin/orders/:id/cancel-refund` 409, có test); chưa có nút hủy kèm hoàn tay, để mở. Yêu cầu trả tạo lúc cổng còn bật không có tài khoản nhận của khách, ADMIN phải hỏi lại khách. Ghi đè bằng `transferReference` khi cổng vẫn bật chỉ có ở API trả hàng, trang trả hàng admin chưa có ô nhập.

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| AI gợi ý | Claude Opus 5.5: đề xuất R1 (hoàn tay + cờ môi trường) và chỉ ra giới hạn đơn `CONFIRMED` | giữ |
| AI sai | Claude ghi trước số ADR-074 theo ghi chú cũ; grep `adr-[0-9]{3}` cho số lớn nhất 109 và PR #155 đang giữ 110 | Claude tự bắt bằng grep và `gh pr diff` |
| AI sai | Claude ghi "gọi hoàn lại" như việc chưa làm, trong khi đã gọi ngày 18/11 | Claude bắt khi đọc lại sổ đo, báo Bảo |
| AI sai | Claude ghi "trả tiền và IPN vẫn chạy vì là chiều vào" vào `staging.md`; IPN về staging chưa có bằng chứng (Render Free tắt Request logs) | Claude bắt khi rà log Render ngày 20/11, sửa lại câu |
| Câu hỏi phản biện | Bảo: kiểm lại vấn đề thật sự, không dừng ở "suy luận lọc theo IP" | Dò TCP từ 40 node cho bằng chứng ở Hiện trạng |

**Kết luận:** hoàn tay là đường đóng ca chính thức cho mọi cổng; cổng hoàn qua API bật theo môi trường.
**Bằng chứng:** `npx vitest run test/checkout-refund.http.spec.ts test/returns.http.spec.ts` (thư mục `apps/api`) → 29 test đạt; `npx vitest run src/features/checkout/admin` (thư mục `apps/web`) → 48 test đạt. Mã ở [279cdb5](https://github.com/F-R-E-Y-A/fashion-shop/commit/279cdb5): [gateway-registry.ts:34](https://github.com/F-R-E-Y-A/fashion-shop/blob/279cdb5/apps/api/src/modules/payments/gateway-registry.ts#L34), [checkout.service.ts:675](https://github.com/F-R-E-Y-A/fashion-shop/blob/279cdb5/apps/api/src/modules/checkout/checkout.service.ts#L675), [checkout-refund.http.spec.ts:387](https://github.com/F-R-E-Y-A/fashion-shop/blob/279cdb5/apps/api/test/checkout-refund.http.spec.ts#L387).

### Kết quả mong đợi → thực tế
Mong đợi: sau khi gộp và Render dựng lại, trang đơn VNPAY đã giao trên staging hiện ô mã chuyển khoản; yêu cầu trả `14c1b42f…` đóng được bằng hoàn tay sau khi chốt `FAILED` lệnh `1c92a855…`, không thêm lệnh gửi VNPAY.
Thực tế: <điền sau>.

### Điều kiện xem lại
Máy chủ có đường ra bằng IP Việt Nam tới `merchant_webapi` và một lệnh `refund` sandbox thật trả `00` (dò lại bằng lệnh check-host ở Hiện trạng); VNPAY sandbox mở cho IP nước ngoài; chuyển sang VNPAY production; có nhu cầu hủy-hoàn đơn `CONFIRMED` khi cổng bị tắt.

<a id="adr-112"></a>
## 2026-11-20 · ADR-112 — Cổng nào được gọi API truy vấn kết quả là cấu hình theo môi trường; staging tắt QueryDR của VNPAY

**Loại:** quyết định · **Phạm vi:** Payments, Checkout (worker đối soát, `POST /api/orders/:id/reconcile`); staging trên Render · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** [687ccf0](https://github.com/F-R-E-Y-A/fashion-shop/commit/687ccf0)

### Hiện trạng
- Tại `8e539fd`, worker đối soát chạy 30 giây một lần ([settlement.service.ts:39](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/checkout/settlement.service.ts#L39)), lấy payment chưa `SUCCEEDED` trong 24 giờ của mọi cổng trừ COD ([payments.service.ts:125](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/payments/payments.service.ts#L125)) rồi gọi `adapter.query`; không tới được cổng thì lùi 30 giây và thử lại ([settlement.service.ts:143](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/checkout/settlement.service.ts#L143)). Không có cách tắt theo môi trường.
- `sandbox.vnpayment.vn` chỉ nhận kết nối TCP từ IP Việt Nam (số đo ở [ADR-111](#adr-111)), nên trên staging ở Singapore mọi lần `querydr` treo đủ 8 s ([vnpay.service.ts:124](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/payments/vnpay.service.ts#L124)). Log Render ngày 20/11, xem lùi 7 ngày: `WARN [SettlementService] VNPAY query unavailable (TimeoutError); retry soon.` lặp lại khoảng mỗi phút, không có lần QueryDR nào thành công. `POST /api/orders/:id/reconcile` không kèm return có chữ ký giữ khách 8,14 s và 8,12 s (đo 20/11 06:17Z).
- Chốt đơn không phụ thuộc QueryDR: return có chữ ký tự chốt ([settlement.service.ts:116](https://github.com/F-R-E-Y-A/fashion-shop/blob/8e539fd/apps/api/src/modules/checkout/settlement.service.ts#L116)), IPN cũng chốt. IPN từ VNPAY về staging chưa có bằng chứng: Render Free tắt Request logs.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Giãn lịch thử lại khi timeout liên tiếp | Tự thích nghi, không thêm biến | Vẫn gọi treo, chỉ thưa hơn; thêm trạng thái đếm lỗi; nút đối soát vẫn chờ 8 s | Có |
| **B. Cờ `QUERY_GATEWAYS`, cùng dạng `REFUND_GATEWAYS` (chọn)** | Staging hết lệnh gọi treo và hết dòng WARN mỗi phút; bỏ trống là mọi cổng nên local và môi trường có IP Việt Nam không đổi | Thêm một biến môi trường; cổng bị tắt mất đường phục hồi khi khách không quay lại trang kết quả và IPN không tới | Có: bỏ biến là về như cũ |
| C. Dùng luôn `REFUND_GATEWAYS` cho cả query | Một biến | Dính hai quyết định vào nhau: môi trường muốn hoàn tay nhưng vẫn đối soát thì không cấu hình được | Có |
| Không làm gì | — | Mỗi phút một lệnh gọi treo 8 s không thu được gì, log thật bị che, nút đối soát giữ khách 8 s | — |

**Chọn B** (Bảo yêu cầu làm ngày 20/11). `QUERY_GATEWAYS` ([env.ts:118](../../../apps/api/src/infra/config/env.ts#L118)) dùng chung khuôn kiểm với `REFUND_GATEWAYS`: bỏ trống là mọi cổng, `none` là tắt hết, còn lại là danh sách mã cổng. `GatewayRegistry.queryEnabled` ([gateway-registry.ts:42](../../../apps/api/src/modules/payments/gateway-registry.ts#L42)) đọc cờ mỗi lần gọi. `SettlementService.reconcile` thoát trước `claim` khi cổng bị tắt ([settlement.service.ts:157](../../../apps/api/src/modules/checkout/settlement.service.ts#L157)); `PaymentsService.candidates` bỏ cổng bị tắt ([payments.service.ts:127](../../../apps/api/src/modules/payments/payments.service.ts#L127)) vì cùng lý do đã bỏ COD: thoát trước `claim` thì `lastCheckedAt` không được ghi và mỗi tick lại lấy lại toàn bộ. Return có chữ ký và IPN không đổi. Staging đặt `QUERY_GATEWAYS=MOMO,MOMO_ATM` trong `render.yaml`.

Trade-off chấp nhận: trên môi trường tắt query của VNPAY, khách trả tiền xong mà không quay lại trang kết quả thì chỉ còn IPN để chốt; IPN về staging chưa kiểm chứng, nên đơn đó có thể ở lại `PENDING_PAYMENT` rồi bị hủy khi hết hạn giữ hàng. Trước quyết định này ca đó cũng không được cứu, vì QueryDR không tới được VNPAY. Với MoMo, tắt query cũng dừng việc worker tạo lại link cho payment chưa có `checkoutUrl` (cùng danh sách `candidates`); staging không tắt MoMo.

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| AI gợi ý | Claude Fable 5.2: đề xuất cờ riêng cho query sau khi thấy dòng timeout lặp mỗi phút trong log Render | giữ |
| AI gợi ý | Agent phản biện của Claude Code: lọc cả `candidates()` chứ không chỉ `reconcile()`, trả `[]` tường minh khi không còn cổng nào, và chạy riêng bộ HTTP vì `npm run check` chỉ chạy unit | giữ |

**Kết luận:** gọi API truy vấn của cổng là cấu hình theo môi trường; staging ngoài Việt Nam tắt QueryDR của VNPAY cho tới khi có đường ra IP Việt Nam.
**Bằng chứng:** ngày 20/11, thư mục `apps/api`, DB test local, mã chưa commit trên `8e539fd`. `npx vitest run --project http test/checkout-payment.http.spec.ts` → 1 tệp, 33 test đạt, gồm bốn ca mới: `QUERY_GATEWAYS=MOMO,MOMO_ATM` và `none` (worker và nút đối soát không gọi QueryDR, `lastCheckedAt` giữ `null`, bỏ cờ thì worker chốt được), return có chữ ký và IPN ký đúng vẫn chốt đơn khi query tắt. Chạy chung năm tệp `checkout-payment`, `checkout-momo`, `cod`, `checkout-refund`, `returns` lúc máy đang chạy việc khác → 79/84 đạt, 5 ca của `checkout-momo` rớt ở `resetDatabase` (Prisma: transaction 5000 ms hết hạn sau 11917 ms); chạy lại riêng `test/checkout-momo.http.spec.ts` → 10/10 đạt. `npm run check` (gốc kho) → exit 0, unit API 77 tệp/748 test, web 63 tệp/808 test. `adapter.query` chỉ có một chỗ gọi, nằm trong `reconcile` ([settlement.service.ts:163](../../../apps/api/src/modules/checkout/settlement.service.ts#L163)), nên cổng `queryEnabled` chặn được mọi lệnh QueryDR. Mã ở [687ccf0](https://github.com/F-R-E-Y-A/fashion-shop/commit/687ccf0): [settlement.service.ts:157](https://github.com/F-R-E-Y-A/fashion-shop/blob/687ccf0/apps/api/src/modules/checkout/settlement.service.ts#L157), [gateway-registry.ts:42](https://github.com/F-R-E-Y-A/fashion-shop/blob/687ccf0/apps/api/src/modules/payments/gateway-registry.ts#L42), [payments.service.ts:126](https://github.com/F-R-E-Y-A/fashion-shop/blob/687ccf0/apps/api/src/modules/payments/payments.service.ts#L126), [checkout-payment.http.spec.ts:621](https://github.com/F-R-E-Y-A/fashion-shop/blob/687ccf0/apps/api/test/checkout-payment.http.spec.ts#L621).

### Kết quả mong đợi → thực tế
Mong đợi: sau khi gộp và Render dựng lại, log Render không còn dòng `VNPAY query unavailable`, và `POST /api/orders/:id/reconcile` của một đơn VNPAY đang chờ thanh toán trả về dưới 1 s; kiểm trong ngày triển khai.
Thực tế: <điền sau>.

### Điều kiện xem lại
Staging có đường ra bằng IP Việt Nam hoặc VNPAY sandbox mở cho IP nước ngoài (bỏ biến); xác nhận được IPN không về staging và có đơn bị hủy oan vì khách không quay lại trang kết quả.
