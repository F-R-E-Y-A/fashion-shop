# Phân hệ `users`

**Chủ sở hữu:** Tài · **Dòng việc:** PH3 đợt 2, Admin.1 và Admin.2 · **Bảng:** `users`, `user_roles`, `roles`, `refresh_tokens`, `audit_logs` (bảng của Tài).

## Trạng thái

API quản trị, mọi đường dẫn cần vai `ADMIN` qua `RequireRoles` của phân hệ `auth`: đọc (`GET /api/admin/users`,
`GET /api/admin/users/:id`, Admin.1) và khóa, mở khóa (`POST /api/admin/users/:id/lock|unlock`, Admin.2; ghi
`users`, `refresh_tokens`, `audit_logs`). Mô tả nghiệp vụ và quyết định: [docs/features/users](../../../../../docs/features/users/README.md).

## Hợp đồng công bố

Chưa xuất service nào: chưa phân hệ nào cần đọc tài khoản qua đây. `index.ts` chỉ xuất `UsersModule` để
`app.module.ts` đăng ký.

Phân hệ khác cần biết **người đang đăng nhập** thì dùng `AuthGuard` và `CurrentUser` của `auth`, không dùng
phân hệ này.
