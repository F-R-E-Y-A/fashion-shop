# Phân hệ Inventory — hợp đồng tồn và giữ hàng

Phân hệ khác import qua `index.ts`. Cart/Catalog chỉ đọc; Checkout dùng các hàm ghi trong transaction chung. Quyết định: [ADR-026](../../../../../docs/LOG.md#adr-026), [ADR-027](../../../../../docs/LOG.md#adr-027).

- `getAvailableQuantities(variantIds, transaction?)`: ton vat ly tru reservation chua release va chua het han, toi thieu 0. Khong co dong inventory thi tra `null` (chua biet), khong gia dinh het hang hoac tu sinh ton.
- `getStockStatuses(groups)`: tong hop cac bien the dang ban thanh `IN_STOCK`, `OUT_OF_STOCK`, `UNKNOWN`.
- `getAvailabilityRevision()`: hash của tồn khả dụng để Catalog phát hiện thay đổi; không công bố thông tin đơn hay reservation.
- Transaction tuy chon cho phep Cart doc ton bang chinh connection dang giu khoa owner; khong mo transaction long nhau.

- `reserve(orderId, items, expiresAt, tx)`: khoá variant theo thứ tự, kiểm lại khả dụng rồi tạo hold nguyên tử.
- `release(orderId, items, tx)`: nhả hold chưa released; không thay quantityOnHand.
- `commit(orderId, items, tx)`: chỉ chốt hold còn hạn/đúng lượng/chưa released; trừ kho và ghi SALE duy nhất theo order/variant/type. Trả false khi hold không hợp lệ để Checkout chuyển đối soát.

- `parseStockCsv(text)`, `applyStockCounts(prisma, counts, { dryRun })`: đặt tồn vật lý theo file kiểm kê `sku,quantity`, tất cả hoặc không dòng nào. Khoá variant như Checkout; từ chối SKU lạ và số nhỏ hơn lượng đang giữ; mỗi chênh lệch ghi một StockMovement `ADJUSTMENT`. Gọi qua `npm run stock:import -w apps/api -- --file=<csv> [--dry-run]` ([ADR-029](../../../../../docs/LOG.md#adr-029)).

Caller lấy khoá Cart và Order trước khi ghi Inventory; script kiểm kê chỉ lấy khoá variant nên không tạo vòng khoá. Chưa có UI/API nhập kho; số liệu do chủ kho cung cấp. Không seed số lượng giả trên database đang sử dụng.
