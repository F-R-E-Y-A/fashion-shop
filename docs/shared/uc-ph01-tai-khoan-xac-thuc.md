---
title: Tài khoản và xác thực — đặc tả nguồn S2
updated: 2026-11-25
status: lịch sử, xem thêm docs/features/auth
owner: Duy
---
# PH-01 · Tài khoản & Xác thực

**Chức năng:** Đặc tả nguồn Sprint 2 cho đăng ký, đăng nhập, đặt lại mật khẩu và đăng xuất (nay là UC-01.1 đến UC-01.4).

> Chép từ `uc-template.md`. Người viết đặc tả: **Phan Ngọc Duy**. Phần hồ sơ cá nhân, sổ địa chỉ và vóc dáng đã tách sang [uc-ph01-ho-so-dia-chi.md](uc-ph01-ho-so-dia-chi.md).

| | |
|---|---|
| **Thuộc dòng việc** | PH-01, sprint S2 |
| **Tác nhân chính** | Khách vãng lai, Khách hàng |
| **Bảng CSDL** | `USERS`, `AUTH_SESSIONS`, `ADDRESSES`, `FIT_PROFILES` |
| **Trạng thái** | Đã duyệt (tài liệu nguồn S2; triển khai hiện hành xem `docs/features/auth/`) |

---

## PH-01.1 · Đăng ký tài khoản

### Câu chuyện người dùng

Là một **khách vãng lai**, tôi muốn **tạo tài khoản bằng email và mật khẩu**, để **đăng nhập và mua hàng lần sau nhanh hơn**.

### Điều kiện trước

- Người dùng chưa có tài khoản với email đó.
- Hệ thống đang chạy bình thường.

### Điều kiện sau

