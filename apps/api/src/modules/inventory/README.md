# Phân hệ Inventory — hợp đồng tồn và giữ hàng

Phân hệ khác import qua `index.ts`. Cart/Catalog chỉ đọc; Checkout dùng các hàm ghi trong transaction chung. Quyết định: [ADR-031](../../../../../docs/LOG.md#adr-031), [ADR-032](../../../../../docs/LOG.md#adr-032).

- `getAvailableQuantities(variantIds, transaction?)`: ton vat ly tru reservation chua release va chua het han, toi thieu 0. Khong co dong inventory thi tra `null` (chua biet), khong gia dinh het hang hoac tu sinh ton.
- `getStockStatuses(groups)`: tong hop cac bien the dang ban thanh `IN_STOCK`, `OUT_OF_STOCK`, `UNKNOWN`.
- `getAvailabilityRevision()`: hash của tồn khả dụng để Catalog phát hiện thay đổi; không công bố thông tin đơn hay reservation.
- Transaction tuy chon cho phep Cart doc ton bang chinh connection dang giu khoa owner; khong mo transaction long nhau.

- `reserve(orderId, items, expiresAt, tx)`: khoá variant theo thứ tự, kiểm lại khả dụng rồi tạo hold nguyên tử.
- `release(orderId, items, tx)`: nhả hold chưa released; không thay quantityOnHand.
- `commit(orderId, items, tx)`: chỉ chốt hold còn hạn/đúng lượng/chưa released; trừ kho và ghi SALE duy nhất theo order/variant/type. Trả false khi hold không hợp lệ để Checkout chuyển đối soát.
- `restock(orderId, items, tx)`: hàng đã SALE nhưng chưa rời tay shop (khách hủy trước xử lý, COD giao thất bại) cộng lại kho một lần, ghi `RETURN` unique theo order/variant; đơn chưa SALE hoặc đã RETURN thì trả false ([ADR-038](../../../../../docs/LOG.md#adr-038)). Hàng đã giao trả lại đi luồng đổi trả.

- `parseStockCsv(text)`, `applyStockCounts(prisma, counts, { dryRun })`: đặt tồn vật lý theo file kiểm kê `sku,quantity`, tất cả hoặc không dòng nào. Khoá variant như Checkout; từ chối SKU lạ và số nhỏ hơn lượng đang giữ; mỗi chênh lệch ghi một StockMovement `ADJUSTMENT`. Gọi qua `npm run stock:import -w apps/api -- --file=<csv> [--dry-run]` ([ADR-034](../../../../../docs/LOG.md#adr-034)).

Caller lấy khoá Cart và Order trước khi ghi Inventory; script kiểm kê chỉ lấy khoá variant nên không tạo vòng khoá. Chưa có UI/API nhập kho; số liệu do chủ kho cung cấp. Không seed số lượng giả trên database đang sử dụng.


## Quản trị chỉ đọc — Issue #81

AdminInventoryController/AdminInventoryService là nội bộ module, không xuất qua index.
AuthModule bảo vệ ADMIN, DTO/Swagger giữ hợp đồng thật; mọi GET trả no-store và allowlist.
Danh sách gồm cả variant chưa có Inventory hoặc đang ngừng bán. Số tồn/giữ/khả dụng và lịch sử
được đọc trong snapshot RepeatableRead; giữ chỉ tính chưa release và chưa hết hạn tại asOf.
Thiếu Inventory trả null, không tự tạo dòng; lịch sử không lộ khách hàng, đơn hoặc chi tiết reservation.
Không sửa các cửa ghi đã công bố và không thêm API ghi/migration/seed trong lát này.
