---
title: UC-01 Tài khoản và xác thực — đặc tả use case
updated: 2026-10-01
status: đang dùng
owner: Tài
---
# UC-01 · Tài khoản và xác thực

**Chức năng:** Khách đăng ký, xác thực OTP, đăng nhập, đặt lại mật khẩu và đổi mật khẩu: luồng, luật và tiêu chí chấp nhận.

| | |
|---|---|
| **Người viết đặc tả** | Phan Ngọc Duy (HT-04, bản gốc); Nguyễn Tấn Tài (PH-03, chuẩn hóa theo mã thật) |
| **Người sở hữu mã** | Nguyễn Tấn Tài, module `apps/api/src/modules/auth` |
| **Dòng việc** | **PH-03** làm UC-01.1 đến UC-01.6. Phần mở rộng (hồ sơ, địa chỉ, vóc dáng) chưa giao |
| **Tác nhân chính** | Khách vãng lai, Khách hàng |
| **Dữ liệu** | Bảng `users`, `roles`, `user_roles`, `refresh_tokens`, `otp_codes` trong `identity.prisma` |

---

## UC-01.1 · Đăng ký tài khoản

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **tạo tài khoản bằng email và mật khẩu**, để **bắt đầu sử dụng các dịch vụ của cửa hàng**.

### Điều kiện trước
- Chưa có tài khoản nào dùng email này.

### Điều kiện sau
- Tạo bản ghi `users` với `status = 'PENDING_VERIFICATION'`, gán vai trò `CUSTOMER`.
- Mã OTP được sinh và gửi tới email của người dùng. Không cấp access token hay cookie phiên.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhập email và mật khẩu tại trang đăng ký, bấm gửi | Kiểm tra hợp lệ dữ liệu |
| 2 | | Băm mật khẩu bằng bcrypt (cost ≥ 10) |
| 3 | | Tạo người dùng trạng thái chờ xác thực, tạo OTP và gửi qua email |
| 4 | | Chuyển hướng sang màn hình nhập mã xác thực OTP |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Email đã được sử dụng | Trả 409 `EMAIL_ALREADY_EXISTS` |
| E2 | Mật khẩu không đủ 8 ký tự | Trả 400 `BAD_REQUEST` |

### Tiêu chí chấp nhận
- [ ] **AC1** `POST /api/auth/register` với email mới trả 201 `{ accepted: true }`
- [ ] **AC2** Đăng ký email trùng trả 409 `EMAIL_ALREADY_EXISTS`
- [ ] **AC3** Tài khoản mới có `status = 'PENDING_VERIFICATION'`, chưa có quyền đăng nhập

---

## UC-01.2 · Xác thực email qua mã OTP

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **nhập mã OTP đã nhận qua email**, để **kích hoạt tài khoản**.

### Điều kiện trước
- Đã đăng ký và có tài khoản ở trạng thái `PENDING_VERIFICATION`.

### Điều kiện sau
- Tài khoản chuyển sang trạng thái `ACTIVE`, cập nhật `emailVerifiedAt`.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhập mã OTP 6 chữ số nhận từ email | |
| 2 | Bấm xác nhận | Kiểm tra mã OTP khớp và còn trong thời hạn 15 phút |
| 3 | | Đổi trạng thái user thành `ACTIVE`, hủy OTP đã dùng |
| 4 | | Thông báo thành công và điều hướng sang trang đăng nhập |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Mã OTP sai hoặc đã hết hạn | Trả 400 `INVALID_OR_EXPIRED_OTP` |

### Tiêu chí chấp nhận
- [ ] **AC1** `POST /api/auth/verify-email` đúng mã trả 200 `{ verified: true }`
- [ ] **AC2** Xác thực thành công ghi nhận `emailVerifiedAt`, không tự động cấp phiên đăng nhập

---

## UC-01.3 · Đăng nhập hệ thống

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **đăng nhập bằng email và mật khẩu**, để **sử dụng các tính năng dành cho thành viên**.

### Điều kiện trước
- Tài khoản tồn tại và ở trạng thái `ACTIVE`.

### Điều kiện sau
- Cấp Bearer access JWT trong thân phản hồi (thời hạn 15 phút).
- Cấp Refresh Token dạng cookie `HttpOnly` an toàn (thời hạn 30 ngày).

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhập email và mật khẩu tại trang đăng nhập | |
| 2 | Bấm "Đăng nhập" | Xác minh mật khẩu bằng bcrypt |
| 3 | | Cấp access token và set cookie refresh token |
| 4 | | Cập nhật trạng thái đăng nhập trên giao diện |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Email không tồn tại hoặc sai mật khẩu | Trả 401 `INVALID_CREDENTIALS` (thông báo chung) |
| E2 | Tài khoản chưa xác thực email | Trả 401 `EMAIL_NOT_VERIFIED` |
| E3 | Tài khoản bị khóa (`LOCKED` hoặc `DISABLED`) | Trả 403 `ACCOUNT_LOCKED` |

### Tiêu chí chấp nhận
- [ ] **AC1** `POST /api/auth/login` đúng thông tin trả 200 kèm `accessToken` và cookie `refresh_token`
- [ ] **AC2** Sai thông tin trả 401 không lộ email có tồn tại hay không

---

## UC-01.4 · Làm mới phiên và Đăng xuất

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **phiên đăng nhập tự duy trì mượt mà và có thể đăng xuất an toàn**, để **bảo vệ thông tin cá nhân**.

### Điều kiện sau
- Khi refresh: Thu hồi refresh token cũ, cấp cặp token mới (xoay vòng token).
- Khi logout: Thu hồi phiên tại máy chủ và xóa sạch cookie, bộ nhớ tại máy khách.

### Tiêu chí chấp nhận
- [ ] **AC1** `POST /api/auth/refresh` bằng cookie hợp lệ trả access token mới và rotate cookie
- [ ] **AC2** Phát hiện token replay (dùng lại refresh token cũ) sẽ thu hồi toàn bộ token family
- [ ] **AC3** `POST /api/auth/logout` thu hồi session máy chủ và xóa sạch token tại client

---

## UC-01.5 · Quên và đặt lại mật khẩu

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **yêu cầu đặt lại mật khẩu qua email**, để **lấy lại quyền truy cập khi quên mật khẩu**.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhập email tại trang quên mật khẩu | Gửi mã đặt lại mật khẩu qua email |
| 2 | Nhập mã xác nhận và mật khẩu mới | Kiểm tra tính hợp lệ |
| 3 | | Băm mật khẩu mới, tăng `authVersion` để vô hiệu hóa tất cả phiên cũ |

### Tiêu chí chấp nhận
- [ ] **AC1** `POST /api/auth/forgot-password` luôn trả 200 để tránh lộ email (user enumeration)
- [ ] **AC2** Đặt lại mật khẩu thành công làm vô hiệu hóa mọi access token cũ nhờ `authVersion`

---

## UC-01.6 · Đổi mật khẩu tài khoản

### Câu chuyện người dùng
Là một **khách hàng đã đăng nhập**, tôi muốn **đổi mật khẩu định kỳ**, để **tăng cường bảo mật**.

### Điều kiện trước
- Người dùng đã đăng nhập (mang Bearer token hợp lệ).

### Tiêu chí chấp nhận
- [ ] **AC1** `POST /api/auth/change-password` sai mật khẩu hiện tại trả 400
- [ ] **AC2** Đổi mật khẩu mới thành công tự động đăng xuất để người dùng đăng nhập lại
