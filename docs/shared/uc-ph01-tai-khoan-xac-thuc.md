# PH-01 · Tài khoản & Xác thực

> Chép từ `uc-template.md`. Người viết đặc tả: **Phan Ngọc Duy**.
> Người viết mã: **Phan Ngọc Duy** (sprint 2).

| | |
|---|---|
| **Thuộc dòng việc** | PH-01, sprint S2 |
| **Người viết** | Phan Ngọc Duy (HT-04) |
| **Tác nhân chính** | Khách vãng lai, Khách hàng |
| **Tác nhân phụ** | — |
| **Bảng CSDL** | `USERS`, `AUTH_SESSIONS`, `ADDRESSES`, `FIT_PROFILES` |
| **Trạng thái** | Đã duyệt |

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

## PH-01.5 · Cập nhật thông tin cá nhân

### Câu chuyện người dùng

Là một **khách hàng**, tôi muốn **cập nhật họ tên và số điện thoại**, để **thông tin trên đơn hàng chính xác**.

### Điều kiện trước

- Người dùng đã đăng nhập.

### Điều kiện sau

- `USERS.full_name` và / hoặc `USERS.phone` được cập nhật.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Truy cập trang "Thông tin cá nhân" | Lấy và hiện dữ liệu hiện tại |
| 2 | Chỉnh sửa và bấm "Lưu" | Kiểm tra số điện thoại (10 chữ số, bắt đầu 0) |
| 3 | | Cập nhật `USERS`, trả 200 |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Số điện thoại đã dùng bởi tài khoản khác | Trả 409 `phone_already_exists` |
| E2 | Định dạng số điện thoại sai | Trả 422 `invalid_phone` |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/users/me` | — | `{ id, email, phone, full_name }` | 401 |
| PATCH | `/api/users/me` | `{ full_name?, phone? }` | `{ user }` | 409, 422 |

### Tiêu chí chấp nhận

- [ ] PATCH `/api/users/me` với họ tên mới trả 200 và dữ liệu đã cập nhật
- [ ] Số điện thoại trùng tài khoản khác trả 409
- [ ] Token hết hạn trả 401

---

## PH-01.6 · Quản lý địa chỉ giao hàng

### Câu chuyện người dùng

Là một **khách hàng**, tôi muốn **thêm, sửa, xóa địa chỉ giao hàng và đặt một địa chỉ mặc định**, để **chọn nhanh khi đặt hàng**.

### Điều kiện trước

- Người dùng đã đăng nhập.

### Điều kiện sau

- `ADDRESSES` được tạo / cập nhật / xóa theo yêu cầu.
- Chỉ một địa chỉ có `is_default = true` tại một thời điểm.

### Luồng chính — Thêm địa chỉ

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Điền recipient_name, phone, tỉnh/huyện/xã, địa chỉ cụ thể | |
| 2 | Tích "Đặt làm mặc định" (tuỳ chọn) | |
| 3 | Bấm "Lưu" | Nếu `is_default = true`, cập nhật địa chỉ cũ thành `false` trước |
| 4 | | Lưu bản ghi mới, trả 201 |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Mỗi user chỉ có một `is_default = true`; thay đổi mặc định phải cập nhật atomically |
| BR2 | Không xóa địa chỉ đang được tham chiếu trong `ORDER_ADDRESSES` (snapshot đã tạo, không ảnh hưởng) |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/users/me/addresses` | — | `[Address]` | 401 |
| POST | `/api/users/me/addresses` | `{ recipient_name, phone, province_code, district_code, ward_code, address_line, is_default? }` | `{ address }` | 422 |
| PUT | `/api/users/me/addresses/:id` | `{ ...fields }` | `{ address }` | 403, 404 |
| DELETE | `/api/users/me/addresses/:id` | — | 204 | 403, 404 |

### Tiêu chí chấp nhận

- [ ] POST tạo địa chỉ mới trả 201 với dữ liệu đầy đủ
- [ ] Đặt mặc định: địa chỉ cũ mặc định chuyển thành `false` atomically
- [ ] DELETE địa chỉ không phải của mình trả 403
- [ ] GET trả danh sách địa chỉ của user hiện tại, không lộ địa chỉ user khác

---

## PH-01.7 · Cập nhật hồ sơ vóc dáng (Fit Profile)

### Câu chuyện người dùng

Là một **khách hàng**, tôi muốn **nhập số đo vóc dáng và phong cách mặc ưa thích**, để **nhận gợi ý size phù hợp hơn khi xem sản phẩm**.

### Điều kiện trước

- Người dùng đã đăng nhập.
- Người dùng đã đọc và đồng ý chính sách dữ liệu cá nhân.

### Điều kiện sau

- `FIT_PROFILES` được tạo hoặc cập nhật (UPSERT theo `user_id`).

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | `FIT_PROFILES.consent_at` phải được ghi nhận trước khi lưu số đo |
| BR2 | Tất cả số đo là tuỳ chọn, không bắt buộc nhập đủ |
| BR3 | Xóa hồ sơ vóc dáng: đặt tất cả số đo về NULL, giữ `consent_at` |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/users/me/fit-profile` | — | `{ FitProfile \| null }` | 401 |
| PUT | `/api/users/me/fit-profile` | `{ height_cm?, weight_kg?, chest_cm?, waist_cm?, hip_cm?, preferred_fit?, consent_at }` | `{ fit_profile }` | 422 |

### Tiêu chí chấp nhận

- [ ] PUT không có `consent_at` trả 422
- [ ] PUT hợp lệ tạo hoặc cập nhật `FIT_PROFILES`, trả 200
- [ ] GET trả null nếu chưa tạo hồ sơ
- [ ] Tất cả số đo là số dương hoặc null; giá trị âm trả 422

---

## Câu hỏi còn treo

1. Có cần xác thực email (email verification) sau khi đăng ký không, hay đăng nhập được ngay?
2. Số lần đăng nhập sai tối đa trước khi tạm khóa — có cần trong sprint 2 không?
3. `FIT_PROFILES` dùng để hiện gợi ý size ở đâu — PH-03 hay PH-05? Cần chốt để biết API nào gọi.
