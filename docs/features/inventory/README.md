---
title: Tồn kho — bản đồ
updated: 2026-09-25
status: chưa làm
owner: Duy
---
# Tồn kho và nhập hàng

**Chức năng:** Cửa vào của feature tồn kho: đặc tả ở đâu, phụ thuộc mô hình biến thể của danh mục, trạng thái hôm nay.

| | |
|---|---|
| **Người sở hữu** | Duy · `apps/api/src/modules/inventory` · bảng trong `prisma/schema/orders.prisma` |
| **Dòng việc** | Chưa giao; PH-02 giỏ hàng (Issue #7) làm trước |
| **Use case** | UC-13.1 tới UC-13.4. Đặc tả ở pull request #9, chưa gộp; khi gộp đặt tại `docs/features/inventory/use-cases.md` |

## Phụ thuộc

Tồn kho tính theo đơn vị bán của danh mục. Mô hình danh mục do PH-01 đề xuất ([products/LOG#adr-007](../products/LOG.md#adr-007), [products/erd.md](../products/erd.md)) lấy **biến thể** (một màu, một cỡ) làm đơn vị bán, nên bảng tồn kho khoá theo `variant_id`, đúng như ví dụ trong `orders.prisma`. Đặc tả tồn kho trong pull request #9 đang viết theo `SKUS`; sửa khi mô hình danh mục chốt.

## Trạng thái hôm nay (24/09/2026)

Chưa có mã; mới có đặc tả. Duy điền tiếp theo [mẫu README](../../shared/templates/feature-README.md) khi dòng việc tồn kho được giao.
