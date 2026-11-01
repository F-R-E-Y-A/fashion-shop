# Checkout — orchestrator PH-11

Module nhập các public service Auth/Cart/Inventory/Orders/Payments/Users/Shipping; đăng ký qua `index.ts` ở AppModule. [Nghiệp vụ và giới hạn](../../../../../docs/features/checkout/README.md).

CheckoutService điều phối quote/create/retry/cancel; SettlementService điều phối IPN/query/expiry. Mọi ghi bảng thuộc service sở hữu, cùng Prisma transaction khi thay đổi nhiều nghiệp vụ. Thứ tự khoá Cart → Order → Inventory theo variant đã sắp xếp; create thêm khoá idempotency trước Cart. HTTP tới gateway luôn ngoài transaction. DTO/Controller không import Prisma.

Hợp đồng HTTP sinh tại Swagger `/api/docs`. Chưa xuất application service cho module khác; chỉ xuất CheckoutModule để ráp ứng dụng.
