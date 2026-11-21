---
title: Lược đồ Giao hàng và 5 phân hệ của Duy
updated: 2026-11-16
status: đề xuất
owner: Duy
---
# Lược đồ Giao hàng và 5 phân hệ của Duy

**Chức năng:** Tài liệu trỏ tới tệp Draw.io 7 tab chứa Class Diagram đã rà khớp cho 5 phân hệ của Duy và đủ 6 loại lược đồ UML Giao hàng.

Tệp nguồn Draw.io ([duy-giao-hang-va-5-phan-he.drawio](duy-giao-hang-va-5-phan-he.drawio)) gồm 7 trang:
1. **Class Diagram — 5 phân hệ của Duy**: `notifications`, `shipping` (GHN Sandbox + dự phòng mô phỏng), `cart`, `inventory`, `promotions` và các thực thể `Order` liên kết ([orders.prisma](../../../apps/api/prisma/schema/orders.prisma), [catalog.prisma](../../../apps/api/prisma/schema/catalog.prisma)).
2. **Use Case Diagram**: Giao hàng và theo dõi vận đơn (Admin, Khách hàng, hệ thống GHN Sandbox).
3. **Class Diagram (BCE)**: Boundary, Control và Entity cho use case Giao hàng và theo dõi vận đơn ([shipping](../../../apps/api/src/modules/shipping/shipping.service.ts), [notifications](../../../apps/api/src/modules/notifications/notifications.service.ts)).
4. **Sequence Diagram**: Tạo vận đơn (gọi GHN ngoài transaction + dự phòng mô phỏng), webhook/đồng bộ trạng thái, post-commit thông báo và khách theo dõi.
5. **Communication Diagram**: Thông điệp đánh số theo thứ tự giữa các đối tượng trong luồng giao hàng.
6. **Activity Diagram (Swimlanes)**: 4 làn giữa Quản trị viên, Hệ thống F.R.E.Y.A., GHN Sandbox/Mock và Khách hàng.
7. **State Machine Diagram**: Vòng đời `PENDING` → `IN_TRANSIT` → `DELIVERED` / `FAILED` → `RETURNED` đồng bộ với `Order` và `Inventory`.
