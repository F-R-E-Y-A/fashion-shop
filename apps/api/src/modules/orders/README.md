# Orders — hợp đồng public

Import qua `index.ts`. OrdersService chỉ ghi Order/OrderItem/OrderStatusHistory. [Bản đồ](../../../../../docs/features/orders/README.md).

- `get(id, userId?, tx?)`: snapshot đầy đủ; khi có userId bắt buộc thuộc chủ đó; caller hệ thống không truyền principal chỉ trong settlement đã xác minh.
- `list(userId)`: tối đa 50 đơn mới nhất của chủ.
- `byKey(key, tx)`: idempotency cho Checkout đã giữ khoá Cart.
- `pending(userId, tx?)`: đơn chờ trả tiền còn hạn của chủ. Checkout dùng để giữ luật một đơn giữ hàng mỗi khách ([ADR-029](../../../../../docs/LOG.md#adr-029)).
- `lock(id, tx)`: advisory lock của đơn; lấy sau khoá Cart, trước khoá Inventory.
- `create(input, tx)`, `transition(id, status, tx, actor?)`: chỉ orchestrator gọi trong transaction chung. Mã đơn `FR` + `yymmdd` giờ Việt Nam + 8 ký tự base32 Crockford, 16 ký tự để khách đọc qua điện thoại; cột unique chặn trùng ([newOrderCode](orders.service.ts#L16)). Đơn tạo trước đổi này giữ mã 34 ký tự cũ.
- `due()`: đơn chờ trả tiền quá deadline để recovery xử lý; không tự nhả kho bằng query này.

Không import Payments ngược vào Orders. Snapshot tiền dùng Decimal/string. [ADR-027](../../../../../docs/LOG.md#adr-027).
