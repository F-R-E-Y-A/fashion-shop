---
title: Tài khoản người dùng — bản đồ
updated: 2026-11-02
status: đang làm
owner: Tài
---
# Tài khoản người dùng

**Chức năng:** Cửa vào của feature tài khoản: quản trị tài khoản (Admin.1–Admin.3, Issue #48) ở đây, hồ sơ và sổ địa chỉ ở [profile-address.md](profile-address.md).

| | |
|---|---|
| **Người sở hữu** | Tài · module `apps/api/src/modules/users` · bảng `users`, `roles`, `user_roles`, `refresh_tokens`, `audit_logs`, `addresses`, `administrative_areas` trong `prisma/schema/identity.prisma` |
| **Dòng việc** | PH3 đợt 2 (S3): phân quyền và quản trị người dùng, đã gộp qua [PR #24](https://github.com/F-R-E-Y-A/fashion-shop/pull/24) (`aee345e`). PH4: hồ sơ và sổ địa chỉ phía máy chủ đã gộp qua [PR #25](https://github.com/F-R-E-Y-A/fashion-shop/pull/25) (`8e390c9`); giao diện đã gộp qua [PR #29](https://github.com/F-R-E-Y-A/fashion-shop/pull/29) và [PR #32](https://github.com/F-R-E-Y-A/fashion-shop/pull/32) |
| **Use case** | UC-02.1 "Quản trị tài khoản và khóa người dùng": đặc tả đề xuất ở [use-cases.md](use-cases.md), mã theo PR #26 chưa gộp. Hồ sơ và địa chỉ: PH-01.5, PH-01.6 trong [uc-ph01](../../shared/uc-ph01-tai-khoan-xac-thuc.md), nay là UC-01.5, UC-01.6. [use-case-index.md](../../shared/use-case-index.md) còn trống |

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
| Giao diện quản trị `/admin/users`, `/admin/users/:id`: guard `ADMIN`, danh sách, chi tiết, khóa và mở khóa | Admin.3, [Issue #46](https://github.com/F-R-E-Y-A/fashion-shop/issues/46), đã gộp qua [PR #47](https://github.com/F-R-E-Y-A/fashion-shop/pull/47) (`47576d4`): [mục dưới](#giao-diện-quản-trị) |
| Tìm email, lọc trạng thái/vai/xác thực, sắp xếp, số dòng; khóa, mở khóa ngay trên danh sách | [Issue #48](https://github.com/F-R-E-Y-A/fashion-shop/issues/48), [PR #49](https://github.com/F-R-E-Y-A/fashion-shop/pull/49) vào `develop`, đang chờ review, chưa gộp |
| Gán vai, `STAFF`, màn xem nhật ký, tạo/sửa/xóa tài khoản, thao tác hàng loạt, xuất dữ liệu | Chưa làm |
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
| `page`, `pageSize`, `q`, `status`, `role`, `verified`, `sort` sai; tham số lặp; tham số lạ (vd `search`); `:id` không phải UUID | `400 BAD_REQUEST` |
| `:id` đúng dạng UUID nhưng không có tài khoản | `404 NOT_FOUND` |
| Khóa tài khoản không ở `ACTIVE` (đã khóa, `PENDING_VERIFICATION`, `DISABLED`) | `409 USER_NOT_ACTIVE` |
| Mở khóa tài khoản không ở `LOCKED` | `409 USER_NOT_LOCKED` |
| Tự khóa chính mình | `422 CANNOT_LOCK_SELF` |

Danh sách theo `Page` của [api.md](../../shared/api.md); mặc định mới tạo trước, trùng thời điểm thì theo `id`.
Từ Issue #48 nhận thêm tìm email, lọc trạng thái, vai, xác thực và bốn kiểu sắp xếp; `total` đếm theo đúng bộ lọc.
Luật nghiệp vụ ở [use-cases.md](use-cases.md) (BR8–BR10), hình dạng ở Swagger. Prisma **không** escape ký tự
đặc biệt của `LIKE` trong `contains`, nên service tự escape `\`, `%`, `_` (`escapeLikePattern`).
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

## Giao diện quản trị

Mã ở `apps/web/src/features/account/admin`; cổng `RequireAdmin` ở `apps/web/src/features/account/RequireAdmin.tsx`;
khung và route ở `apps/web/src/app` (Bảo duyệt). Nghiệp vụ và tiêu chí: [use-cases.md](use-cases.md). URL tiếng
Anh cho khu quản trị: [LOG#adr-027](../../LOG.md#adr-027); quyết định riêng của màn này: [ADR-028](LOG.md#adr-028).

| Đường dẫn | Trang |
|---|---|
| `/admin` | Tổng quan hiện có của Bảo (`AdminProductsPage`), nay sau guard |
| `/admin/users` | Danh sách: `q`, `status`, `role`, `verified`, `sort`, `page`, `pageSize` (10, 20, 50; mặc định 20) trên URL, bỏ giá trị mặc định |
| `/admin/users/:id` | Chi tiết, khóa hay mở khóa |
| `/quan-tri` | Chuyển hướng thay thế về `/admin`, giữ query và hash |

- **Guard chỉ là UX.** `RequireAdmin` đọc `roles` của phiên trong tab; quyền thật là `RequireRoles(ADMIN)` ở máy
  chủ. Vai bị gỡ giữa phiên thì trang vẫn mở tới yêu cầu kế tiếp, khi đó máy chủ trả 403 và giao diện hiện "Không
  đủ quyền", xóa dữ liệu quản trị đã tải.
- **Cache theo actor và phiên.** [Issue #57](https://github.com/F-R-E-Y-A/fashion-shop/issues/57), đang triển
  khai/chưa merge: query admin có gốc `session/admin/resource/actor` từ
  [session-cache.ts:4](../../../apps/web/src/core/session-cache.ts#L4); `AuthProvider` hủy/xóa gốc `session`
  khi đổi phiên. Không cần import query key của Orders vào Account. Kết quả khóa, mở khóa
  chỉ ghi khi số hiệu phiên (`getSessionEpoch`) **và** thế hệ quyền của actor còn nguyên: một lần 403 tăng thế
  hệ ngay trong luồng xử lý phản hồi, không chờ React render/effect, nên POST về sát hay sau 403 không đưa
  dữ liệu trở lại cache. Trước khi ghi, các GET chi tiết và danh sách
  đang bay bị hủy để trạng thái cũ không về sau đè lên.
- **403 dùng chung giữa các màn admin.** [admin-hooks.ts:29](../../../apps/web/src/features/account/admin/admin-hooks.ts#L29)
  dọn mọi resource admin của actor; trạng thái mất quyền sống theo epoch, không mất khi chuyển Users/Orders.
  Phiên mới của cùng actor được kiểm quyền lại. Query observer và trạng thái cục bộ của các trang admin
  được tạo lại theo actor/epoch để không giữ placeholder hoặc thông báo của lần đăng nhập trước.
- **Khóa, mở khóa không tự gửi lại.** Chờ tối đa 15 giây; hết giờ, mất mạng hay 5xx thì báo chưa rõ kết quả và cho
  kiểm lại bằng GET.
- **Hộp xác nhận** dùng `<dialog>` native (`showModal`); bài kiểm thử jsdom dùng stub, nên top layer và nền inert
  chỉ được chứng minh trên trình duyệt thật.
- **Một codec điều kiện** (`list-query.ts`) đọc và ghi URL, tạo tham số API và chữ ký của query key; giá trị sai bị
  bỏ và URL được thay bằng bản chuẩn hóa. Gõ tìm chờ 300 ms rồi thay URL (không thêm lịch sử); bộ lọc thêm lịch sử.
  Dữ liệu giữ chỗ chỉ dùng khi cùng actor, cùng điều kiện, chỉ khác trang.
- **Một luồng khóa, mở khóa** (`user-status-action.tsx`) cho cả chi tiết và dòng của danh sách. Sau khi xong, mọi
  danh sách của actor được tải lại từ API; dòng rời bộ lọc được ghi "Không còn khớp bộ lọc" tới khi tập mới về.
  Lý do: [ADR-029](LOG.md#adr-029).

## Tạo quản trị viên đầu tiên

```bash
npm run admin:grant -w apps/api -- --email=<email>
```

Script yêu cầu tài khoản đã tồn tại và `ACTIVE`; không kiểm riêng `emailVerifiedAt`. Luồng đăng ký mới
có bước xác thực email. Kết quả: `GRANTED`, `ALREADY_ADMIN` (thoát 0) hoặc
`USER_NOT_FOUND`, `USER_NOT_ACTIVE`, `INVALID_EMAIL`, `ADMIN_ROLE_MISSING` (thoát 1). Script in CSDL đích
(không có thông tin đăng nhập) và id người dùng, không in email. Staging/production: đặt `DATABASE_URL` của
môi trường đó trước lệnh. API nhận vai mới ngay request kế tiếp. Web đang giữ vai cũ thì đăng xuất rồi đăng
nhập lại để cập nhật menu và guard.

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
| UC-02.1/AC1–AC8 giao diện: guard, URL, trang, trạng thái, ma trận nút, hộp xác nhận, lỗi, phiên | `apps/web/src/features/account/admin/*.test.ts(x)` (jsdom, API giả) |
| UC-02.1/AC11 tìm, lọc, sắp xếp, escape, 400/401/403 | `apps/api/test/admin-users-filters.http.spec.ts`, `dto/list-admin-users.query.spec.ts`, `admin-users.service.spec.ts` |
| UC-02.1/AC12–AC15 URL, debounce, Back, race, placeholder, thao tác nhanh, membership, phiên | `admin/list-query.test.ts`, `admin/admin-users-tools.test.tsx` |

## Trạng thái hôm nay (24/10/2026)

Admin.1 và Admin.2 đã gộp vào `develop` (pull request #24, `aee345e`). Admin.3 (giao diện quản trị người dùng) đã gộp qua PR #47 (`47576d4`). Issue #48 (tìm, lọc, thao tác nhanh) đã gộp qua [PR #49](https://github.com/F-R-E-Y-A/fashion-shop/pull/49) (`fdf4d62`). API hồ sơ, khu vực hành chính, sổ địa chỉ và giao diện hồ sơ/địa chỉ đã có trong `develop` qua các PR ghi ở bảng Dòng việc. Dữ liệu tỉnh/xã thật (34 tỉnh, 3321 xã) đã nạp vào CSDL dev, chưa nạp staging hay production trong PH-11. Checkout local đã dùng địa chỉ lưu qua public `CheckoutAddressService.get(userId, id, tx?)` ([checkout-address.service.ts:11](../../../apps/api/src/modules/users/checkout-address.service.ts#L11)); trả snapshot của đúng chủ và xã/tỉnh hoạt động. Avatar vẫn ngoài phạm vi.

## Còn mở

- Tiền tố `/api/admin/*` lấy theo T-M5 của [test-strategy.md](../../shared/test-strategy.md) nhưng chưa có
  trong [api.md](../../shared/api.md). [TBD — hỏi Bảo]
- T-M5 ghi ẩn danh nhận 403; API trả 401 theo bảng mã lỗi của api.md (401 chưa đăng nhập, 403 thiếu quyền).
  [TBD — hỏi Duy sửa test-strategy.md]
- UC-02.1 có đặc tả đề xuất ở [use-cases.md](use-cases.md), chờ Duy thống nhất mã và số AC11–AC15; UC-02.2 chưa viết.
- Tìm email là `ILIKE '%q%'`, không dùng được chỉ mục B-tree; chưa đo và chưa thêm chỉ mục theo suy đoán. Khi số
  tài khoản lớn và đo thấy chậm thì đề xuất `pg_trgm` kèm số đo. [TBD — đo khi có dữ liệu thật]
- Tài khoản bị đặt `LOCKED` không qua API (sửa thẳng CSDL) thì không được tăng `authVersion` hay thu hồi phiên;
  mở khóa qua API khi đó không dọn các phiên cũ.
- Quản trị viên khóa được quản trị viên khác. Không ai tự khóa được mình, nhưng hai quản trị viên khóa lẫn nhau
  **cùng lúc** thì cả hai đều thành công (mỗi bên đã qua `AuthGuard` trước khi bên kia commit) và có thể không
  còn quản trị viên nào hoạt động. Gỡ bằng `admin:grant` cho một tài khoản `ACTIVE` khác. Chưa có luật "quản
  trị viên hoạt động cuối cùng". Admin.3 chỉ **ẩn** nút khóa tài khoản `ADMIN` ở giao diện; gọi thẳng API vẫn
  khóa được. Đề xuất một Issue phía máy chủ riêng; chưa có quyết định chấp nhận hay hạn xử lý. [TBD — hỏi Tài]
