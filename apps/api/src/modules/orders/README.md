---
title: Hợp đồng module orders
updated: 2026-11-12
status: đang dùng
owner: Bảo
---
# Orders — hợp đồng public

**Chức năng:** Hàm công bố của OrdersService: ai gọi, khi nào, trong giao dịch nào, và luật chuyển trạng thái đơn.

Import qua `index.ts`. OrdersService chỉ ghi Order/OrderItem/OrderStatusHistory. [Bản đồ](../../../../../docs/features/orders/README.md).

- `get(id, userId?, tx?)`: snapshot đầy đủ; khi có userId bắt buộc thuộc chủ đó; caller hệ thống không truyền principal chỉ trong settlement đã xác minh.
- `list(userId)`: tối đa 50 đơn mới nhất của chủ.
- `adminList({ statuses?, attention?, q?, page, pageSize })`: mọi khách, cho màn quản trị; `attention` là `PAYMENT_REVIEW`, lệnh hoàn `RECEIVED` hoặc đơn hủy có payment `SUCCEEDED` ([ADR-038](../../../../../docs/LOG.md#adr-038)).
- Snapshot `get` kèm các dòng `REFUND*` của payment để Checkout tính sổ hoàn không cần query thêm.
- `byKey(key, tx)`: idempotency cho Checkout đã giữ khoá Cart.
- `pending(userId, tx?)`: đơn chờ trả tiền còn hạn của chủ. Checkout dùng để giữ luật một đơn giữ hàng mỗi khách ([ADR-034](../../../../../docs/LOG.md#adr-034)).
- `lock(id, tx)`: advisory lock của đơn; lấy sau khoá Cart, trước khoá Inventory.
- `create(input, tx)`, `transition(id, status, tx, actor?)`: chỉ orchestrator gọi trong transaction chung. Mã đơn `FR` + `yymmdd` giờ Việt Nam + 8 ký tự base32 Crockford, 16 ký tự để khách đọc qua điện thoại; cột unique chặn trùng ([newOrderCode](orders.service.ts#L16)). Đơn tạo trước đổi này giữ mã 34 ký tự cũ.
- `transition` chỉ đi theo bảng `ORDER_TRANSITIONS` ([orders.service.ts](orders.service.ts)): update có điều kiện trạng thái nguồn, sai bước thì 409 và không ghi lịch sử. Tiền về bất thường ở mọi trạng thái đều vào được `PAYMENT_REVIEW`, nên settlement không bị chặn.
- `due()`: đơn `PENDING_PAYMENT`/`PENDING_CONFIRMATION` quá deadline để recovery xử lý; đơn COD đã xác nhận (`PROCESSING`) không còn trong danh sách; không tự nhả kho bằng query này.
- Ba hàm chỉ đọc cho Reviews ([ADR-054](../../../../../docs/features/reviews/LOG.md#adr-054)), trả kiểu `PurchasedItem` ([purchased-items.ts](purchased-items.ts)): bản chụp sản phẩm lúc mua, trạng thái đơn, lần chuyển `DELIVERED` mới nhất.
  - `purchasedItem(orderItemId, userId)`: một dòng đơn của đúng khách; của người khác thì `null`, để Reviews trả 404 mà không lộ dòng đó có tồn tại.
  - `deliveredItems(userId, statuses, deliveredSince, excludeIds)`: dòng đơn có lần giao từ `deliveredSince`, trừ dòng đã đánh giá; tối đa 100, mới nhất trước ([orders.service.ts:255](orders.service.ts#L255)).
  - `purchasedItems(ids)`: bản chụp nhiều dòng một lượt, cho danh sách đánh giá.

Không import Payments ngược vào Orders. Snapshot tiền dùng Decimal/string. [ADR-032](../../../../../docs/LOG.md#adr-032).