- Bản ghi `USERS` mới được tạo với `role = 'customer'`, `status = 'active'`.
- Người dùng được đăng nhập tự động (tạo `AUTH_SESSIONS`).

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Điền email, mật khẩu, họ tên vào form đăng ký | |
| 2 | Bấm "Đăng ký" | Kiểm tra định dạng email, độ dài mật khẩu |
| 3 | | Hash mật khẩu bằng bcrypt (cost ≥ 12) |
| 4 | | Lưu `USERS`, trả về access token + refresh token |
| 5 | | Chuyển hướng người dùng tới trang chủ / trang vừa xem |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Email đã tồn tại | Trả 409 `email_already_exists`. Gợi ý "Đăng nhập hoặc đặt lại mật khẩu" |
| E2 | Email sai định dạng | Trả 422 `invalid_email`. Hiện thông báo inline |
| E3 | Mật khẩu < 8 ký tự | Trả 422 `password_too_short` |
| E4 | Thiếu trường bắt buộc | Trả 422 kèm danh sách trường lỗi |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Email phải duy nhất trong bảng `USERS` (ràng buộc UK) |
| BR2 | Mật khẩu tối thiểu 8 ký tự, có chữ hoa và số |
| BR3 | `password_hash` dùng bcrypt, không lưu mật khẩu plaintext |
| BR4 | Refresh token hết hạn sau 30 ngày; access token sau 15 phút |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password, full_name }` | `{ access_token, user: { id, email, full_name } }` | 409, 422 |

### Dữ liệu

- **Bảng ghi:** `USERS` (id, email UK, phone UK, password_hash, full_name, role='customer', status='active')
- **Bảng ghi:** `AUTH_SESSIONS` (id, user_id FK, refresh_token_hash UK, expires_at)
- **Ràng buộc:** `USERS.email` UNIQUE; `USERS.status` CHECK IN ('active','inactive','banned')

### Tiêu chí chấp nhận

- [ ] POST `/api/auth/register` với email hợp lệ trả 201 và `access_token`
- [ ] Đăng ký trùng email trả 409 với mã `email_already_exists`
- [ ] Mật khẩu dưới 8 ký tự trả 422 với mã `password_too_short`
- [ ] Kiểm tra DB: bản ghi `USERS` mới có `role='customer'`, `status='active'`
- [ ] Kiểm tra DB: `password_hash` không bằng plaintext

---

## PH-01.2 · Đăng nhập

### Câu chuyện người dùng

Là một **khách vãng lai**, tôi muốn **đăng nhập bằng email và mật khẩu**, để **truy cập giỏ hàng, đơn hàng và thông tin cá nhân của mình**.

### Điều kiện trước

- Tài khoản tồn tại với `status = 'active'`.

### Điều kiện sau

- `AUTH_SESSIONS` mới được tạo.
- Client nhận được access token (15 phút) và refresh token (30 ngày).
- Giỏ hàng khách (guest cart) được hợp nhất vào giỏ tài khoản nếu có.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Điền email + mật khẩu, bấm "Đăng nhập" | |
| 2 | | Tìm `USERS` theo email |
| 3 | | So sánh bcrypt hash |
| 4 | | Tạo `AUTH_SESSIONS`, cấp access + refresh token |
| 5 | | Hợp nhất guest cart nếu có `guest_token_hash` trong cookie |
| 6 | | Chuyển hướng tới trang trước đó hoặc trang chủ |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Email không tồn tại | Trả 401 `invalid_credentials` (không phân biệt để tránh user enumeration) |
| E2 | Mật khẩu sai | Trả 401 `invalid_credentials` |
| E3 | Tài khoản bị khóa (`status='banned'`) | Trả 403 `account_banned`. Hiện lý do nếu có |
| E4 | Refresh token đã bị thu hồi | Trả 401 `token_revoked`; yêu cầu đăng nhập lại |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Thông báo lỗi luôn là "Email hoặc mật khẩu không đúng" — không tiết lộ email có tồn tại không |
| BR2 | Mỗi lần đăng nhập tạo một `AUTH_SESSIONS` mới; không vô hiệu hoá phiên cũ tự động |
| BR3 | Refresh token được hash SHA-256 trước khi lưu |
| BR4 | Guest cart hợp nhất: nếu SKU trùng thì cộng số lượng, giữ tổng ≤ 99 |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| POST | `/api/auth/login` | `{ email, password, guest_token? }` | `{ access_token, refresh_token, user }` | 401, 403 |
| POST | `/api/auth/refresh` | `{ refresh_token }` | `{ access_token }` | 401 |

### Dữ liệu

- **Đọc:** `USERS` (email, password_hash, status)
- **Ghi:** `AUTH_SESSIONS` (refresh_token_hash, expires_at, user_id)
- **Ghi:** `CARTS` (hợp nhất guest cart)

### Tiêu chí chấp nhận

- [ ] Đăng nhập đúng trả 200 với `access_token` và `refresh_token`
- [ ] Sai mật khẩu trả 401 với thông báo chung, không lộ email có tồn tại không
- [ ] Tài khoản `banned` trả 403 `account_banned`
- [ ] Refresh token hết hạn sau 30 ngày
- [ ] POST `/api/auth/refresh` với token hợp lệ trả access token mới

---

## PH-01.3 · Đặt lại mật khẩu

### Câu chuyện người dùng

Là một **khách vãng lai**, tôi muốn **nhận email đặt lại mật khẩu và tạo mật khẩu mới**, để **lấy lại quyền truy cập tài khoản khi quên mật khẩu**.

### Điều kiện trước

- Email tồn tại trong hệ thống.

### Điều kiện sau

- `AUTH_SESSIONS` cũ bị thu hồi.
- `USERS.password_hash` được cập nhật.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhập email vào form "Quên mật khẩu" | |
| 2 | | Kiểm tra email tồn tại; gửi link đặt lại (hết hạn 1 giờ) qua Dịch vụ thư |
| 3 | Nhấn link trong email | Kiểm tra token còn hợp lệ |
| 4 | Nhập mật khẩu mới (2 lần) | |
| 5 | | Hash và lưu mật khẩu mới; thu hồi tất cả phiên cũ |
| 6 | | Chuyển hướng tới trang đăng nhập |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Email không tồn tại | Vẫn hiện "Nếu email tồn tại, bạn sẽ nhận được thư" — không lộ thông tin |
| E2 | Link hết hạn (> 1 giờ) | Trả 410 `reset_token_expired`; yêu cầu gửi lại |
| E3 | Mật khẩu mới trùng mật khẩu cũ | Trả 422 `same_as_current_password` |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Token đặt lại hết hạn sau 60 phút và chỉ dùng được 1 lần |
| BR2 | Sau khi đặt lại, thu hồi tất cả `AUTH_SESSIONS` của user |
| BR3 | Không cho phép đặt lại về mật khẩu cũ |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| POST | `/api/auth/forgot-password` | `{ email }` | `{ message }` | — |
| POST | `/api/auth/reset-password` | `{ token, new_password }` | `{ message }` | 410, 422 |

### Dữ liệu

- **Đọc / Ghi:** `USERS` (password_hash)
- **Ghi:** `AUTH_SESSIONS` (revoked_at)

### Tiêu chí chấp nhận

- [ ] POST `/api/auth/forgot-password` luôn trả 200, dù email có tồn tại hay không
- [ ] Link đặt lại trong email hết hạn sau 60 phút
- [ ] Dùng link hết hạn trả 410 `reset_token_expired`
- [ ] Sau đặt lại thành công: tất cả phiên cũ bị thu hồi, mật khẩu mới hoạt động

---

## PH-01.4 · Đăng xuất

### Câu chuyện người dùng

Là một **khách hàng**, tôi muốn **đăng xuất**, để **bảo vệ tài khoản khi dùng thiết bị chung**.

### Điều kiện trước

- Người dùng đang đăng nhập (có phiên hợp lệ).

### Điều kiện sau

- `AUTH_SESSIONS.revoked_at` được đặt; access token không còn hợp lệ.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Bấm "Đăng xuất" | |
| 2 | | Thu hồi refresh token hiện tại (cập nhật `revoked_at`) |
| 3 | | Xóa cookie/localStorage phía client |
| 4 | | Chuyển hướng về trang chủ |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| POST | `/api/auth/logout` | `{ refresh_token }` | `{ message }` | 401 |

### Tiêu chí chấp nhận

- [ ] Sau đăng xuất, POST `/api/auth/refresh` với token cũ trả 401 `token_revoked`
- [ ] Access token hiện tại vô hiệu sau tối đa 15 phút (TTL tự nhiên)

---

## Phần đã tách sang tệp cùng thư mục

Các use case `PH-01.5` (Cập nhật thông tin cá nhân), `PH-01.6` (Quản lý địa chỉ giao hàng) và `PH-01.7` (Hồ sơ vóc dáng) đã được tách sang [uc-ph01-ho-so-dia-chi.md](uc-ph01-ho-so-dia-chi.md) để bảo đảm trần 300 dòng/tệp. Đặc tả làm mới phiên (`UC-01.4`) và trạng thái hiện tại của phân hệ xác thực xem tại [docs/features/auth/use-cases.md](../features/auth/use-cases.md).
