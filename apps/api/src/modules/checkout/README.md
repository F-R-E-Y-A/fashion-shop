# Checkout — orchestrator PH-11

Module nhập các public service Auth/Cart/Inventory/Orders/Payments/Users/Shipping; đăng ký qua `index.ts` ở AppModule. [Nghiệp vụ và giới hạn](../../../../../docs/features/checkout/README.md).

CheckoutService điều phối quote/create/retry/cancel và hoàn tiền; SettlementService điều phối IPN/query/expiry; OrderAdminService là các bước tay của ADMIN (xác nhận COD, bắt đầu xử lý, đã giao, giao thất bại) và dữ liệu màn `/admin/orders`, chạy dưới cùng khoá đơn ([ADR-038](../../../../../docs/LOG.md#adr-038)). Sổ hoàn đọc từ `refund-ledger.ts`. Mọi ghi bảng thuộc service sở hữu, cùng Prisma transaction khi thay đổi nhiều nghiệp vụ. Thứ tự khoá Cart → Order → Inventory theo variant đã sắp xếp; create thêm khoá idempotency trước Cart. HTTP tới gateway luôn ngoài transaction. DTO/Controller không import Prisma.

Hợp đồng HTTP sinh tại Swagger `/api/docs`.

## Cửa công bố cho module khác

`index.ts` xuất `CheckoutModule` và `CheckoutService` (module `CheckoutModule` có `exports: [CheckoutService]`). Người dùng duy nhất hiện nay là [returns](../returns/README.md) ([ADR-068](../../../../../docs/features/returns/LOG.md#adr-068)).

| Hàm | Hợp đồng |
|---|---|
| `withOrder(orderId, ownerId, work)` | Transaction có khoá giỏ của chủ đơn rồi khoá đơn; mọi `orders.transition` của module khác đi qua đây |
| `refundPayment(paymentId, actor, { amount, reason, intentId })` | Như trên; `intentId` (tiền tố `REFUND-INTENT:`) do caller đặt trước để đối chiếu khi cổng không trả lời |
| `onRefundSettled(listener)` | Listener chạy **cùng transaction** lúc chốt lệnh hoàn (phản hồi 00 hoặc `resolveRefund` SUCCEEDED). Listener phải bỏ qua lệnh không thuộc mình và không ném lỗi khi tiền đã ra |
| `refundIntentState(paymentId, intentId)` | `MISSING`, `RECEIVED`, `PROCESSED`, `FAILED` theo sổ `payment_transactions` |
| `recordManualRefund(paymentId, actor, { amount, reference, reason }, tx)` | Gọi **trong** `withOrder`: ghi `REFUND:MANUAL:<mã>` vào sổ hoàn và chuyển đơn `PARTIALLY_REFUNDED`/`REFUNDED`; mã trùng là 409 |
| `inventory`, `orders` | Thuộc tính chỉ đọc, trỏ tới public service của hai module đó |
