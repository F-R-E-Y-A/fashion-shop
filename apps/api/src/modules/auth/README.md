# Phân hệ `auth`

**Chủ sở hữu:** Tài · **Dòng việc:** PH-03 (Issue #8) · **Bảng:** `users`, `roles`, `user_roles`, `refresh_tokens`.

## Trạng thái

Phase 4 thêm `POST /api/auth/refresh` và `POST /api/auth/logout`. Refresh token chỉ đi qua cookie
HttpOnly, được rotate sau mỗi lần refresh; logout revoke refresh session hiện tại và xóa cookie.
Access token không cần thiết cho cả hai endpoint.

Admin.1 thêm phân quyền theo vai (`RequireRoles`, `RolesGuard`, `RoleCode`). Lý do ở
[ADR-021](../../../../../docs/features/auth/LOG.md#adr-021).

## Hợp đồng nội bộ hiện có

| Public export | Ý nghĩa |
|---|---|
| `AuthGuard` | Yêu cầu Bearer access token hợp lệ và chỉ cho user `ACTIVE` đi tiếp. |
| `CurrentUser` | Decorator đọc principal an toàn do guard đã gắn vào request. |
| `CurrentUserType` | `{ id, email, roles }`, không chứa credential hoặc session data. |
| `RequireRoles(...roles)` | Gắn `AuthGuard` rồi `RolesGuard`. Chưa đăng nhập `401`, thiếu vai `403 FORBIDDEN`. Một vai khớp là đủ. Gắn ở class hoặc method, không cả hai. |
| `RoleCode`, `ROLE_CODES` | Mã vai `CUSTOMER`, `ADMIN`. Dùng hằng này, không gõ chuỗi vai tay. |
| `RolesGuard` | Chỉ để `RequireRoles` dùng; gắn riêng mà thiếu metadata thì luôn từ chối. |

Ví dụ từ `apps/api/src/modules/cart`, module khác chỉ cần import qua public barrel:

```ts
import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
```

Chặn một controller chỉ cho quản trị viên:

```ts
import { RequireRoles, RoleCode } from '../auth/index.js';

@Controller('admin/<phan-he>')
@RequireRoles(RoleCode.ADMIN)
export class AdminXxxController {}
```

Module dùng `RequireRoles` phải `imports: [AuthModule]`. Không import `AuthService`, `TokenService` hay
Prisma để lấy user hiện tại hay kiểm vai.
