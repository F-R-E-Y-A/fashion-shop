---
title: Khuyến mãi và Mã giảm giá — nhật ký
updated: 2026-10-13
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
Thực tế: (điền sau khi hoàn thành kiểm thử).

### Điều kiện xem lại

Khi phân hệ Đặt hàng (Orders) và Thanh toán (Payment) cần mở rộng hỗ trợ nhiều voucher đồng thời hoặc hoàn lượt voucher (T6) khi hủy đơn.

## 2026-10-18 · Gia cố kiểm soát quota đồng thời và bất biến cấu hình khuyến mãi

**Loại:** thay đổi mã và kiểm thử · **Phạm vi:** PromotionsService, DTOs, controllers và HTTP tests · **Commit:** (chờ commit)

Sau review PR #41 từ Bảo:
1. `recordVoucherUsage`: Sử dụng khóa dòng bi quan `SELECT ... FOR UPDATE` trong transaction để tuần tự hóa các yêu cầu cạnh tranh cùng một voucher, đọc lại trạng thái, thời hạn và đếm lại quota tổng (`usageLimit`) lẫn quota người dùng (`perUserLimit`) trước khi ghi nhận lượt dùng.
2. Kiểm tra bất biến cấu hình: Chặn cấu hình tiền âm (`maxDiscountAmount`, `minOrderAmount`) bằng regex DTO và Decimal validation; khi PATCH cấu hình, ghép cấu hình cập nhật với cấu hình hiện tại để kiểm tra tính hợp lệ toàn vẹn (ví dụ: đổi `discountType` sang `PERCENTAGE` khi `discountValue` cũ vượt quá 100%).
3. DTO cập nhật khuyến mãi: Bổ sung class `UpdatePromotionDto extends PartialType(CreatePromotionDto)` để ValidationPipe hoạt động đúng metatype ở runtime, chặn các trường lạ và enum không hợp lệ.
4. Bổ sung `apps/api/test/promotions.http.spec.ts` kiểm thử cạnh tranh 2 transaction đồng thời cho quota và các ca hồi quy HTTP validation.

