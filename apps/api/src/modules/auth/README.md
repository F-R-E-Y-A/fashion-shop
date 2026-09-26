# Phân hệ `auth`

**Chủ sở hữu:** Tài · **Dòng việc:** PH-03 (Issue #8) · **Bảng:** `users`, `roles`, `user_roles`, `refresh_tokens`.

## Trạng thái

Phase 4 thêm `POST /api/auth/refresh` và `POST /api/auth/logout`. Refresh token chỉ đi qua cookie
HttpOnly, được rotate sau mỗi lần refresh; logout revoke refresh session hiện tại và xóa cookie.
Access token không cần thiết cho cả hai endpoint.

## Hợp đồng nội bộ hiện có

| Public export | Ý nghĩa |
|---|---|
| `AuthGuard` | Yêu cầu Bearer access token hợp lệ và chỉ cho user `ACTIVE` đi tiếp. |
| `CurrentUser` | Decorator đọc principal an toàn do guard đã gắn vào request. |
| `CurrentUserType` | `{ id, email, roles }`, không chứa credential hoặc session data. |

Ví dụ từ `apps/api/src/modules/cart`, module khác chỉ cần import qua public barrel:

```ts
import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
```

Không import `AuthService`, `TokenService` hay Prisma để lấy user hiện tại.
