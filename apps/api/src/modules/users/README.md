# Phân hệ `users`

**Chủ sở hữu:** Tài · **Dòng việc:** PH3 đợt 2, Admin.1 · **Bảng:** đọc `users`, `user_roles`, `roles` (bảng của Tài).

## Trạng thái

Chỉ có API quản trị chỉ đọc: `GET /api/admin/users` và `GET /api/admin/users/:id`, cả hai cần vai `ADMIN`
qua `RequireRoles` của phân hệ `auth`. Mô tả nghiệp vụ và quyết định: [docs/features/users](../../../../../docs/features/users/README.md).

## Hợp đồng công bố

Chưa xuất service nào: chưa phân hệ nào cần đọc tài khoản qua đây. `index.ts` chỉ xuất `UsersModule` để
`app.module.ts` đăng ký.

Phân hệ khác cần biết **người đang đăng nhập** thì dùng `AuthGuard` và `CurrentUser` của `auth`, không dùng
phân hệ này.
