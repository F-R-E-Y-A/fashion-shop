---
title: Khuyến mãi và Mã giảm giá
updated: 2026-11-11
status: đang triển khai
owner: Duy
---
# Khuyến mãi và Mã giảm giá

**Chức năng:** Bản đồ phân hệ Khuyến mãi và Mã giảm giá: động cơ khuyến mãi động, ranh giới, mô hình dữ liệu, ca sử dụng và các giao diện lập trình.

| Mục | Hiện trạng |
|---|---|
| Người sở hữu | Duy; `apps/api/src/modules/promotions`, `apps/web/src/features/promotions`, các bảng trong `catalog.prisma` |
| Dòng việc | PH-10 Khuyến mãi & Mã giảm giá, PH-03 Quản trị chiến dịch đơn giản (Issue #88) |
| Ca sử dụng | UC-07.2 (Áp dụng mã giảm giá), [UC-10.1 (Quản lý chương trình KM)](use-cases.md#uc-101--quản-trị-chương-trình-khuyến-mãi-đơn-giản), UC-10.2 (Quản lý mã giảm giá) |
| Sơ đồ tham chiếu | Class Diagram (namespace `Payment_Promotion`), ERD (`05 Payment Promotion Vouchers`) |

## Mô hình và ranh giới

Phân hệ sử dụng 3 bảng đã định nghĩa trong `apps/api/prisma/schema/catalog.prisma`:
- `vouchers`: Lưu mã giảm giá, kiểu giảm (`PERCENTAGE` / `FIXED_AMOUNT`), giá trị, hạn mức tối thiểu, số lượt dùng toàn sàn và giới hạn mỗi tài khoản.
- `promotions`: Lưu chương trình khuyến mãi tự động theo cấu hình điều kiện linh hoạt `conditions` (`JsonB`).
- `voucher_usages`: Ghi nhận bất biến mỗi lượt dùng voucher gắn với đơn hàng (`order_id` duy nhất 1-1).

Ranh giới nghiệp vụ:
- Khách hàng kiểm tra voucher qua `POST /api/promotions/vouchers/apply`.
- Khách hàng đánh giá ưu đãi giỏ hàng qua `POST /api/promotions/evaluate`.
- Quản trị viên quản lý voucher qua `admin/vouchers` và khuyến mãi qua `admin/promotions` (quyền `ADMIN`).
- Đơn hàng khi hoàn tất gọi `recordVoucherUsage` trong transaction với khóa bi quan `FOR UPDATE`.

## Động cơ khuyến mãi động (Promotion Engine)

Phân hệ áp dụng các mẫu thiết kế hướng đối tượng chuẩn để Admin có thể phát triển và cấu hình điều kiện động thông qua JSON:
- **Specification / Composite Pattern**: `PromotionRule` làm gốc; các luật tổ hợp `AndCompositeRule`, `OrCompositeRule`, `NotRule`; các luật đơn lẻ gồm `CustomerSegmentRule`, `MinOrderAmountRule`, `MinItemCountRule`, `CategoryRule`, `TimeWindowRule`.
- **Strategy Pattern**: Tính toán giảm giá linh hoạt qua `DiscountStrategy` với các chiến lược `PercentageDiscountStrategy`, `FixedAmountDiscountStrategy`, `TieredDiscountStrategy` (giảm theo bậc thang chi tiêu).
- **Factory Pattern**: `PromotionRuleFactory` và `DiscountStrategyFactory` phân giải JSONB conditions thành cây thực thi runtime.
- **Phân khúc khách hàng (Segmentation)**: Phân loại tự động `NEW_CUSTOMER` (đơn đầu tiên), `VIP_CUSTOMER` (chi tiêu từ 2.000.000đ hoặc từ 3 đơn hàng), `LOYAL_CUSTOMER`, `TARGETED_USERS` dựa trên lịch sử đơn hàng thực tế trong CSDL.

Chi tiết quyết định thiết kế xem tại [LOG.md](LOG.md).
