---
title: Khuyến mãi và Mã giảm giá
updated: 2026-11-11
status: đã triển khai UC-07.2 và UC-10.2 (quản trị voucher Issue #86)
owner: Duy
---
# Khuyến mãi và Mã giảm giá

**Chức năng:** Bản đồ phân hệ Khuyến mãi và Mã giảm giá: động cơ khuyến mãi động, quản trị voucher, ranh giới, mô hình dữ liệu, ca sử dụng và các giao diện lập trình.

| Mục | Hiện trạng |
|---|---|
| Người sở hữu | Duy; `apps/api/src/modules/promotions`, `apps/web/src/features/promotions`, các bảng trong `catalog.prisma` |
| Dòng việc | PH-10 Khuyến mãi & Mã giảm giá |
| Ca sử dụng | UC-07.2 (Áp dụng mã giảm giá), UC-10.1 (Quản lý chương trình KM), UC-10.2 (Quản lý mã giảm giá — Issue #86) |
| Sơ đồ tham chiếu | Class Diagram (namespace `Payment_Promotion`), ERD (`05 Payment Promotion Vouchers`) |

## Mô hình và ranh giới

Phân hệ sử dụng 3 bảng đã định nghĩa trong `apps/api/prisma/schema/catalog.prisma`:
- `vouchers`: Lưu mã giảm giá, kiểu giảm (`PERCENTAGE` / `FIXED_AMOUNT`), giá trị, hạn mức tối thiểu, số lượt dùng toàn sàn và giới hạn mỗi tài khoản.
- `promotions`: Lưu chương trình khuyến mãi tự động theo cấu hình điều kiện linh hoạt `conditions` (`JsonB`).
- `voucher_usages`: Ghi nhận bất biến mỗi lượt dùng voucher gắn với đơn hàng (`order_id` duy nhất 1-1).

Ranh giới nghiệp vụ:
- Khách hàng kiểm tra voucher qua `POST /api/promotions/vouchers/apply`.
- Khách hàng đánh giá ưu đãi giỏ hàng qua `POST /api/promotions/evaluate`.
- Quản trị viên quản lý voucher qua `/admin/vouchers` (quyền `ADMIN`).
- Đơn hàng khi hoàn tất gọi `recordVoucherUsage` trong transaction với khóa bi quan `FOR UPDATE`.

## Quản trị Voucher (UC-10.2 — Issue #86)

Giao diện và API quản trị voucher cho phép Admin cấu hình và kiểm soát toàn bộ vòng đời mã giảm giá:
- `GET /api/admin/vouchers`: Danh sách phân trang, tìm kiếm mã (`search`), lọc trạng thái (`status`).
- `POST /api/admin/vouchers`: Tạo voucher mới, mặc định `INACTIVE` để đảm bảo an toàn vận hành.
- `GET /api/admin/vouchers/:id`: Chi tiết voucher và số lượt đã sử dụng (`usageCount`).
- `PATCH /api/admin/vouchers/:id`: Cập nhật cấu hình, điều kiện, chuyển đổi trạng thái (`ACTIVE` / `INACTIVE`).

### Kiểm soát tương tranh và cập nhật đơn điệu (CAS)
- **Khóa hàng bi quan**: `lockVoucher(tx, id)` thực thi câu lệnh SQL trực tiếp `SELECT ... FROM public.vouchers WHERE id = $1 FOR UPDATE` bên trong transaction Prisma, bảo đảm loại trừ tương tranh mức hàng.
- **Kiểm tra phiên bản CAS**: Đối chiếu `expectedUpdatedAt` trước khi ghi. Lưu ý kỹ thuật: `expectedUpdatedAt` được thiết kế tùy chọn (`optional`) ở tầng API DTO để duy trì khả năng tương thích ngược với các caller cũ/hệ thống nội bộ, nhưng bắt buộc (`mandatory`) trên giao diện Web Admin để ngăn ngừa triệt để lỗi ghi đè dữ liệu đồng thời.
- **Tăng đơn điệu thời gian**: Triển khai thực tế sử dụng `Math.max(Date.now(), existingTime + 1)` để sinh `updatedAt` mới, bảo đảm giá trị luôn tăng đơn điệu ngay cả khi đồng hồ hệ thống bị trôi hoặc nhiều thao tác cập nhật diễn ra trong cùng một mili-giây.
- **No-op optimization**: Nếu toàn bộ dữ liệu gửi lên trùng khớp với bản ghi hiện tại trong CSDL, hệ thống không thực hiện UPDATE và không tăng `updatedAt`.

## Động cơ khuyến mãi động (Promotion Engine)

Phân hệ áp dụng các mẫu thiết kế hướng đối tượng chuẩn để Admin có thể phát triển và cấu hình điều kiện động thông qua JSON:
- **Specification / Composite Pattern**: `PromotionRule` làm gốc; các luật tổ hợp `AndCompositeRule`, `OrCompositeRule`, `NotRule`; các luật đơn lẻ gồm `CustomerSegmentRule`, `MinOrderAmountRule`, `MinItemCountRule`, `CategoryRule`, `TimeWindowRule`.
- **Strategy Pattern**: Tính toán giảm giá linh hoạt qua `DiscountStrategy` với các chiến lược `PercentageDiscountStrategy`, `FixedAmountDiscountStrategy`, `TieredDiscountStrategy` (giảm theo bậc thang chi tiêu).
- **Factory Pattern**: `PromotionRuleFactory` và `DiscountStrategyFactory` phân giải JSONB conditions thành cây thực thi runtime.
- **Phân khúc khách hàng (Segmentation)**: Phân loại tự động `NEW_CUSTOMER` (đơn đầu tiên), `VIP_CUSTOMER` (chi tiêu từ 2.000.000đ hoặc từ 3 đơn hàng), `LOYAL_CUSTOMER`, `TARGETED_USERS` dựa trên lịch sử đơn hàng thực tế trong CSDL.

Chi tiết đặc tả các ca sử dụng xem tại [use-cases.md](use-cases.md). Quyết định thiết kế xem tại [LOG.md](LOG.md).
