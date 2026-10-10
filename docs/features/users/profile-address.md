---
title: Hồ sơ cá nhân và sổ địa chỉ
updated: 2026-10-04
status: đang làm
owner: Tài
---
# Hồ sơ cá nhân và sổ địa chỉ

**Chức năng:** Hợp đồng hồ sơ, khu vực hành chính và sổ địa chỉ: quyền, luật dữ liệu, địa chỉ mặc định, đồng thời, ranh giới với đặt hàng.

Đặc tả gốc: PH-01.5 và PH-01.6 trong [uc-ph01-tai-khoan-xac-thuc.md](../../shared/uc-ph01-tai-khoan-xac-thuc.md)
(nay là UC-01.5, UC-01.6). Chỗ nào khác đặc tả đó, lý do ở [ADR-023](LOG.md#adr-023). Hình dạng đầy đủ của từng
đường dẫn ở Swagger `/api/docs` (thẻ `users`, `administrative-areas`).

## Quyền và quyền riêng tư

| Đường dẫn | Ai gọi được | `Cache-Control` |
|---|---|---|
| `GET`, `PATCH /api/users/me` | Người đã đăng nhập (`AuthGuard`), không cần vai | `no-store` |
| `GET`, `POST /api/users/me/addresses`; `PATCH`, `DELETE /api/users/me/addresses/:id` | Người đã đăng nhập | `no-store` |
| `GET /api/administrative-areas` | Ai cũng gọi được: dữ liệu tham chiếu, không phải dữ liệu cá nhân | mặc định |

Chủ hồ sơ và chủ địa chỉ luôn là `CurrentUser`. Không đường dẫn nào nhận `userId` từ thân, query hay header;
gửi trường lạ như `userId`, `email`, `status`, `roles`, `id` thì `400` (`ValidationPipe` có
`forbidNonWhitelisted`). Phản hồi chỉ gồm các cột trong allowlist, không có `passwordHash`, `authVersion`, `status`,
`roles`, `userId`.

## Hồ sơ

`GET /api/users/me` trả `{ id, email, fullName, phone }`; tài khoản cũ có `fullName` và `phone` là `null`.
`PATCH /api/users/me` chỉ sửa `fullName` và `phone`, sửa một phần:

| Trường | Luật | Gửi `null` |
|---|---|---|
| `fullName` | Trim, 1–100 ký tự, không ký tự điều khiển | `400`: chưa hỗ trợ xoá |
| `phone` | Trim, đúng 10 chữ số, bắt đầu bằng 0 (PH-01.5). Không unique | `400` |

Vắng mặt là giữ nguyên; `{}` trả hồ sơ hiện tại. Số điện thoại không unique: không trả `409` như đặc tả cũ.

## Khu vực hành chính

Mô hình hai bậc Tỉnh → Xã, không có bậc huyện. `GET /api/administrative-areas` trả mảng các tỉnh đang hoạt
động; `?parentId=<id tỉnh>` trả mảng các xã đang hoạt động của tỉnh đó. Mỗi phần tử
`{ id, code, name, level, parentId }`, xếp theo tên rồi mã. `parentId` không tồn tại, là xã, hay là tỉnh đã
ngừng thì trả `[]`; `parentId` sai dạng UUID thì `400`. Danh sách có giới hạn tự nhiên nên trả mảng, không
phân trang, theo tiền lệ cây danh mục của `products`.

**Dữ liệu tỉnh/xã chưa có** trong cơ sở dữ liệu nào ([ND-12](../../TECH_DEBT.md)): chưa tìm được nguồn đã xác
minh, và không nạp dữ liệu tự bịa hay dữ liệu lỗi thời. Kiểm thử dùng khu vực giả ghi rõ "Kiem Thu"
(`apps/api/test/fixtures/administrative-areas.ts`), không nằm trong seed.

## Sổ địa chỉ

Tạo cần `recipientName`, `phone`, `administrativeAreaId`, `detailAddress`; tuỳ chọn `postalCode`, `isDefault`.
Sửa một phần mọi trường đó. `recipientName` và `phone` theo cùng luật với hồ sơ; `detailAddress` trim, 1–255
ký tự; `postalCode` tối đa 10 chữ, số, dấu cách hay gạch ngang, `null` khi sửa thì xoá.

`administrativeAreaId` phải là một **xã đang hoạt động thuộc một tỉnh đang hoạt động**. Id tỉnh, xã đã ngừng,
xã thuộc tỉnh đã ngừng hay id không tồn tại đều `422 INVALID_ADMINISTRATIVE_AREA`; id sai dạng thì `400`.

Phản hồi: `{ id, recipientName, phone, administrativeAreaId, administrativeArea: { id, code, name, province:
{ id, code, name } }, detailAddress, postalCode, isDefault, createdAt, updatedAt }`. Danh sách xếp địa chỉ mặc
định trước, rồi cũ trước mới.

### Quyền sở hữu

Mọi truy vấn lọc theo cả `id` lẫn `userId` của `CurrentUser`. Địa chỉ của người khác và địa chỉ không tồn tại
trả **cùng một `404`** với cùng thân lỗi, nên không dò được địa chỉ nào tồn tại. Không bao giờ `403`.

### Địa chỉ mặc định

Bất biến: **có ít nhất một địa chỉ thì có đúng một địa chỉ mặc định**; không còn địa chỉ thì không có mặc định.

| Thao tác | Kết quả |
|---|---|
| Tạo địa chỉ đầu tiên | Luôn thành mặc định, kể cả khi gửi `isDefault: false` |
| Tạo với `isDefault: true` | Bỏ mặc định cũ, địa chỉ mới thành mặc định, trong cùng giao dịch |
| Sửa `isDefault: true` | Bỏ mặc định cũ, địa chỉ này thành mặc định |
| Sửa `isDefault: false` trên địa chỉ đang mặc định | `409 DEFAULT_ADDRESS_REQUIRED`, không đổi gì: muốn đổi thì đặt địa chỉ khác làm mặc định |
| Xoá địa chỉ không mặc định | Xoá, mặc định giữ nguyên |
| Xoá địa chỉ mặc định, còn địa chỉ khác | Địa chỉ **cũ nhất** (`createdAt` tăng dần, trùng thì `id` tăng dần) thành mặc định |
| Xoá địa chỉ cuối cùng | Không còn địa chỉ, không còn mặc định |

Mọi thao tác ghi sổ địa chỉ của một người chạy trong giao dịch giữ khoá advisory theo `userId`
(`pg_advisory_xact_lock`), nên chúng xếp hàng và luôn đọc trạng thái mới nhất. Chỉ mục duy nhất
`addresses_one_default_per_user_uq` vẫn là chốt chặn cuối ở CSDL, nhưng mã không dựa vào nó để bắt lỗi. Không
dùng mutex trong bộ nhớ tiến trình.

## Ranh giới với đặt hàng

Sổ địa chỉ là **dữ liệu nguồn** cho bước đặt hàng. Đơn hàng không có khoá ngoại tới `addresses`: `orders`
giữ `shipping_address_snapshot` (JSONB bắt buộc, [data-model.md](../../shared/data-model.md)). Sửa hay xoá địa
chỉ sau khi đặt không đổi đơn cũ. Checkout sẽ cần một hàm đọc địa chỉ theo `userId` + `id` được công bố qua
`modules/users/index.ts`; hình dạng bản chụp do Duy chốt cùng phân hệ đặt hàng. Chưa công bố ở đợt này.

## Kiểm thử

| Nội dung | Bài kiểm thử |
|---|---|
| Hồ sơ: 401, dạng an toàn, `no-store`, luật trường, mass assignment, không unique, hồi quy API quản trị | `apps/api/test/users-profile.http.spec.ts` |
| Khu vực hành chính, tạo, liệt kê, sửa, xoá, mặc định, 422, IDOR 404, 400 | `apps/api/test/user-addresses.http.spec.ts` |
| Đồng thời, mỗi bài lặp 5 vòng: hai lần đặt mặc định, tạo mặc định cùng đặt mặc định, hai địa chỉ đầu tiên, xoá mặc định cùng đặt mặc định, xoá hết | `apps/api/test/user-addresses-concurrency.http.spec.ts` |
| Luật trường, khoá trước khi đọc, lọc theo `userId` | `apps/api/src/modules/users/dto/contact-fields.spec.ts`, `addresses.service.spec.ts` |

## Còn mở

- Dữ liệu tỉnh/xã: chưa có nguồn đã xác minh ([ND-12](../../TECH_DEBT.md)). Chưa có nó thì không tạo được địa
  chỉ ở môi trường dev, staging hay production.
- Số điện thoại chỉ nhận dạng `0xxxxxxxxx`; chưa nhận `+84` hay dấu cách. Giao diện nên chuẩn hoá trước khi gửi.
- Chưa có trần số địa chỉ mỗi người. `addresses.user_id` có chỉ mục thường `addresses_user_id_idx`;
  `administrative_areas.parent_id` chưa có chỉ mục: bảng tham chiếu, hiện rỗng, thêm khi nạp dữ liệu ([ND-12](../../TECH_DEBT.md)).
- Giao diện đang ở [PR #29](https://github.com/F-R-E-Y-A/fashion-shop/pull/29), chưa gộp ngày 04/10. PR #15 đã gộp; `core/http.ts:97` và `:100` đã có `apiPatch`, `apiDel`.
