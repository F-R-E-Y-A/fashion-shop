---
title: Tài khoản và xác thực — bản đồ
updated: 2026-09-24
status: đang làm
owner: Tài
---
# Tài khoản và xác thực

**Chức năng:** Cửa vào của feature tài khoản: đặc tả ở đâu, dòng việc nào đang làm, hợp đồng công bố cho người khác, trạng thái hôm nay.

| | |
|---|---|
| **Người sở hữu** | Tài · `apps/api/src/modules/auth`, `apps/api/src/modules/users` · `apps/web/src/features/account` · bảng trong `prisma/schema/identity.prisma` |
| **Dòng việc** | PH-03 (Issue #8, nhánh `feature/ph3-auth`), sprint S2 |
| **Use case** | UC-01.1 đăng ký, UC-01.2 đăng nhập, UC-01.4 đăng xuất. Đặc tả của Duy đang ở pull request #9, chưa gộp; khi gộp đặt tại `docs/features/auth/use-cases.md` |

## Hợp đồng công bố

Duy cần biết ai đang đăng nhập để gộp giỏ. Issue #8 hẹn công bố trước hết Thứ Ba 23/09:

```
AuthGuard      // xac minh Bearer access JWT va gan principal an toan vao request
CurrentUser    // decorator lay { id, email, roles }
```

Khi có mã, chữ ký thật ghi ở `apps/api/src/modules/auth/README.md` theo mẫu [products/README.md](../../../apps/api/src/modules/products/README.md).

## Trạng thái hôm nay (26/09/2026)

`identity.prisma` và migration baseline đã có `users`, `roles`, `user_roles`, `refresh_tokens`.
Phase 4 đã có refresh/logout: refresh cookie HttpOnly được rotate khi cấp access token mới, còn
logout revoke refresh session hiện tại và xóa cookie. Hai endpoint này không cần access token.
Phase 5 giữ access token và user trong bộ nhớ giao diện; khi tải lại trang, app gọi `/auth/refresh`
bằng cookie HttpOnly để khôi phục phiên. Logout luôn xóa state giao diện, kể cả khi gọi API gặp lỗi.
