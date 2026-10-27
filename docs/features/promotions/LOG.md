---
title: Khuyến mãi và Mã giảm giá — nhật ký
updated: 2026-10-27
status: đang triển khai
owner: Duy
---
# Khuyến mãi và Mã giảm giá — nhật ký

**Chức năng:** Ghi nhận các quyết định kiến trúc và mốc thay đổi kỹ thuật của phân hệ Khuyến mãi và Mã giảm giá.

<a id="adr-025"></a>
## 2026-10-13 · ADR-025 — Thiết kế tính toán và bảo vệ tính toàn vẹn của mã giảm giá

**Loại:** quyết định · **Phạm vi:** Phân hệ Khuyến mãi & Giỏ hàng / Đặt hàng (`apps/api/src/modules/promotions`) · **Trạng thái:** đề xuất · **Người quyết:** Duy · **Commit:** (điền khi thi hành)

### Hiện trạng

Mô hình CSDL đã có sẵn cấu trúc bảng `vouchers`, `promotions` và `voucher_usages` tại `apps/api/prisma/schema/catalog.prisma:281-334`. Tuy nhiên, chưa có tầng module dịch vụ NestJS và controller để xử lý kiểm tra (validation), tính toán số tiền giảm (discount calculation) và ghi nhận lượt dùng khi đặt hàng.

Nếu cho phép client tự gửi số tiền giảm trực tiếp vào đơn hàng, hệ thống có nguy cơ bị gian lận hoặc sai lệch giá trị thanh toán.

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Tính toán mã giảm giá ở client rồi gửi số tiền giảm lên API đơn hàng | Nhanh, đơn giản cho client | Lỗ hổng bảo mật nghiêm trọng, không thể kiểm soát số lượt dùng hay hạn mức | Dễ |
| **B. Tập trung toàn bộ logic xác thực và tính toán giảm giá tại backend service (chọn)** | Chặt chẽ, an toàn, chuẩn xác; tính toán số tiền giảm từ dữ liệu thực của voucher trong CSDL | Cần API xác thực trước và hàm ghi nhận dùng voucher | Dễ |
| C. Dùng trigger trong cơ sở dữ liệu để kiểm tra | Ép buộc ở tầng CSDL | Khó viết kiểm thử unit test, khó trả về thông báo lỗi thân thiện cho khách | Khó |

**Chọn B** vì đảm bảo đúng quy ước bảo mật: tiền là nguồn sự thật từ máy chủ, kiểm tra kỹ lưỡng điều kiện hạn mức (`minOrderAmount`, `usageLimit`, `perUserLimit`, thời gian hiệu lực), hỗ trợ cả % (có trần tối đa `maxDiscountAmount`) và số tiền cố định (`FIXED_AMOUNT`).

### Kết quả mong đợi → thực tế

Mong đợi: Bộ test suite `promotions.service.spec.ts` kiểm thử đầy đủ các kịch bản biên (hết lượt, hết hạn, chưa đủ tiền tối thiểu, vượt trần %, tính toán số tiền giảm).
Thực tế: Đã có 20 bài kiểm thử đơn vị và 6 bài kiểm thử HTTP concurrency bảo vệ tính toàn vẹn.

### Điều kiện xem lại

Khi phân hệ Đặt hàng (Orders) và Thanh toán (Payment) cần mở rộng hỗ trợ nhiều voucher đồng thời hoặc hoàn lượt voucher (T6) khi hủy đơn.

## 2026-10-18 · Gia cố kiểm soát quota đồng thời và bất biến cấu hình khuyến mãi

**Loại:** thay đổi mã và kiểm thử · **Phạm vi:** PromotionsService, DTOs, controllers và HTTP tests · **Commit:** (chờ commit)

Sau review PR #41 từ Bảo:
1. `recordVoucherUsage`: Sử dụng khóa dòng bi quan `SELECT ... FOR UPDATE` trong transaction để tuần tự hóa các yêu cầu cạnh tranh cùng một voucher, đọc lại trạng thái, thời hạn và đếm lại quota tổng (`usageLimit`) lẫn quota người dùng (`perUserLimit`) trước khi ghi nhận lượt dùng.
2. Kiểm tra bất biến cấu hình: Chặn cấu hình tiền âm (`maxDiscountAmount`, `minOrderAmount`) bằng regex DTO và Decimal validation; khi PATCH cấu hình, ghép cấu hình cập nhật với cấu hình hiện tại để kiểm tra tính hợp lệ toàn vẹn (ví dụ: đổi `discountType` sang `PERCENTAGE` khi `discountValue` cũ vượt quá 100%).
3. DTO cập nhật khuyến mãi: Bổ sung class `UpdatePromotionDto extends PartialType(CreatePromotionDto)` để ValidationPipe hoạt động đúng metatype ở runtime, chặn các trường lạ và enum không hợp lệ.
4. Bổ sung `apps/api/test/promotions.http.spec.ts` kiểm thử cạnh tranh 2 transaction đồng thời cho quota và các ca hồi quy HTTP validation.

