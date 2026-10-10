---
title: Tài khoản người dùng — nhật ký quyết định và thay đổi
updated: 2026-10-03
status: đang dùng
owner: Tài
---
# Tài khoản người dùng — nhật ký (chỉ thêm vào cuối)

**Chức năng:** Quyết định và thay đổi đáng nhớ của feature tài khoản người dùng, mới nhất ở cuối.

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

<a id="adr-023"></a>

## 2026-09-30 · ADR-023 — Hồ sơ nằm trong `users`; sổ địa chỉ giữ bất biến "đúng một mặc định" bằng khoá advisory theo người dùng; địa chỉ người khác trả 404

**Loại:** quyết định · **Phạm vi:** `apps/api/src/modules/users` (hồ sơ, khu vực hành chính, sổ địa chỉ), cột `users.full_name`, `users.phone` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

- Đặc tả PH-01.5 và PH-01.6 ([uc-ph01](../../shared/uc-ph01-tai-khoan-xac-thuc.md)) viết theo mã và tên bảng
  cũ: `USERS.phone` UK và `409 phone_already_exists`, địa chỉ ba cấp, `403` khi xoá địa chỉ người khác, `PUT`.
- Lược đồ thật: `users` chưa có họ tên và số điện thoại; `addresses` đủ trường và có chỉ mục duy nhất một mặc
  định mỗi user (`addresses_one_default_per_user_uq`); `administrative_areas` hai bậc Tỉnh → Xã, có `is_active`.
- Hai bảng khu vực và địa chỉ đều rỗng ở CSDL dev (`select count(*)`, 30/09/2026); không có nguồn dữ liệu
  tỉnh/xã nào trong kho mã, kho docs hay ERD.

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Bảng `user_profiles` riêng | Tách danh tính và hồ sơ | Thêm bảng cho hai cột; ERD đã duyệt không có | Có |
| **B. Hai cột nullable `full_name`, `phone` trong `users` (chọn)** | Đơn giản, theo tiền lệ `avatar_url` | `users` rộng thêm | Có |
| `phone` unique như đặc tả cũ | Ngăn trùng | Người cùng nhà dùng chung số; `409` cho biết số nào đã có tài khoản | Có |

| Bất biến mặc định | Được gì | Mất gì |
|---|---|---|
| Chỉ dựa vào chỉ mục duy nhất, bắt lỗi | Không cần khoá | Hai yêu cầu song song trả 500; hai địa chỉ đầu tiên cùng lúc vỡ ngay |
| Khoá dòng `users` (`FOR UPDATE`) | Có sẵn dòng để khoá | Đăng nhập và refresh cũng khoá dòng này (ADR-022): phải chờ nhau |
| **Khoá advisory theo `userId` trong giao dịch (chọn)** | Mọi thao tác ghi sổ của một người xếp hàng; không đụng đăng nhập; đúng khi nhiều bản sao API | Thêm một câu SQL thô mỗi thao tác ghi |

**Chọn B, `phone` không unique, và khoá advisory.** Các luật đi kèm:

- `phone` theo PH-01.5: 10 chữ số, bắt đầu bằng 0, sau khi trim. Không tự chuẩn hoá `+84`.
- `PATCH` sửa một phần: vắng mặt là giữ nguyên. `null` bị từ chối cho mọi trường, trừ `postalCode` của địa
  chỉ (xoá mã bưu chính). Chưa hỗ trợ xoá họ tên hay số điện thoại: chưa có yêu cầu.
- Địa chỉ của người khác trả **404** giống hệt địa chỉ không tồn tại, không `403`: `403` xác nhận địa chỉ đó
  có thật.
- Địa chỉ đầu tiên luôn là mặc định. Bỏ mặc định mà không có thay thế thì `409 DEFAULT_ADDRESS_REQUIRED`. Xoá
  mặc định thì địa chỉ cũ nhất (`createdAt`, rồi `id`) lên thay.
- Khu vực phải là xã đang hoạt động thuộc tỉnh đang hoạt động, sai thì `422 INVALID_ADMINISTRATIVE_AREA`.
- Danh sách tỉnh/xã và danh sách địa chỉ trả mảng, không phân trang (giới hạn tự nhiên; tiền lệ cây danh mục).
- Không nạp dữ liệu tỉnh/xã khi chưa có nguồn đã xác minh ([ND-12](../../TECH_DEBT.md)).

### Kết quả mong đợi → thực tế

Mong đợi: năm kịch bản đồng thời không bao giờ 500 và luôn giữ đúng một mặc định; địa chỉ người khác luôn 404.
Thực tế (30/09/2026, chưa commit): `test/user-addresses-concurrency.http.spec.ts` chạy 5 lượt liên tiếp đều xanh
(mỗi bài lặp 5 vòng). Kiểm chứng ngược: bỏ khoá advisory thì cả 5 bài đỏ, 3/3 lượt, do
`Unique constraint failed on the constraint: addresses_one_default_per_user_uq` thành 500.

### Điều kiện xem lại

