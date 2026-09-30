---
title: Quản trị tài khoản — nhật ký quyết định và thay đổi
updated: 2026-09-30
status: đang dùng
owner: Tài
---
# Quản trị tài khoản — nhật ký (chỉ thêm vào cuối)

**Chức năng:** Quyết định và thay đổi đáng nhớ của feature quản trị tài khoản, mới nhất ở cuối.

Khuôn một mục: [LOG-entry.md](../../shared/templates/LOG-entry.md). Phân quyền theo vai là hạ tầng của module
`auth`, nên quyết định của nó nằm ở [auth/LOG#adr-021](../auth/LOG.md#adr-021).

---

## 2026-09-30 · Admin.1: hai API chỉ đọc cho quản trị viên

**Loại:** thay đổi mã · **Phạm vi:** `apps/api/src/modules/users`, migration `20260930120000_ph3_role_catalog` · **Commit:** (chưa commit)

Thêm `GET /api/admin/users` và `GET /api/admin/users/:id`, chặn bằng `@RequireRoles(RoleCode.ADMIN)` ở cấp
class nên mọi đường dẫn thêm sau vào controller này tự động cần `ADMIN`. Service đọc qua một allowlist cột
(`adminUserSelect`) thay vì đọc cả bản ghi rồi lọc, để thêm cột nhạy cảm vào bảng `users` không tự lọt ra
API. Tham số `:id` khai bằng lớp DTO `IsUUID` (bài học ND-10), nên id sai dạng không bao giờ tới Prisma.

Lộ ra khi làm: seed không thể nạp lại danh mục vai từ `RoleCode`, vì image API không chứa `src/modules`;
dẫn tới quyết định nạp vai bằng migration ở ADR-021.

| Chỉ số (đo bằng lệnh nào) | Trước | Sau |
|---|---|---|
| Bài đơn vị API (`npm run test -w apps/api`) | 86 | 106 |
| Bài HTTP API (`npm run test:http -w apps/api`) | 168 | 185 |
| Vai trong bảng `roles` sau `migrate deploy` trên CSDL mới | 0 | 2 (`ADMIN`, `CUSTOMER`) |

Nợ sinh ra: không. Tài liệu đã sửa theo: `docs/features/auth/README.md`, `docs/TECH_DEBT.md` (ND-03),
`docs/shared/data-model.md`.

## 2026-09-30 · Admin.2: khóa và mở khóa tài khoản, thu hồi phiên, nhật ký thao tác

**Loại:** thay đổi mã · **Phạm vi:** `apps/api/src/modules/users`, `apps/api/src/modules/auth` (`login`, `refresh`) · **Commit:** (chưa commit)

Thêm `POST /api/admin/users/:id/lock` và `/unlock`. Khóa chỉ nhận `ACTIVE`, mở khóa chỉ nhận `LOCKED`, bằng
`updateMany` có điều kiện trạng thái trong một giao dịch cùng tăng `authVersion`, thu hồi refresh token và ghi
`audit_logs`; kết quả nghiệp vụ trả về rồi mới map sang 404/409 sau khi commit, theo kỷ luật của `AuthService`.
Mở khóa không giảm `authVersion` và không phục hồi token, nên phiên cũ không sống lại. Không migration.

Lộ ra khi làm: đăng nhập tạo refresh token sau khi tính bcrypt (vài trăm ms) và ngoài giao dịch, còn refresh
chèn token mới mà lệnh thu hồi đang chờ dòng token cũ không thấy. Cả hai để lại một refresh token sống lại sau
khi mở khóa. Đã tái hiện bằng kiểm thử (bỏ bản sửa thì `activeRefreshTokens` là 1 thay vì 0, 3/3 lần với
refresh) và sửa bằng khoá dòng `users` khi tạo hay xoay phiên ([ADR-022](../auth/LOG.md#adr-022)).

| Chỉ số (đo bằng lệnh nào) | Trước | Sau |
|---|---|---|
| Bài đơn vị API (`npm run test -w apps/api`) | 106 | 111 |
| Bài HTTP API (`npm run test:http -w apps/api`) | 185 | 200 |
| Chạy lại `test/admin-users-lock.http.spec.ts` 5 lượt (mỗi bài đồng thời lặp 5 vòng) | – | 5/5 xanh |

Nợ sinh ra: không. Tài liệu đã sửa theo: `docs/features/users/README.md`, `docs/features/auth/README.md`,
`docs/features/auth/LOG.md` (ADR-022), `docs/TECH_DEBT.md` (ND-03).
