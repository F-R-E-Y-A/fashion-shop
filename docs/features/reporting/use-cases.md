---
title: Đặc tả Use Case Báo cáo bán hàng — UC-108.1
updated: 2026-11-13
status: đã triển khai và kiểm thử Issue108, chờ review
owner: Tài
---
# Đặc tả Use Case UC-108.1: Báo cáo bán hàng định kỳ (Issue #108)

**Chức năng:** Đặc tả yêu cầu chức năng, tiêu chí chấp nhận và quy tắc nghiệp vụ cho báo cáo bán hàng quản trị MVP.

## 1. Tác nhân và tiền điều kiện

- **Tác nhân chính**: Quản trị viên cửa hàng (ADMIN).
- **Tiền điều kiện**:
  - Đã đăng nhập vào hệ thống và sở hữu vai trò `ADMIN`.
  - Khách vãng lai truy cập nhận mã lỗi 401; khách hàng thường (`CUSTOMER`) nhận mã lỗi 403 (`AdminForbidden`).

## 2. Luồng nghiệp vụ chính

1. Quản trị viên truy cập màn hình `/admin/reports` từ thanh điều hướng quản trị.
2. Hệ thống tải tham số từ URL Search Params (mặc định: 30 ngày gần nhất tính đến ngày hiện tại theo múi giờ `Asia/Ho_Chi_Minh`, top = 10).
3. Ứng dụng gửi yêu cầu `GET /api/admin/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&top=10` kèm access token.
4. API trả về dữ liệu kèm header `Cache-Control: no-store`.
5. Giao diện hiển thị trạng thái snapshot (`READY` hoặc `NOT_READY`), 3 thẻ KPI và 3 bảng dữ liệu chi tiết.
6. Quản trị viên có thể thay đổi khoảng ngày, chọn mức top sản phẩm và nhấn "Áp dụng" hoặc "Làm mới".

## 3. Tiêu chí chấp nhận (Acceptance Criteria)

- **AC1 (Quyền truy cập & Cache-Control)**: Bắt buộc `@RequireRoles(RoleCode.ADMIN)`. API trả về header `Cache-Control: no-store` để ngăn chặn cache cục bộ/proxy lưu trữ dữ liệu tài chính nhạy cảm.
- **AC2 (Kiểm tra tham số đầu vào nghiêm ngặt)**:
  - Định dạng ngày phải là `YYYY-MM-DD` và phải là ngày lịch có thực (từ chối `2026-02-31`, `14-10-2026` bằng mã 400).
  - Yêu cầu `from <= to` và khoảng cách không vượt quá 366 ngày (trả 400 nếu vi phạm).
  - Tham số `top` chỉ chấp nhận các giá trị 5, 10, 20 (mặc định 10; trả 400 nếu khác).
  - Từ chối mọi tham số không nằm trong allowlist bằng mã lỗi 400 (`whitelist: true`, `forbidNonWhitelisted: true`).
- **AC3 (Xử lý trạng thái snapshot)**: Khi chưa có snapshot nào được tạo, API trả về trạng thái `NOT_READY` kèm mảng rỗng và metadata null. UI hiển thị rõ huy hiệu cảnh báo "Chưa tổng hợp snapshot" và trạng thái bảng rỗng.
- **AC4 (Tính toán tiền đã thu và hoàn tiền)**:
  - Chỉ tính các giao dịch `PaymentTransaction` có `status = 'PROCESSED'`.
  - COD: Chỉ tính giao dịch có tiền tố `COD:*` khi đơn hàng đã chuyển sang `DELIVERED`. Loại trừ các biên lai `COD-FAILED:*`.
  - VNPAY/MOMO/MOMO_ATM: Chỉ tính mã giao dịch số từ cổng thanh toán; loại trừ `INIT:*`, `FAIL:*`, `REFUND-INTENT:*`.
  - Tiền đã hoàn: Lọc các giao dịch có tiền tố `REFUND:`. Số tiền hoàn lấy từ `payload.refundedAmount` (hoặc `vnp_Amount / 100` cho giao dịch VNPAY cũ).
  - Thu ròng: `Tiền đã thu - Tiền đã hoàn`. Nếu âm, hiển thị rõ số âm kèm dấu trừ (ví dụ `-200.000 đ`).
- **AC5 (Phân bổ đơn theo trạng thái hiện tại)**: Gom nhóm các đơn hàng có `createdAt` rơi vào kỳ báo cáo theo trạng thái hiện tại tại thời điểm `asOf`. Tính toán tỷ lệ phần trăm trên tổng đơn trong kỳ.
- **AC6 (Top sản phẩm đã giao thành công)**: Ghi nhận số lượng và doanh thu của sản phẩm trong các đơn hàng đạt mốc `DELIVERED` đầu tiên trong kỳ báo cáo. Sắp xếp giảm dần theo số lượng giao, thứ hạng bằng nhau thì sắp xếp theo `productId`.
- **AC7 (Động cơ tổng hợp snapshot và khóa advisory lock)**:
  - Quy trình tổng hợp trong `ReportingAggregatorService` chạy bên trong một transaction duy nhất.
  - Sử dụng khóa `pg_try_advisory_xact_lock(10896001n)`. Nếu có tiến trình khác đang giữ khóa, bỏ qua ngay lập tức mà không xung đột hoặc treo kết nối.
- **AC8 (Giao diện chuẩn F.R.E.Y.A và tương thích di động)**:
  - Bố cục responsive hoàn chỉnh: 1280px hiển thị bảng dữ liệu đầy đủ; 360px chuyển thành các hàng thẻ trực quan, đảm bảo không tràn cuộn ngang (`scrollWidth <= innerWidth`).
  - Vùng bấm tương tác (buttons, inputs, select) có chiều cao tối thiểu 44px.
  - Định dạng tiền tệ chuỗi Decimal chính xác, không dùng float gây sai lệch làm tròn; hiển thị định dạng chuẩn Việt Nam `vi-VN` với hậu tố `đ`.