Khi có nguồn dữ liệu tỉnh/xã đã xác minh (nạp bằng migration dữ liệu), khi cần nhận số quốc tế, hoặc khi đặc tả
UC-01.5, UC-01.6 được viết lại và khác các luật trên.

## 2026-09-30 · PH4: hồ sơ cá nhân, khu vực hành chính, sổ địa chỉ phía máy chủ

**Loại:** thay đổi mã · **Phạm vi:** `apps/api/src/modules/users`, migration `20260930233000_ph4_user_profile_address` · **Commit:** (chưa commit)

Thêm `GET`/`PATCH /api/users/me`, `GET /api/administrative-areas`, và `GET`/`POST /api/users/me/addresses`,
`PATCH`/`DELETE /api/users/me/addresses/:id` vào module `users` sẵn có, không tạo module mới. Hồ sơ và địa chỉ
dùng `AuthGuard` và `CurrentUser`, không cần vai, và dùng lại `NoStoreInterceptor` của API quản trị. Hợp đồng:
[profile-address.md](profile-address.md).

Một migration cho cả pull request ([CONTRIBUTING.md](../../CONTRIBUTING.md)): `20260930233000_ph4_user_profile_address`
thêm hai cột nullable `users.full_name`, `users.phone` và chỉ mục `addresses_user_id_idx`. SQL sinh bằng `prisma
migrate diff` từ CSDL đã áp mọi migration trước PH4. Chỉ mục cần vì `addresses` chỉ có chỉ mục duy nhất một phần
(`WHERE is_default = true`), không phục vụ được truy vấn lấy mọi địa chỉ của một người (`pg_indexes`, 30/09/2026).
`administrative_areas.parent_id` chưa có chỉ mục: bảng tham chiếu đang rỗng, chưa đo được gì; thêm cùng migration
nạp dữ liệu ([ND-12](../../TECH_DEBT.md)).

Kiểm chứng: CSDL sạch từ con số 0 áp đủ 6 migration, `migrate status` "up to date", `db:drift` không lệch; CSDL
kiểm thử dựng lại bằng `npm run db:test:prepare`. Lúc làm, migration này từng tách làm hai thư mục và đã áp lên
CSDL dev của Tài; CSDL dev đó cần xử lý riêng (không ảnh hưởng người khác vì hai thư mục cũ chưa bao giờ được đẩy).

| Chỉ số (đo bằng lệnh nào) | Trước | Sau |
|---|---|---|
| Bài đơn vị API (`npm run test -w apps/api`) | 111 | 118 |
| Bài HTTP API (`npm run test:http -w apps/api`) | 200 | 231 |
| Chạy lại `test/user-addresses-concurrency.http.spec.ts` 5 lượt (mỗi bài lặp 5 vòng) | – | 5/5 xanh |

Nợ sinh ra: [ND-12](../../TECH_DEBT.md) (dữ liệu tỉnh/xã). Tài liệu đã sửa theo: `profile-address.md`,
`README.md`, `docs/shared/data-model.md`, `docs/features/auth/README.md`, `docs/TECH_DEBT.md`.

## 2026-10-03 · PH4: giao diện hồ sơ và sổ địa chỉ

**Loại:** thay đổi mã · **Phạm vi:** `apps/web/src/features/account`, `apps/web/src/app` · **Commit:** (chưa commit)

