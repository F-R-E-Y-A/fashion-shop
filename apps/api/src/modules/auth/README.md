# Phân hệ `auth`

**Chủ sở hữu:** Tài · **Dòng việc:** PH-03 (Issue #8) · **Bảng:** `users`, `roles`, `user_roles`, `refresh_tokens`.

## Trạng thái

Phase 1 chỉ có các primitive bảo mật: bcrypt cost 12, JWT access token, refresh-token random/hash và
cấu hình cookie HttpOnly. Chưa có HTTP endpoint, guard hoặc decorator.

## Hợp đồng nội bộ hiện có

| Export | Ý nghĩa |
|---|---|
| `PasswordHasherService` | Hash/verify mật khẩu qua bcrypt; controller không gọi bcrypt trực tiếp. |
| `TokenService` | Ký/kiểm access JWT, sinh raw refresh token và SHA-256 hash của nó. |

`AuthGuard`, `@CurrentUser()` và các endpoint chỉ được công bố khi được cài đặt ở phase sau.