<a id="adr-026"></a>
## 2026-10-27 · ADR-026 — Động cơ khuyến mãi động, phân khúc khách hàng và các mẫu thiết kế

**Loại:** quyết định · **Phạm vi:** Phân hệ Khuyến mãi (`apps/api/src/modules/promotions/engine`) · **Trạng thái:** đề xuất · **Người quyết:** Duy · **Commit:** (điền khi thi hành)

### Hiện trạng

Mô hình dữ liệu `Promotion` trong CSDL đã có sẵn trường `conditions Json? @db.JsonB` (`apps/api/prisma/schema/catalog.prisma:309`), tuy nhiên trước đây hệ thống chỉ kiểm tra các điều kiện tĩnh cơ bản. Quản trị viên (Admin) cần một cơ chế linh hoạt, có thể tự do mở rộng cấu hình khuyến mãi theo từng phân khúc khách hàng (khách hàng mới, khách hàng VIP, khách hàng thân thiết, danh sách người dùng cụ thể), theo danh mục sản phẩm, khung giờ vàng (happy hour) và các bậc giảm giá lũy tiến (tiered discount) mà không phải thay đổi mã nguồn hay cấu trúc bảng CSDL.

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Thêm các cột điều kiện mới vào bảng `promotions` và viết if-else trong service | Dễ viết ban đầu | Bảng CSDL phình to, mỗi điều kiện mới phải chạy Prisma migration; logic rẽ nhánh phức tạp vi phạm nguyên lý Open-Closed (OCP) | Khó |
| **B. Xây dựng Promotion Engine áp dụng Specification, Composite, Strategy và Factory Patterns dựa trên `conditions JsonB` (chọn)** | Admin tùy biến điều kiện vô hạn qua JSON; tuân thủ triệt để SOLID/Design Patterns; mở rộng luật hay thuật toán giảm giá không chạm mã cũ; tự động hóa đánh giá giỏ hàng qua endpoint `POST /api/promotions/evaluate` | Cần thiết kế cấu trúc class và cây luật bài bản | Dễ |
| C. Dùng thư viện Rule Engine bên ngoài (như json-rules-engine) | Có sẵn parser | Thêm phụ thuộc bên ngoài nặng nề, khó tích hợp kiểu dữ liệu Decimal và logic truy vấn lịch sử khách hàng chuyên biệt | Khó |

**Chọn B** vì:
1. **Specification / Composite Pattern**: `PromotionRule` đóng vai trò interface quy tắc; `AndCompositeRule`, `OrCompositeRule`, `NotRule` cho phép lồng ghép điều kiện phức tạp dạng cây logic; `CustomerSegmentRule`, `MinOrderAmountRule`, `MinItemCountRule`, `CategoryRule`, `TimeWindowRule` đảm nhận từng điều kiện đơn lẻ.
2. **Strategy Pattern**: `DiscountStrategy` phân tách thuật toán tính tiền: `PercentageDiscountStrategy` (kèm trần tối đa), `FixedAmountDiscountStrategy` và `TieredDiscountStrategy` (giảm giá theo các bậc chi tiêu).
3. **Factory Pattern**: `PromotionRuleFactory` và `DiscountStrategyFactory` phân giải JSONB conditions thành các đối tượng thực thi tương ứng.
4. **Phân khúc khách hàng (Segmentation)**: Dịch vụ tự động tổng hợp chỉ số lịch sử đơn hàng (`orderCount`, `totalSpent`) từ CSDL để phân loại chính xác `NEW_CUSTOMER` (đơn đầu tiên), `VIP_CUSTOMER` (chi tiêu từ 2.000.000đ hoặc từ 3 đơn hàng), `LOYAL_CUSTOMER` và `TARGETED_USERS`.

### Kết quả mong đợi → thực tế

Mong đợi: Bộ kiểm thử đơn vị và HTTP kiểm tra đầy đủ các luật composite lồng nhau, phân khúc khách hàng mới/VIP, thuật toán bậc thang và endpoint giỏ hàng.
Thực tế: 26 bài test unit engine (`rules.spec.ts`, `strategies.spec.ts`, `promotion-evaluator.service.spec.ts`) và 12/12 bài test HTTP integration & concurrency (`promotions.http.spec.ts`) đạt 100% tỷ lệ vượt qua.

### Điều kiện xem lại

Khi phân hệ Loyalty / Điểm thưởng tích hợp cần thêm các loại quy tắc đổi điểm hoặc tặng quà tặng kèm (gift-with-purchase).
