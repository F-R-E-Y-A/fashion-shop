---
title: Quản trị tài khoản — bản đồ
updated: 2026-09-30
status: đang làm
owner: Tài
---
# Quản trị tài khoản

**Chức năng:** Cửa vào của feature quản trị tài khoản: phạm vi Admin.1, dữ liệu, API, quyền, kiểm thử, trạng thái hôm nay và việc còn mở.

| | |
|---|---|
| **Người sở hữu** | Tài · module `apps/api/src/modules/users` · bảng `users`, `roles`, `user_roles` trong `prisma/schema/identity.prisma` |
| **Dòng việc** | PH3 đợt 2 (S3): phân quyền theo vai và quản trị người dùng, nhánh `feature/ph3-rbac-admin-users`. Admin.1 là lát cắt đầu |
| **Use case** | PH-02.1 "Quản lý tài khoản người dùng" trong [sơ đồ use case](../../shared/diagrams/uc-tong-quan.md), theo quy ước mới là UC-02.1. Chưa có đặc tả; [use-case-index.md](../../shared/use-case-index.md) còn trống |

## Giải quyết việc gì

Quản trị viên xem được danh sách tài khoản và chi tiết một tài khoản (trạng thái, vai, ngày tạo, đã xác thực
email chưa) mà không đụng tới dữ liệu nhạy cảm. Đây cũng là endpoint quản trị đầu tiên của hệ thống, nên
nó là nơi phân quyền theo vai ([ADR-021](../auth/LOG.md#adr-021)) được dùng thật lần đầu.

## Phạm vi Admin.1

| Hạng mục | Trạng thái |
|---|---|
| Hạ tầng vai (`RoleCode`, `RolesGuard`, `RequireRoles`) | Đã làm, ở module `auth` ([README](../auth/README.md)) |
| Vai `ADMIN` nạp bằng migration, script `admin:grant` | Đã làm |
| `GET /api/admin/users`, `GET /api/admin/users/:id` | Đã làm |
| Chặn `/quan-tri` ở giao diện | Chưa làm: pull request #15 đang sửa `routes.tsx`, `StoreLayout.tsx`, `core/http.ts` |
| Khóa, mở khóa, gán vai, tìm kiếm, `STAFF`, nhật ký thao tác | Ngoài Admin.1 |

## Dữ liệu

Không có bảng mới. Đọc `users` (chỉ các cột trong allowlist `adminUserSelect`) và `user_roles` nối `roles`.
Danh mục vai `CUSTOMER`, `ADMIN` do migration `20260930120000_ph3_role_catalog` nạp.

## API

Đã cài đặt, hình dạng đầy đủ ở Swagger `/api/docs` (thẻ `admin-users`). Cả hai cần vai `ADMIN`:

| Tình huống | Mã |
|---|---|
| Không có hoặc sai access token, tài khoản không `ACTIVE` | `401 UNAUTHORIZED` |
| Đã đăng nhập nhưng không có vai `ADMIN` | `403 FORBIDDEN` |
| `page`, `pageSize` sai; tham số lạ (`search`, `status` chưa hỗ trợ); `:id` không phải UUID | `400 BAD_REQUEST` |
| `:id` đúng dạng UUID nhưng không có tài khoản | `404 NOT_FOUND` |

Danh sách theo `Page` của [api.md](../../shared/api.md), mới tạo trước, trùng thời điểm thì theo `id`.
Mỗi tài khoản chỉ gồm `id`, `email`, `status`, `roles` (xếp theo abc), `emailVerifiedAt`, `createdAt`.
Không bao giờ có `passwordHash`, `authVersion`, token hay OTP: service không `select` các cột đó.
Mọi phản hồi của controller này (200, và 400/404 sau khi qua kiểm quyền) mang `Cache-Control: no-store`
(`NoStoreInterceptor` gắn ở cấp class), để trình duyệt hay proxy không lưu email và vai của người khác.

Kiểm quyền chạy trước kiểm dữ liệu vào, nên người không đủ quyền luôn nhận 401 hoặc 403, không bao giờ 400
hay 404 để dò xem id nào tồn tại.

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
| T-M5: ẩn danh 401, `CUSTOMER` 403, `ADMIN` 200 | `apps/api/test/admin-users.http.spec.ts` |
| Phân trang, 404, 400, không lộ trường nhạy cảm | như trên |
| Gỡ hay cấp `ADMIN` có hiệu lực ngay với cùng access token; `ADMIN` bị khóa thì 401 | như trên |
| `admin:grant`: chuẩn hoá email, idempotent, không tạo user, từ chối tài khoản chưa `ACTIVE` | như trên, và `grant-admin-role.spec.ts` |
| `RolesGuard` từ chối khi thiếu `request.user` hay thiếu metadata | `apps/api/src/modules/auth/roles.guard.spec.ts` |
| `RequireRoles` gắn `AuthGuard` trước `RolesGuard` | `require-roles.decorator.spec.ts` |
| `RoleCode` khớp danh mục vai trong migration | `role-code.spec.ts` |
| Service chỉ đọc cột trong allowlist | `apps/api/src/modules/users/admin-users.service.spec.ts` |

## Trạng thái hôm nay (30/09/2026)

Admin.1 phía máy chủ xong trên nhánh `feature/ph3-rbac-admin-users`, chưa commit và chưa gộp. Chưa có giao
diện.

## Còn mở

- Tiền tố `/api/admin/*` lấy theo T-M5 của [test-strategy.md](../../shared/test-strategy.md) nhưng chưa có
  trong [api.md](../../shared/api.md). [TBD — hỏi Bảo]
- T-M5 ghi ẩn danh nhận 403; Admin.1 trả 401 theo bảng mã lỗi của api.md (401 chưa đăng nhập, 403 thiếu
  quyền). [TBD — hỏi Duy sửa test-strategy.md]
- Đặc tả UC-02.1 và UC-02.2 chưa viết.
- Khóa và mở khóa (Admin.2) nên thu hồi refresh token trong cùng giao dịch, để mở khóa không làm sống lại
  phiên cũ.
