---
title: Tài khoản người dùng — bản đồ
updated: 2026-10-04
status: đang làm
owner: Tài
---
# Tài khoản người dùng

**Chức năng:** Cửa vào của feature tài khoản: quản trị tài khoản (Admin.1, Admin.2) ở đây, hồ sơ và sổ địa chỉ ở [profile-address.md](profile-address.md).

| | |
|---|---|
| **Người sở hữu** | Tài · module `apps/api/src/modules/users` · bảng `users`, `roles`, `user_roles`, `refresh_tokens`, `audit_logs`, `addresses`, `administrative_areas` trong `prisma/schema/identity.prisma` |
| **Dòng việc** | PH3 đợt 2 (S3): phân quyền và quản trị người dùng, đã gộp qua [PR #24](https://github.com/F-R-E-Y-A/fashion-shop/pull/24) (`aee345e`). PH4: hồ sơ và sổ địa chỉ phía máy chủ đã gộp qua [PR #25](https://github.com/F-R-E-Y-A/fashion-shop/pull/25) (`8e390c9`); giao diện đã gộp qua [PR #29](https://github.com/F-R-E-Y-A/fashion-shop/pull/29) và [PR #32](https://github.com/F-R-E-Y-A/fashion-shop/pull/32) |
| **Use case** | PH-02.1 "Quản lý tài khoản người dùng" trong [sơ đồ use case](../../shared/diagrams/uc-tong-quan.md), theo quy ước mới là UC-02.1, chưa có đặc tả. Hồ sơ và địa chỉ: PH-01.5, PH-01.6 trong [uc-ph01](../../shared/uc-ph01-tai-khoan-xac-thuc.md), nay là UC-01.5, UC-01.6. [use-case-index.md](../../shared/use-case-index.md) còn trống |

## Giải quyết việc gì

Quản trị viên xem được danh sách và chi tiết tài khoản mà không đụng tới dữ liệu nhạy cảm, và khóa được một
tài khoản đang hoạt động sao cho mọi phiên hiện có chết ngay và không sống lại khi mở khóa. Đây là các endpoint
quản trị đầu tiên của hệ thống, nơi phân quyền theo vai ([ADR-021](../auth/LOG.md#adr-021)) được dùng thật.

## Phạm vi

| Hạng mục | Trạng thái |
|---|---|
| Hạ tầng vai (`RoleCode`, `RolesGuard`, `RequireRoles`), vai `ADMIN` bằng migration, `admin:grant` | Admin.1, xong |
| `GET /api/admin/users`, `GET /api/admin/users/:id` | Admin.1, xong |
| `POST /api/admin/users/:id/lock`, `POST /api/admin/users/:id/unlock`, thu hồi phiên, nhật ký | Admin.2, xong |
| Chặn `/quan-tri` ở giao diện | Chưa làm: route hiện chỉ dựng `AdminLayout` (`apps/web/src/app/routes.tsx:57`); PR #15 đã gộp |
| Gán vai, tìm kiếm, `STAFF`, màn xem nhật ký | Chưa làm |
| Hồ sơ `GET`/`PATCH /api/users/me`, khu vực hành chính, sổ địa chỉ | PH4, xong phía máy chủ: [profile-address.md](profile-address.md) |
| Giao diện `/tai-khoan`, hồ sơ và sổ địa chỉ | Đã gộp vào develop qua PR #29 và PR #32: [profile-address.md](profile-address.md#giao-diện-web-hiện-tại) |
| Dữ liệu tỉnh/xã thật: 34 tỉnh, 3321 xã theo Quyết định 19/2025/QĐ-TTg | Đã có tệp, seed và `areas:import` trong develop: [profile-address.md](profile-address.md#dữ-liệu-tỉnhxã), [ADR-024](LOG.md#adr-024); còn chạy nạp trên staging/production ([ND-12](../../TECH_DEBT.md)) |

## Dữ liệu

Không có bảng mới, không migration mới ở Admin.2. Đọc `users` qua allowlist `adminUserSelect`. Khóa ghi
`users.status`, `users.auth_version`, `refresh_tokens.revoked_at` và thêm một dòng `audit_logs`; mở khóa ghi
`users.status` và một dòng `audit_logs`.

## API

Đã cài đặt, hình dạng đầy đủ ở Swagger `/api/docs` (thẻ `admin-users`). Mọi đường dẫn cần vai `ADMIN`:

| Tình huống | Mã |
|---|---|
| Không có hoặc sai access token, tài khoản không `ACTIVE` | `401 UNAUTHORIZED` |
| Đã đăng nhập nhưng không có vai `ADMIN` | `403 FORBIDDEN` |
| `page`, `pageSize` sai; tham số lạ (`search`, `status` chưa hỗ trợ); `:id` không phải UUID | `400 BAD_REQUEST` |
| `:id` đúng dạng UUID nhưng không có tài khoản | `404 NOT_FOUND` |
| Khóa tài khoản không ở `ACTIVE` (đã khóa, `PENDING_VERIFICATION`, `DISABLED`) | `409 USER_NOT_ACTIVE` |
| Mở khóa tài khoản không ở `LOCKED` | `409 USER_NOT_LOCKED` |
| Tự khóa chính mình | `422 CANNOT_LOCK_SELF` |

Danh sách theo `Page` của [api.md](../../shared/api.md), mới tạo trước, trùng thời điểm thì theo `id`.
Mỗi tài khoản (cả phản hồi 200 của khóa và mở khóa) chỉ gồm `id`, `email`, `status`, `roles` (xếp theo abc),
`emailVerifiedAt`, `createdAt`. Không bao giờ có `passwordHash`, `authVersion`, token hay OTP.
Mọi phản hồi của controller này (200, và 400/404/409/422 sau khi qua kiểm quyền) mang `Cache-Control: no-store`.

Kiểm quyền chạy trước kiểm dữ liệu vào, nên người không đủ quyền luôn nhận 401 hoặc 403, không bao giờ 400
hay 404 để dò xem id nào tồn tại. Khóa và mở khóa là `POST` với động từ nghiệp vụ, không `PATCH` trường
`status` (quy ước api.md); không nhận thân yêu cầu, người thao tác lấy từ `CurrentUser`.

## Khóa và mở khóa: phiên đăng nhập

| | Khóa (`ACTIVE` → `LOCKED`) | Mở khóa (`LOCKED` → `ACTIVE`) |
|---|---|---|
| `authVersion` | Tăng 1: mọi access token cũ bị `AuthGuard` từ chối ngay | Giữ nguyên: token cũ vẫn chết |
| Refresh token | Thu hồi mọi token còn hiệu lực: refresh cũ trả 401, kể cả sau mở khóa | Không phục hồi, không cấp token mới |
| Nhật ký | `LOCK_USER`, metadata `{ fromStatus, toStatus, revokedSessions }` | `UNLOCK_USER`, metadata `{ fromStatus, toStatus }` |

Tất cả trong một giao dịch, chuyển trạng thái có điều kiện (`WHERE status = …`), nên hai yêu cầu song song chỉ
một thành công, yêu cầu kia nhận 409, và chỉ có một dòng nhật ký. Thao tác thất bại không ghi nhật ký.
Nhật ký ghi `actorUserId` là quản trị viên, `entityType` `USER`, `entityId` là tài khoản bị thao tác, không có
email, token hay thân yêu cầu.

Đăng nhập và làm mới phiên khoá dòng `users` (`FOR SHARE`) trước khi tạo hay xoay refresh token
([ADR-022](../auth/LOG.md#adr-022)). Nhờ đó một lần đăng nhập đang tính bcrypt, hay một lần refresh đang xoay,
đúng lúc quản trị viên khóa tài khoản sẽ không để lại token nào sống lại sau khi mở khóa.

## Tạo quản trị viên đầu tiên

```bash
npm run admin:grant -w apps/api -- --email=<email>
```

Người đó phải tự đăng ký và xác thực email trước. Kết quả: `GRANTED`, `ALREADY_ADMIN` (thoát 0) hoặc
`USER_NOT_FOUND`, `USER_NOT_ACTIVE`, `INVALID_EMAIL`, `ADMIN_ROLE_MISSING` (thoát 1). Script in CSDL đích
(không có thông tin đăng nhập) và id người dùng, không in email. Staging/production: đặt `DATABASE_URL` của
môi trường đó trước lệnh. Vai có hiệu lực ngay request kế tiếp, không cần đăng nhập lại.

## Kiểm thử và nghiệm thu

| Tiêu chí | Bài kiểm thử |
|---|---|
| T-M5: ẩn danh 401, `CUSTOMER` 403, `ADMIN` 200; phân trang, 404, 400, không lộ trường nhạy cảm | `apps/api/test/admin-users.http.spec.ts` |
| Gỡ hay cấp `ADMIN` có hiệu lực ngay với cùng access token; `admin:grant` | như trên, và `grant-admin-role.spec.ts` |
| Khóa, mở khóa: 401/403/404/400/409/422, không ghi nhật ký khi thất bại | `apps/api/test/admin-users-lock.http.spec.ts` |
| Access và refresh cũ chết sau khóa, vẫn chết sau mở khóa; đăng nhập mới thì được | như trên |
| Đồng thời (mỗi bài lặp 5 vòng): hai khóa, hai mở khóa, khóa cùng mở khóa, khóa trong lúc đăng nhập, khóa trong lúc refresh | như trên |
| Chuyển trạng thái có điều kiện, không thu hồi hay ghi nhật ký khi thất bại | `apps/api/src/modules/users/admin-users.service.spec.ts` |
| `RolesGuard`, `RequireRoles`, `RoleCode` | `apps/api/src/modules/auth/*.spec.ts` |

## Trạng thái hôm nay (04/10/2026)

Admin.1 và Admin.2 đã gộp vào `develop` (pull request #24, `aee345e`). API hồ sơ, khu vực hành chính và sổ địa
chỉ đã có; giao diện hồ sơ và địa chỉ đang được triển khai trên `feature/ph4-profile-address-web`. Dữ liệu
tỉnh/xã thật (34 tỉnh, 3321 xã) đã nạp vào CSDL dev, chưa nạp staging hay production; avatar và tích hợp checkout
ngoài phạm vi giao diện này.

## Còn mở

- Tiền tố `/api/admin/*` lấy theo T-M5 của [test-strategy.md](../../shared/test-strategy.md) nhưng chưa có
  trong [api.md](../../shared/api.md). [TBD — hỏi Bảo]
- T-M5 ghi ẩn danh nhận 403; API trả 401 theo bảng mã lỗi của api.md (401 chưa đăng nhập, 403 thiếu quyền).
  [TBD — hỏi Duy sửa test-strategy.md]
- Đặc tả UC-02.1 và UC-02.2 chưa viết.
- Tài khoản bị đặt `LOCKED` không qua API (sửa thẳng CSDL) thì không được tăng `authVersion` hay thu hồi phiên;
  mở khóa qua API khi đó không dọn các phiên cũ.
- Quản trị viên khóa được quản trị viên khác. Không ai tự khóa được mình, nhưng hai quản trị viên khóa lẫn nhau
  **cùng lúc** thì cả hai đều thành công (mỗi bên đã qua `AuthGuard` trước khi bên kia commit) và có thể không
  còn quản trị viên nào hoạt động. Gỡ bằng `admin:grant` cho một tài khoản `ACTIVE` khác. Chưa có luật "quản
  trị viên hoạt động cuối cùng".