Thêm các trang `/tai-khoan/ho-so` và `/tai-khoan/dia-chi` dưới `RequireAuth`; đăng nhập quay về trang nội bộ
đã yêu cầu. Giao diện hồ sơ chỉ gửi các trường đã đổi; sổ địa chỉ dùng API khu vực hành chính để chọn tỉnh và xã,
cho tạo, sửa, xoá và đặt mặc định. Danh sách khu vực rỗng được báo rõ; địa chỉ cũ vẫn sửa được thông tin khác.
Khi phiên bị xoá, cache riêng của hồ sơ và địa chỉ được dọn. Hợp đồng giao diện hiện tại:
[profile-address.md](profile-address.md#giao-diện-web-hiện-tại).

Chưa có dữ liệu tỉnh/xã thật ([ND-12](../../TECH_DEBT.md)). Avatar và tích hợp địa chỉ với checkout chưa nằm
trong đợt giao diện này.

Kiểm chứng trên nhánh chưa commit: `npm run typecheck -w apps/web` và `npm run test -w apps/web` đều đạt
(71/71 bài web); `npm run check` đạt; `node tools/docs/lint.mjs docs/features/users` đạt 3/3 tệp;
`git diff --check` đạt.

<a id="adr-024"></a>

## 2026-10-04 · ADR-024 — Danh mục tỉnh/xã lấy từ Quyết định 19/2025/QĐ-TTg, lưu thành tệp JSON có nguồn và nạp bằng seed hoặc `areas:import`, không bằng migration

**Loại:** quyết định · **Phạm vi:** `apps/api/prisma/data`, `apps/api/prisma/seed/administrative-areas.seed.ts`, bảng `administrative_areas` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

- Bảng `administrative_areas` rỗng ở dev (`select count(*)`, 04/10/2026), [ND-12](../../TECH_DEBT.md) ghi "nạp
  bằng migration dữ liệu". Lược đồ hai bậc đã đủ: `code` unique, `level`, `parent_id` tự tham chiếu
  ([identity.prisma:148](../../../apps/api/prisma/schema/identity.prisma#L148)); không cần đổi lược đồ.
- Nguồn chính thức duy nhất tìm được là PDF ký số của Quyết định 19/2025/QĐ-TTg trên chinhphu.vn: 143 trang ảnh
  quét, không có lớp chữ. Không có bản máy đọc được từ cơ quan ban hành để đối chiếu.
- Production không chạy seed; staging chạy seed khi `SEED_ON_START`; image API chỉ có `apps/api/prisma` và
  `src/generated` ([Dockerfile:44](../../../apps/api/Dockerfile#L44)).

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Migration dữ liệu (3355 câu `INSERT`) | Mọi môi trường có dữ liệu khi `migrate deploy` | Sửa một tên sai phải thêm migration mới; migration đã áp không chạy lại; `resetDatabase` của kiểm thử xoá bảng rồi không nạp lại | Khó |
| **B. Tệp JSON có `source` + seed upsert theo mã + lệnh `areas:import` (chọn)** | Sửa tên chỉ cần sửa tệp rồi chạy lại; kiểm thử tự quyết khi nào cần dữ liệu thật; dừng khi xung đột thay vì ghi đè | Production phải chạy một lệnh tay | Có: dòng chỉ thêm hoặc đổi tên, không xoá |
| Tải dữ liệu từ kho GitHub hay trang web lúc chạy | Không phải chép | Không phải nguồn chính thức; phụ thuộc mạng lúc chạy | Có |

**Chọn B** vì tên đơn vị chép từ ảnh quét có thể còn lỗi cần sửa sau, và upsert theo mã sửa được mà không đổi `id`
mà `addresses` đang trỏ tới. Trade-off chấp nhận: production cần chạy `npm run areas:import -w apps/api` một lần
(và sau mỗi lần sửa tệp).

Cách chép: OCR hai lượt bằng Apple Vision, ghép theo mã, rồi soát tay từng dòng với ảnh gốc của cả 143 trang;
124 tên được sửa sau khi soát ảnh (phần lớn là dấu), hai dòng OCR bỏ sót được thêm tay (03892, 23497). Chữ "Ia" đầu tên xã ở Gia Lai,
Đắk Lắk in giống "la" nên ghi là "Ia" (28 dòng). Không dùng dữ liệu tỉnh/xã trước 01/07/2025.

### Kết quả mong đợi → thực tế

Mong đợi: tệp có 34 tỉnh, 3321 xã, mã không trùng, mọi xã có tỉnh cha, số xã/phường/đặc khu từng tỉnh khớp dòng
tổng trong Phụ lục II; nạp lại lần hai không đổi dòng nào.
Thực tế: 04/10/2026 · `test/administrative-areas-dataset.http.spec.ts` 7/7; dev: lần đầu thêm 3355, lần hai giữ
nguyên 3355; tổng theo loại 2621 xã, 687 phường, 13 đặc khu · khớp.

### Điều kiện xem lại

Có văn bản sửa đổi Quyết định 19/2025/QĐ-TTg hoặc nghị quyết sắp xếp mới; cơ quan nhà nước công bố bản máy đọc
được để đối chiếu; cần ngừng một mã (xử lý bằng `is_active`, không xoá).

## 2026-10-04 · Nạp danh mục 34 tỉnh, 3321 xã

**Loại:** dữ liệu · **Phạm vi:** `apps/api/prisma`, `apps/api/scripts`, `apps/api/test` · **Commit:** (chưa commit)

Thêm tệp `prisma/data/vietnam-administrative-areas-2025.json`, hàm `seedAdministrativeAreas` (gọi trong
`db:seed`) và lệnh `npm run areas:import -w apps/api` theo [ADR-024](#adr-024). Không đổi lược đồ hay migration.
CSDL kiểm thử thiếu hai migration của develop (`ph2_cart`, `ph01_search_audience`), đã áp bằng
`npm run db:test:prepare`; CSDL dev chỉ được ghi bảng `administrative_areas` bằng `areas:import`.

| Chỉ số (đo bằng lệnh nào) | Trước | Sau |
|---|---|---|
| Dòng `administrative_areas` ở dev (`select level, count(*) … group by level`) | 0 | 34 tỉnh, 3321 xã |
| Bài HTTP API (`npm run test:http -w apps/api`) | 281 | 288 |
| Bài đơn vị API (`npm run test -w apps/api`) | 259 | 259 |

Bằng chứng: `GET /api/administrative-areas` trên API dev trả 34 tỉnh; gọi `?parentId=` cho cả 34 tỉnh được tổng
3321 xã; Hà Nội 126, TP Hồ Chí Minh 168, Đà Nẵng 94, Đồng Tháp 102, An Giang 102. Nợ: [ND-12](../../TECH_DEBT.md)
chuyển sang đã xử lý trên nhánh. Tài liệu đã sửa theo: `profile-address.md`, `README.md`,
`docs/shared/data-model.md`, `docs/TECH_DEBT.md`.
