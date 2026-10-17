---
title: Khuyến mãi và Mã giảm giá
updated: 2026-10-13
status: đang triển khai
owner: Duy
---
# Khuyến mãi và Mã giảm giá

**Chức năng:** Bản đồ phân hệ Khuyến mãi và Mã giảm giá: ranh giới, mô hình dữ liệu, ca sử dụng và các giao diện lập trình.

| Mục | Hiện trạng |
|---|---|
| Người sở hữu | Duy; `apps/api/src/modules/promotions`, `apps/web/src/features/promotions`, các bảng trong `catalog.prisma` |
| Dòng việc | PH-10 Khuyến mãi & Mã giảm giá |
| Ca sử dụng | UC-07.2 (Áp dụng mã giảm giá), UC-10.1 (Quản lý chương trình KM), UC-10.2 (Quản lý mã giảm giá) |
| Sơ đồ tham chiếu | Class Diagram (namespace `Payment_Promotion`), ERD (`05 Payment Promotion Vouchers`) |

## Mô hình và ranh giới

Phân hệ sử dụng 3 bảng đã định nghĩa trong `apps/api/prisma/schema/catalog.prisma`:
- `vouchers`: Lưu mã giảm giá, kiểu giảm (`PERCENTAGE` / `FIXED_AMOUNT`), giá trị, hạn mức tối thiểu, số lượt dùng toàn sàn và giới hạn mỗi tài khoản.
- `promotions`: Lưu chương trình khuyến mãi tự động theo điều kiện `conditions` (`JsonB`).
- `voucher_usages`: Ghi nhận bất biến mỗi lượt dùng voucher gắn với đơn hàng (`order_id` duy nhất 1-1).

Ranh giới nghiệp vụ:
- Khách hàng tại giỏ hàng và đặt hàng kiểm tra mã qua API `POST /api/promotions/vouchers/apply`.
- Quản trị viên quản lý voucher qua các endpoint `admin/vouchers` được bảo vệ bởi `RolesGuard` với quyền `ADMIN`.
- Đơn hàng khi chốt sẽ gọi dịch vụ `recordVoucherUsage` trong cùng transaction để đảm bảo toàn vẹn.

Chi tiết quyết định thiết kế xem tại [LOG.md](LOG.md).
