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
