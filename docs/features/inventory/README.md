---
title: Tồn kho — bản đồ
updated: 2026-10-04
status: chưa làm
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

## Trạng thái hôm nay (04/10/2026)

Chưa có mã; mới có đặc tả. Duy điền tiếp theo [mẫu README](../../shared/templates/feature-README.md) khi dòng việc tồn kho được giao.
