---
title: Khuyến mãi và Mã giảm giá — đặc tả use case
updated: 2026-11-11
status: đã chốt cho UC-07.2 và UC-10.2
owner: Duy
---
# Khuyến mãi và Mã giảm giá — Đặc tả Use Case

**Chức năng:** Đặc tả ca sử dụng phân hệ Khuyến mãi và Mã giảm giá, bao gồm luồng thực thi, quy tắc nghiệp vụ và tiêu chí chấp nhận nghiệm thu (AC).

| | |
|---|---|
| **Người viết đặc tả** | Phan Ngọc Duy; cập nhật hoàn thiện UC-10.2 (Issue #86) ngày 11/11/2026 |
| **Người sở hữu mã** | Phan Ngọc Duy, module `promotions` |
| **Dòng việc** | **PH-10** Khuyến mãi & Mã giảm giá |
| **Tác nhân chính** | Khách hàng (UC-07.2), Quản trị viên / ADMIN (UC-10.2) |
| **Dữ liệu** | 3 bảng: `vouchers`, `promotions`, `voucher_usages` |

---

## UC-10.2 · Quản trị mã giảm giá (Admin Vouchers)

### Câu chuyện người dùng
Là một **quản trị viên (ADMIN)**, tôi muốn **quản lý danh sách, tạo mới, chỉnh sửa cấu hình và chuyển đổi trạng thái mã giảm giá**, để **chủ động triển khai các chương trình kích cầu mua sắm mà không làm gián đoạn hệ thống hoặc bị ghi đè dữ liệu đồng thời**.

### Điều kiện trước
- Người dùng đã đăng nhập với vai trò `ADMIN`.
- CSDL đã có bảng `vouchers` và các chỉ mục liên quan.

### Điều kiện sau
- Mã giảm giá được tạo mới, cập nhật hoặc chuyển đổi trạng thái thành công.
- Dữ liệu `updatedAt` tăng đơn điệu nếu có thay đổi; ghi nhận đúng phiên bản CAS.

---

### Tiêu chí chấp nhận (Acceptance Criteria)

#### UC-10.2/AC1: Phân quyền & Header an toàn
- **AC1.1 (âm)**: Từ chối các request không có token xác thực bằng `401 Unauthorized`.
- **AC1.2 (âm)**: Từ chối người dùng không có vai trò `ADMIN` (ví dụ `CUSTOMER`, `STAFF`) bằng `403 Forbidden`.
- **AC1.3 (thuận)**: Mọi endpoint quản trị voucher trả header `Cache-Control: no-store` để chống lưu cache nhạy cảm trên proxy/trình duyệt.
- **AC1.4 (biên)**: Từ chối ID không đúng định dạng UUID bằng `400 Bad Request`.
- **AC1.5 (biên)**: Từ chối các tham số query lạ hoặc tham số phân trang bất thường (dạng số mũ `1e3`, số âm, số thực, lặp tham số `page`, `pageSize`, `search`, `status`) bằng `400 Bad Request`.

#### UC-10.2/AC2: Danh sách, Tìm kiếm & Phân trang
- **AC2.1 (thuận)**: Liệt kê danh sách voucher có phân trang (`page`, `pageSize` tối đa 60).
- **AC2.2 (thuận)**: Tìm kiếm voucher theo mã không phân biệt hoa thường (`ILIKE %search%`).
- **AC2.3 (thuận)**: Lọc danh sách theo trạng thái kích hoạt (`ACTIVE`, `INACTIVE`).
- **AC2.4 (thuận)**: Hiển thị badge trạng thái trực quan: Đang hoạt động, Ngừng hoạt động, Chưa tới hạn, Hết hạn.
- **AC2.5 (thuận)**: Bảo toàn tham số tìm kiếm, bộ lọc và trang hiện tại trong URL query params; truyền tham số `returnTo` an toàn (đã kiểm tra chống open redirect) khi điều hướng sang trang tạo mới hoặc chi tiết để khi bấm "Quay lại danh sách" hoặc Back/Forward của trình duyệt thì trạng thái được khôi phục nguyên vẹn.

#### UC-10.2/AC3: Tạo mới voucher & Ràng buộc toàn vẹn
- **AC3.1 (thuận)**: Tạo voucher thành công với đầy đủ các cấu hình: mã voucher, hình thức giảm (`PERCENTAGE` / `FIXED_AMOUNT`), giá trị giảm, mức giảm trần `maxDiscountAmount`, đơn hàng tối thiểu `minOrderAmount`, tổng lượt dùng `usageLimit`, lượt dùng mỗi khách `perUserLimit`, thời gian hiệu lực `startsAt` / `endsAt`. Mã voucher được tự động chuẩn hóa viết hoa và cắt khoảng trắng.
- **AC3.2 (thuận)**: Trạng thái ban đầu mặc định là `INACTIVE` để đảm bảo an toàn vận hành, tránh việc mã chưa hoàn thiện bị khách hàng áp dụng ngoài ý muốn.
- **AC3.3 (âm)**: Từ chối giá trị giảm `<= 0` hoặc phần trăm `> 100%` bằng `400 Bad Request`.
- **AC3.4 (âm)**: Từ chối nếu thời gian kết thúc trước hoặc bằng thời gian bắt đầu (`endsAt <= startsAt`) bằng `400 Bad Request`.
- **AC3.5 (âm)**: Báo lỗi `409 Conflict` nếu mã voucher đã tồn tại trong hệ thống (kiểm tra trước và bắt lỗi vi phạm unique constraint `P2002`).
- **AC3.6 (biên)**: Cơ chế kết quả chưa rõ (uncertain outcome): Khi gửi yêu cầu tạo mới gặp lỗi mạng/timeout/5xx, hệ thống lưu marker tạm thời, tạm khóa nút tạo để chống submit trùng lặp, và cung cấp nút "Kiểm tra lại" để đối chiếu thực tế trên máy chủ qua GET.

#### UC-10.2/AC4: Chi tiết, Cập nhật & Kiểm soát tương tranh CAS
- **AC4.1 (thuận)**: Hiển thị đầy đủ thông tin chi tiết voucher cùng số lượt đã sử dụng thực tế (`usageCount`).
- **AC4.2 (thuận)**: Bảo toàn độ chính xác thời gian: Nếu người dùng không chỉnh sửa trường ngày bắt đầu/kết thúc, hệ thống giữ nguyên chuỗi UTC ISO gốc kèm mili-giây (ví dụ `.123Z`), không làm mất độ chính xác hoặc làm lệch múi giờ UTC+7. Khi người dùng chỉnh sửa trường thời gian, chuyển đổi chính xác giữa giờ địa phương trên trình duyệt và chuẩn UTC ISO gửi lên máy chủ kèm nhãn ghi chú múi giờ rõ ràng.
- **AC4.3 (thuận)**: Vòng đời bản thảo (draft lifecycle): Khi người dùng đang soạn thảo trên form chi tiết, các lần làm mới dữ liệu nền (window focus refetch) chỉ cập nhật các trường chưa sửa (clean fields), tuyệt đối không ghi đè dữ liệu của các trường người dùng đang nhập (dirty fields).
- **AC4.4 (biên)**: Kiểm soát tương tranh lạc quan (CAS): Khóa hàng bằng `lockVoucher(tx, id)` `FOR UPDATE` trong giao dịch; đối chiếu `expectedUpdatedAt`. Nếu phiên bản CSDL không khớp, trả về `409 Conflict`. Trên giao diện, bản thảo của người dùng vẫn được bảo lưu để đối chiếu và cung cấp nút "Tải lại dữ liệu máy chủ".
- **AC4.5 (thuận)**: Tăng đơn điệu `updatedAt` bằng `Math.max(Date.now(), existingTime + 1)`; tối ưu hóa no-op không tăng thời gian và không gọi UPDATE nếu dữ liệu không thay đổi.
- **AC4.6 (biên)**: Hủy bỏ truy vấn GET cũ (`cancelQueries`) trước khi cập nhật dữ liệu vào query cache để ngăn các phản hồi chậm ghi đè lên kết quả mới; hỗ trợ luồng đối chiếu kết quả chưa rõ qua GET khi gặp sự cố mạng hoặc 500.

#### UC-10.2/AC5: Chuyển đổi trạng thái & Khắc phục gián đoạn
- **AC5.1 (thuận)**: Hộp thoại xác nhận `ConfirmDialog` bắt buộc trước khi chuyển đổi trạng thái Kích hoạt / Ngừng hoạt động, nêu rõ tác động nghiệp vụ (không ảnh hưởng đơn hàng cũ, mã ngừng hoạt động sẽ không thể áp dụng cho giỏ hàng mới).
- **AC5.2 (thuận)**: Khóa nút thao tác cục bộ theo ID voucher trong suốt thời gian mutation đang chờ xử lý để ngăn chặn thao tác spam.
- **AC5.3 (biên)**: Khi gặp lỗi 5xx, timeout hoặc đứt kết nối mạng trong lúc chuyển trạng thái, giao diện lưu marker `uncertain-status`, hiển thị thông báo chưa rõ kết quả và kích hoạt nút "Kiểm tra lại". Quá trình kiểm tra lại gọi GET guarded để xác định trạng thái thực tế và đồng bộ lại danh sách.
- **AC5.4 (biên)**: Kiểm tra tính hợp lệ của phiên làm việc (`sessionEpoch`) và thế hệ quyền quản trị (`adminAccessGeneration`) sau mọi bước `await`. Nếu tài khoản bị thu hồi quyền (`403 Forbidden`) hoặc đăng xuất giữa chừng, toàn bộ thông báo thành công bị chặn và các marker chưa rõ kết quả được dọn dẹp sạch sẽ.
