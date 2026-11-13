---
title: Khuyến mãi và Mã giảm giá — đặc tả use case
updated: 2026-11-11
status: đề xuất cập nhật UC-10.1 và UC-10.2, chờ Duy review
owner: Duy
---
# Khuyến mãi và Mã giảm giá — Đặc tả Use Case

**Chức năng:** Đặc tả ca sử dụng phân hệ Khuyến mãi và Mã giảm giá, bao gồm luồng thực thi, quy tắc nghiệp vụ và tiêu chí chấp nhận nghiệm thu (AC).

| | |
|---|---|
| **Người viết đặc tả** | Kế thừa đặc tả của Duy; Antigravity cập nhật UC-10.2 cho Issue #86, Codex review kỹ thuật; chờ Duy xác nhận |
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

---

## UC-10.1 · Quản trị chương trình khuyến mãi đơn giản

### Câu chuyện người dùng
Là một **quản trị viên**, tôi muốn **xem danh sách, chi tiết, tạo mới, chỉnh sửa và bật/ngừng các chiến dịch khuyến mãi đơn giản**, để **kích cầu mua sắm mà không gây xung đột hay mất an toàn dữ liệu**.

### Điều kiện trước
Quản trị viên đã đăng nhập tài khoản có quyền `ADMIN` và có token hợp lệ.

### Điều kiện sau
- Tạo mới: Chiến dịch đơn giản được lưu trữ với trạng thái mặc định `INACTIVE` (trừ khi chủ động bật), id UUID định danh ổn định.
- Sửa/Bật-ngừng: Chiến dịch cập nhật giá trị mới với kiểm tra CAS `expectedUpdatedAt`, timestamp đơn điệu, hoặc giữ nguyên nếu payload không đổi (no-op).
- Chiến dịch phức tạp: Không thể chỉnh sửa hay bật/ngừng qua màn hình đơn giản; bảo toàn nguyên vẹn trường `conditions`.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Mở trang `/admin/promotions` | Tải danh sách phân trang (12 mục/trang), sắp xếp `{ createdAt: 'desc', id: 'desc' }` trong transaction snapshot RepeatableRead. |
| 2 | Nhấn "Tạo chiến dịch" | Mở form `/admin/promotions/new` với trạng thái mặc định `INACTIVE`. |
| 3 | Điền thông tin (tên, kiểu giảm, giá trị, ngày hiệu lực) và nhấn "Tạo chiến dịch" | Sinh client UUID v4, gửi POST, lưu chiến dịch và chuyển hướng về danh sách. |
| 4 | Nhấn vào một chiến dịch trong danh sách | Mở trang `/admin/promotions/:id`, hiển thị chi tiết và form chỉnh sửa kèm token CAS. |
| 5 | Chỉnh sửa thông tin và nhấn "Lưu thay đổi" | Gửi PATCH kèm `expectedUpdatedAt`, áp dụng row lock, kiểm tra phiên bản và cập nhật. |
| 6 | Nhấn "Ngừng hoạt động" hoặc "Kích hoạt" | Hiển thị ConfirmDialog, gửi PATCH cập nhật trạng thái kèm `expectedUpdatedAt`. |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Xung đột đồng thời (CAS 409) | Báo lỗi 409, giữ bản nháp hiện tại để quản trị viên đối chiếu thay vì tự ý ghi đè. |
| E2 | Mất kết nối mạng / timeout khi tạo mới | Giữ marker trạng thái chưa rõ (unknown) theo phiên, khóa thao tác gửi đè, cung cấp nút kiểm tra lại. |
| E3 | Chiến dịch có cấu hình phức tạp | Hiển thị chế độ Chỉ xem (Read-Only) kèm cảnh báo giải thích và JSON viewer; ẩn/vô hiệu hóa các nút sửa/bật-ngừng. |
| E4 | Không đủ quyền hạn (`STAFF` hoặc chưa đăng nhập) | Chặn truy cập với mã lỗi 403 Forbidden hoặc 401 Unauthorized, không cache dữ liệu (`no-store`). |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Tên chiến dịch không bắt buộc duy nhất (cho phép nhiều chiến dịch cùng tên ở các đợt khác nhau). Idempotency dựa trên UUID `id` truyền từ client. |
| BR2 | Giá trị phần trăm phải từ 1 đến 100%. Giá trị tiền cố định phải là số nguyên dương. Trần giảm giá và đơn tối thiểu không được âm. |
| BR3 | Row lock `SELECT ... FOR UPDATE` trong transaction khi cập nhật để tránh race condition và mất mát dữ liệu. |
| BR4 | Mọi endpoint admin yêu cầu vai trò `ADMIN`, header Cache-Control `no-store`. |

### Đường dẫn API cần có
| Phương thức | Đường dẫn | Mục đích | Mã phản hồi |
|---|---|---|---|
| `GET` | `/api/admin/promotions` | Danh sách phân trang chiến dịch | `200`, `400`, `401`, `403` |
| `GET` | `/api/admin/promotions/:id` | Xem chi tiết chiến dịch | `200`, `401`, `403`, `404` |
| `POST` | `/api/admin/promotions` | Tạo mới chiến dịch (hỗ trợ client UUID) | `201`, `400`, `401`, `403`, `409` |
| `PATCH` | `/api/admin/promotions/:id` | Cập nhật / đổi trạng thái (hỗ trợ CAS `expectedUpdatedAt`) | `200`, `400`, `401`, `403`, `404`, `409` |

### Dữ liệu
Sử dụng bảng `promotions` (`apps/api/prisma/schema/catalog.prisma:306-324`). Không sửa schema DB, không thêm migration.

### Tiêu chí chấp nhận
- **AC1** (thuận) Quản trị viên xem danh sách phân trang đúng, tạo mới chiến dịch đơn giản thành công với trạng thái mặc định `INACTIVE`.
- **AC2** (âm) Hệ thống từ chối yêu cầu từ người dùng không có quyền ADMIN (403), dữ liệu phân trang sai định dạng (400), giá trị giảm vượt quá 100% hoặc số tiền âm (400).
- **AC3** (biên) Khi có hai yêu cầu cập nhật đồng thời vào cùng một chiến dịch, yêu cầu đến sau với `expectedUpdatedAt` cũ bị từ chối 409 Conflict.
- **AC4** (biên) Khi tạo mới lặp lại cùng UUID và payload giống hệt, hệ thống trả về bản ghi đã tạo mà không tạo thêm bản ghi mới.
- **AC5** (biên) Chiến dịch có `conditions` phức tạp được bảo toàn nguyên vẹn khi truy vấn qua API, và ở trạng thái Chỉ xem (Read-Only) trên giao diện quản trị.
