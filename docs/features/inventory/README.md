---
title: Tồn kho — bản đồ
updated: 2026-11-10
status: nền checkout đã có; quản trị chỉ đọc đang triển khai Issue81
owner: Duy
---
# Tồn kho và nhập hàng

**Chức năng:** Cửa vào của feature tồn kho: đặc tả ở đâu, phụ thuộc mô hình biến thể của danh mục, trạng thái hôm nay.

| | |
|---|---|
| **Người sở hữu** | Duy · `apps/api/src/modules/inventory` · bảng trong `prisma/schema/orders.prisma` |
| **Dòng việc** | Chưa giao; PH-02 giỏ hàng (Issue #7) làm trước |
| **Use case** | UC-13.1 tới UC-13.4. Đặc tả từ PR #9 đã gộp, còn mã cũ tại [uc-ph13-ton-kho.md](../../shared/uc-ph13-ton-kho.md); chuẩn hoá đang ở PR #26, chưa gộp ngày 04/10 |

## Phụ thuộc

Tồn kho tính theo **biến thể** (một màu, một cỡ) của mô hình M2 đã chốt ([ADR-007](../products/LOG.md#adr-007), [erd.md](../products/erd.md)). Đặc tả cũ còn dùng `SKUS`; cần đối chiếu với M2 khi chuẩn hoá HT-04. Giỏ hàng PH-02 đã gộp qua [PR #15](https://github.com/F-R-E-Y-A/fashion-shop/pull/15), xem [cart/README.md](../cart/README.md); giỏ hàng không phải module tồn kho.

## Trạng thái hôm nay (19/10/2026)

PH-11 đã thêm cửa đọc tại [README module](../../../apps/api/src/modules/inventory/README.md). Tồn khả dụng bằng tồn thực trừ reservation chưa release và chưa hết hạn; không trả âm. Biến thể thiếu Inventory trả chưa biết, không gán tồn giả ([inventory.service.ts:55](../../../apps/api/src/modules/inventory/inventory.service.ts#L55)).

Catalog và Cart chỉ gọi đọc qua `inventory/index.ts`. Checkout giữ hàng khi xác nhận sang payment; IPN/query chốt kho nếu hold còn hạn, hủy/hết hạn thì nhả. Khoá variant có thứ tự, SALE gắn order/variant duy nhất ([inventory.service.ts:16](../../../apps/api/src/modules/inventory/inventory.service.ts#L16), [inventory-operations.ts:14](../../../apps/api/src/modules/inventory/inventory-operations.ts#L14)). Chưa có UI/API nhập kho; chủ kho đặt tồn bằng `npm run stock:import -w apps/api -- --file=<csv>` theo file kiểm kê `sku,quantity`, ghi `ADJUSTMENT` cho từng chênh lệch ([stock-count.ts:54](../../../apps/api/src/modules/inventory/stock-count.ts#L54), [ADR-034](../../LOG.md#adr-034)). Không tự tạo số liệu tồn thật. Quyết định ở [ADR-031](../../LOG.md#adr-031), [ADR-032](../../LOG.md#adr-032); kiểm ở [cart-live.http.spec.ts](../../../apps/api/test/cart-live.http.spec.ts) và [checkout-payment.http.spec.ts](../../../apps/api/test/checkout-payment.http.spec.ts).


## Quản trị chỉ đọc — Issue #81

Tài triển khai [Issue #81](https://github.com/F-R-E-Y-A/fashion-shop/issues/81), Duy review nghiệp vụ.
Lát [UC-13.1](use-cases.md) chỉ danh sách biến thể, chi tiết tồn và lịch sử StockMovement phân trang;
không thêm điều chỉnh, nhập kho, cảnh báo ngưỡng hoặc migration. Không coi dữ liệu tồn thiếu là0.
API tại module inventory, frontend feature inventory; guard ADMIN ngoài khung và backend.
Các số là snapshot cùng thời điểm, UI ghi asOf và tải lại định kỳ30giây; lỗi dừng polling.
Giữ nguyên reserve/release/commit/restock và script kiểm kê; không ghi bảng của phân hệ khác.
Kiểm thử tại admin-inventory.service.spec.ts, admin-inventory.http.spec.ts, inventory.test.tsx và
admin-inventory.spec.ts. Trạng thái kiểm thực tế/ảnh và giới hạn lưu ở kho docs, không coi là đã merge.

## Cảnh báo tồn thấp — Issue #92

Endpoint `GET /api/admin/inventory/low-stock?threshold=5&limit=5` hỗ trợ Tổng quan admin:
- Tính `availableQuantity = max(0, quantityOnHand - reserved)` với hold còn hiệu lực (`releasedAt IS NULL AND expiresAt > asOf`).
- Lọc `availableQuantity <= threshold` trên toàn bộ cơ sở dữ liệu trước khi `LIMIT`, không tải toàn bộ vào RAM.
- `threshold` 1..100 (mặc định 5), `limit` 1..10 (mặc định 5).
- Đếm toàn tập `total` khớp danh sách items trong giao dịch `RepeatableRead` cùng mốc `asOf`. Loại bỏ biến thể chưa có bản ghi tồn kho; bao gồm cả biến thể ngừng bán và biến thể có khả dụng = 0.
