---
title: UC-10 Quản lý khuyến mãi — đặc tả use case
updated: 2026-11-11
status: nháp
owner: Tài
---
# UC-10 · Quản lý khuyến mãi

**Chức năng:** Đặc tả đề xuất cho UC-10.1 Quản trị chương trình khuyến mãi đơn giản (MVP Issue #88).

| | |
|---|---|
| **Người viết đặc tả** | Tài (đề xuất, chờ Duy review) |
| **Người sở hữu mã** | Duy (engine & service), Tài (quản trị admin) |
| **Dòng việc** | PH-03 / PH-10 (Issue #88) |
| **Tác nhân chính** | Quản trị viên (ADMIN) |
| **Tác nhân phụ** | — |

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
