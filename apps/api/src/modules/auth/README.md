# Phân hệ `auth`

**Chủ sở hữu:** Tài · **Dòng việc:** PH-03 (Issue #8) · **Bảng:** `users`, `roles`, `user_roles`, `refresh_tokens`.

## Trạng thái

Phase 2 có `POST /api/auth/register` và `POST /api/auth/login`: bcrypt cost 12, access JWT,
refresh token hash lưu trong DB và cookie HttpOnly. Chưa có refresh/logout endpoint, guard hoặc decorator.

## Hợp đồng nội bộ hiện có

| Export | Ý nghĩa |
|---|---|
| `PasswordHasherService` | Hash/verify mật khẩu qua bcrypt; controller không gọi bcrypt trực tiếp. |
| `TokenService` | Ký/kiểm access JWT, sinh raw refresh token và SHA-256 hash của nó. |
| `AuthService` | Đăng ký/đăng nhập, gán role CUSTOMER và tạo refresh session. |

`AuthGuard`, `@CurrentUser()`, refresh/logout và current-user endpoint chỉ được công bố khi được cài đặt ở phase sau.
