# Checkout — orchestrator PH-11

Module nhập các public service Auth/Cart/Inventory/Orders/Payments/Users/Shipping; đăng ký qua `index.ts` ở AppModule. [Nghiệp vụ và giới hạn](../../../../../docs/features/checkout/README.md).

CheckoutService điều phối quote/create/retry/cancel và hoàn tiền; SettlementService điều phối IPN/query/expiry; OrderAdminService là các bước tay của ADMIN (xác nhận COD, bắt đầu xử lý, đã giao, giao thất bại) và dữ liệu màn `/admin/orders`, chạy dưới cùng khoá đơn ([ADR-038](../../../../../docs/LOG.md#adr-038)). Sổ hoàn đọc từ `refund-ledger.ts`. Mọi ghi bảng thuộc service sở hữu, cùng Prisma transaction khi thay đổi nhiều nghiệp vụ. Thứ tự khoá Cart → Order → Inventory theo variant đã sắp xếp; create thêm khoá idempotency trước Cart. HTTP tới gateway luôn ngoài transaction. DTO/Controller không import Prisma.

Hợp đồng HTTP sinh tại Swagger `/api/docs`. Chưa xuất application service cho module khác; chỉ xuất CheckoutModule để ráp ứng dụng.
