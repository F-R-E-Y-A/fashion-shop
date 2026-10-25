---
title: Payments — VNPAY và MoMo PH-11
updated: 2026-10-19
status: VNPAY đã thử PAY và QueryDR sandbox, MoMo để sau
owner: Bảo
---
# Thanh toán

**Chức năng:** Cửa vào tích hợp VNPAY và MoMo, hợp đồng public, cấu hình tunnel và giới hạn nghiệm thu.

`PaymentGateway` là Strategy contract; VNPAY/MoMo adapters chuyển protocol riêng thành `PaymentEvent`, `GatewayRegistry` chọn adapter. VNPAY ký URL local bằng HMAC-SHA512; MoMo ký HMAC-SHA256 và gọi create sau SQL commit ([payment-gateway.ts:23](../../../apps/api/src/modules/payments/payment-gateway.ts#L23), [registry:7](../../../apps/api/src/modules/payments/gateway-registry.ts#L7), [launchLatest:154](../../../apps/api/src/modules/payments/payments.service.ts#L154)).

MoMo init intent lưu payload đã ký trong PaymentTransaction hiện có; retry dùng lại payload/reference/requestId. Không thêm bảng hoặc dependency. IPN kiểm chữ ký; query MoMo xác thực qua HTTPS tới host allowlist và đối chiếu response. Cả hai kiểm merchant/reference/amount trước shared settlement, không tin browser return ([momo.adapter.ts:190](../../../apps/api/src/modules/payments/momo.adapter.ts#L190), [settlement.service.ts:71](../../../apps/api/src/modules/checkout/settlement.service.ts#L71)).

Payments sở hữu payment/transaction và claim truy vấn; Checkout điều phối ghi kho/đơn. Hợp đồng public ở [README module](../../../apps/api/src/modules/payments/README.md), luồng ở [Checkout](../checkout/README.md), API thật ở Swagger `/api/docs`.

Bảo yêu cầu ưu tiên VNPAY, MoMo để sau: chưa có key thì MoMo không hiện ở checkout ([CheckoutPage.tsx:62](../../../apps/web/src/features/checkout/CheckoutPage.tsx#L62)). MoMo có hai biến thể dùng chung một bộ key, IPN và query: `MOMO` (ví, `captureWallet`, trang MoMo hiện QR/đăng nhập ví) và `MOMO_ATM` (`payWithATM`, trang MoMo hiện form thẻ ATM/quốc tế — thuận tiện test desktop không cần app ví); settlement công nhận hai mã cùng họ MoMo ([momo.adapter.ts](../../../apps/api/src/modules/payments/momo.adapter.ts)). VNPAY QueryDR cách ít nhất 5 phút theo [bảng mã lỗi](https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/); adapter đặt 305 giây, worker không query sớm trong khi khách nhập thẻ ([vnpay.adapter.ts:10](../../../apps/api/src/modules/payments/vnpay.adapter.ts#L10)).

QueryDR ResponseCode=00 chỉ xác nhận API query thành công. TransactionStatus=00 mới là thanh toán thành công; 02/08/11 là lỗi/hết hạn/hủy. Trạng thái chưa rõ giữ pending, không mở lượt thu tiền mới ([vnpay.adapter.ts:35](../../../apps/api/src/modules/payments/vnpay.adapter.ts#L35)); nguồn bảng mã và lý do ở [LOG](LOG.md).

- [Đăng ký hai cổng và cấu hình HTTPS tunnel](setup.md).
- HTTP: [VNPAY](../../../apps/api/test/checkout-payment.http.spec.ts), [MoMo](../../../apps/api/test/checkout-momo.http.spec.ts); adapter: [VNPAY](../../../apps/api/src/modules/payments/vnpay.service.spec.ts), [MoMo](../../../apps/api/src/modules/payments/momo.adapter.spec.ts).
- [Nhật ký](LOG.md), [ADR-032](../../LOG.md#adr-032), [ADR-033](../../LOG.md#adr-033).

Đã thử VNPAY PAY → thẻ NCB/OTP test → return HTTPS → QueryDR chữ ký hợp lệ → CONFIRMED/SUCCEEDED trên DB fixture riêng. Replay payload VNPAY ký thật vào IPN không bán/trừ kho lặp; sửa số tiền bị từ chối. Không coi replay là bằng chứng VNPAY chủ động gửi IPN: phần đó còn cần đăng ký endpoint bên nhà cung cấp. Lệnh/output/SHA lưu ngoài repo theo quy ước.

`PAYMENT_REVIEW` cần shop đối soát/hoàn tiền thủ công; chưa triển khai API refund hoặc SOAP. MoMo chưa thử cổng thật. Không có fallback giả lập trong app sử dụng.
