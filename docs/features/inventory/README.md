---
title: Tồn kho — bản đồ
updated: 2026-10-19
status: đọc tồn và giữ/chốt/nhả hàng cho checkout PH-11
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

Catalog và Cart chỉ gọi đọc qua `inventory/index.ts`. Checkout giữ hàng khi xác nhận sang payment; IPN/query chốt kho nếu hold còn hạn, hủy/hết hạn thì nhả. Khoá variant có thứ tự, SALE gắn order/variant duy nhất ([inventory.service.ts:16](../../../apps/api/src/modules/inventory/inventory.service.ts#L16), [inventory-operations.ts:14](../../../apps/api/src/modules/inventory/inventory-operations.ts#L14)). Chưa có UI/API nhập kho; chủ kho đặt tồn bằng `npm run stock:import -w apps/api -- --file=<csv>` theo file kiểm kê `sku,quantity`, ghi `ADJUSTMENT` cho từng chênh lệch ([stock-count.ts:54](../../../apps/api/src/modules/inventory/stock-count.ts#L54), [ADR-029](../../LOG.md#adr-029)). Không tự tạo số liệu tồn thật. Quyết định ở [ADR-026](../../LOG.md#adr-026), [ADR-027](../../LOG.md#adr-027); kiểm ở [cart-live.http.spec.ts](../../../apps/api/test/cart-live.http.spec.ts) và [checkout-payment.http.spec.ts](../../../apps/api/test/checkout-payment.http.spec.ts).
