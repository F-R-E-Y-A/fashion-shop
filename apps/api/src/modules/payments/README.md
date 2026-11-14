# Payments — hợp đồng public

Import PaymentsModule/PaymentsService qua `index.ts`; không gọi thẳng bảng Payment từ module khác để ghi. [Bản đồ](../../../../../docs/features/payments/README.md).

- `gateways.get(code)` / `gateways.list()`: registry VNPAY/MOMO, availability để checkout hiển thị lựa chọn. Các adapter cùng `PaymentGateway` contract và trả `PaymentEvent` đã xác thực.
- `create(orderId, requestKey, amount, holdUntil, ip, tx, code?)`: lưu attempt/ref và chống trùng key; mặc định VNPAY. `expiresAt` của attempt và link cổng = `holdUntil` trừ `SETTLEMENT_BUFFER_MINUTES` (3 phút) để IPN trễ vẫn kịp chốt; còn dưới 1 phút thì 409 ([ADR-034](../../../../../docs/LOG.md#adr-034)). VNPAY chuẩn bị URL local; MoMo lưu init intent đã ký trong PaymentTransaction để replay nhất quán.
- `launchLatest(orderId, ip)`: sau commit, claim attempt trước khi gọi HTTP tạo URL MoMo; timeout giữ PENDING để retry/query. Không giữ SQL transaction qua HTTP.
- `byReference(ref, tx?)`, `latest(orderId, tx)`: đọc attempt để điều phối.
- `record(id, status, receipt, payload, tx)`: unique gateway/receipt; không giảm SUCCEEDED về FAILED. Caller phải giữ khoá order và xác thực gateway trước.
- `expire(orderId, EXPIRED|CANCELLED, tx)`: chỉ đổi attempt chưa thành công.
- `candidates()`, `claim(id, code)`: recovery trong 24h; claim theo `queryIntervalMs` của adapter bằng update có điều kiện. VNPAY 305 giây (giới hạn 5 phút cộng đệm), MoMo 60 giây. Worker chờ khoảng này trước query đầu tiên; thao tác đối soát sau return được query ngay nếu chưa từng query.
- `backoff(id, code, retryInMs?)`: query không tới được cổng (mất kết nối/timeout) thì lùi claim, thử lại sau 30 giây thay vì chờ trọn interval. Nếu request thật ra đã tới cổng, lượt thử sớm bị từ chối (VNPAY mã 94), trả null và claim giữ nguyên. Mã phản hồi QueryDR không dùng được được ghi log, không ghi payload.

IPN/query đi vào SettlementService của Checkout. VNPAY xác thực HMAC-SHA512; MoMo IPN HMAC-SHA256, query response qua HTTPS allowlist và đối chiếu identity/amount. MoMo resultCode 9000 chưa chốt tiền, chỉ 0 thành công. Không tự ghi Order, Inventory hay Cart; trạng thái tiền và giao hàng tách riêng. Không expose secret. [Cấu hình sandbox và tunnel](../../../../../docs/features/payments/setup.md).
