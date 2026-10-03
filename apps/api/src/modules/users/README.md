# Phân hệ `users`

**Chủ sở hữu:** Tài · **Dòng việc:** PH3 đợt 2 (Admin.1, Admin.2), PH4 (hồ sơ, sổ địa chỉ) · **Bảng:** `users`, `user_roles`, `roles`, `refresh_tokens`, `audit_logs`, `addresses`, `administrative_areas` (bảng của Tài).

## Trạng thái

API quản trị, mọi đường dẫn cần vai `ADMIN` qua `RequireRoles` của phân hệ `auth`: đọc (`GET /api/admin/users`,
`GET /api/admin/users/:id`, Admin.1) và khóa, mở khóa (`POST /api/admin/users/:id/lock|unlock`, Admin.2; ghi
`users`, `refresh_tokens`, `audit_logs`). Của chính người đăng nhập, chỉ cần `AuthGuard`: hồ sơ
(`GET`/`PATCH /api/users/me`) và sổ địa chỉ (`/api/users/me/addresses`). Công khai: `GET /api/administrative-areas`.
Mô tả nghiệp vụ và quyết định: [docs/features/users](../../../../../docs/features/users/README.md).

## Hợp đồng công bố

Chưa xuất service nào: chưa phân hệ nào cần đọc tài khoản hay địa chỉ qua đây. Bước đặt hàng sẽ cần một
hàm đọc địa chỉ theo `userId` + `id` để chụp vào `orders.shipping_address_snapshot`; công bố khi hợp
đồng với Duy chốt, không đọc thẳng bảng `addresses`. `index.ts` chỉ xuất `UsersModule` để
`app.module.ts` đăng ký.

Phân hệ khác cần biết **người đang đăng nhập** thì dùng `AuthGuard` và `CurrentUser` của `auth`, không dùng
phân hệ này.
