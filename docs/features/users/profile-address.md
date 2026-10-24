---
title: Hồ sơ cá nhân và sổ địa chỉ
updated: 2026-10-18
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

### Dữ liệu tỉnh/xã

Nguồn: [Quyết định 19/2025/QĐ-TTg](https://chinhphu.vn/?classid=1&docid=214409&pageid=27160&typegroupid=5)
của Thủ tướng Chính phủ, ban hành 30/06/2025, hiệu lực 01/07/2025: Phụ lục I (cấp tỉnh), Phụ lục II (cấp xã).
Bản PDF ký số là ảnh quét; dữ liệu chép bằng OCR rồi soát tay từng dòng với ảnh của cả 143 trang. Đường dẫn PDF,
SHA-256 và cách chép nằm trong trường `source` của
[vietnam-administrative-areas-2025.json](../../../apps/api/prisma/data/vietnam-administrative-areas-2025.json).

| | Số lượng |
|---|---|
| Tỉnh, thành phố (`PROVINCE`, mã 2 chữ số) | 34 |
| Đơn vị cấp xã (`COMMUNE`, mã 5 chữ số): 2621 xã, 687 phường, 13 đặc khu | 3321 |
| Tổng | 3355 |

Xã, phường và đặc khu đều là `COMMUNE`, `parentId` là tỉnh; không có bậc huyện. Mã giữ nguyên chuỗi của Quyết
định, kể cả số 0 đầu (`01`, `00070`). Số xã, phường, đặc khu của từng tỉnh khớp dòng tổng của tỉnh đó trong
Phụ lục II; tệp ghi lại các số này và kiểm thử đối chiếu.

Nạp ([administrative-areas.seed.ts](../../../apps/api/prisma/seed/administrative-areas.seed.ts),
[ADR-024](LOG.md#adr-024)):

- Dev và staging: `npm run db:seed` (staging chạy seed khi `SEED_ON_START`).
- Production và mọi nơi không chạy seed: `npm run areas:import -w apps/api`, đặt `DATABASE_URL` của môi trường đó
  trước lệnh. Lệnh này chỉ nạp khu vực hành chính.

Cả hai upsert theo `code` trong một giao dịch và chạy lại an toàn. Mã chưa có thì thêm; mã đã có thì chỉ sửa
`name` khi khác, giữ `id` nên địa chỉ đang trỏ tới vẫn đúng, và không đụng `isActive`, nên xã đã bị ngừng giao
thì nạp lại cũng không mở lại. Mã đã có nhưng khác bậc hay khác tỉnh cha thì dừng, báo từng mã và không ghi gì.
Không xoá, không truncate: dòng không có trong tệp được giữ nguyên.

Kiểm thử HTTP của sổ địa chỉ vẫn dùng khu vực giả "Kiem Thu" (`apps/api/test/fixtures/administrative-areas.ts`)
vì cần cả khu vực đã ngừng; `resetDatabase` không nạp dữ liệu thật.

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

## Giao diện web hiện tại

- `/tai-khoan` chuyển tới `/tai-khoan/ho-so`; `/tai-khoan/ho-so` hiển thị hồ sơ và
  `/tai-khoan/dia-chi` hiển thị sổ địa chỉ ([routes.tsx:54](../../../apps/web/src/app/routes.tsx#L54)).
- `RequireAuth` đợi khôi phục phiên, rồi chuyển khách chưa đăng nhập tới `/login` và lưu đường dẫn cùng query
  trong `state.from` ([RequireAuth.tsx:9](../../../apps/web/src/features/account/RequireAuth.tsx#L9)). Đăng nhập
  thành công quay về đường dẫn nội bộ đó; thiếu `state.from` hoặc giá trị không hợp lệ như `//evil.example` thì
  về `/` ([LoginPage.tsx:24](../../../apps/web/src/features/account/pages/LoginPage.tsx#L24)).
- Trang hồ sơ đọc `GET /api/users/me`, cho xem email chỉ đọc và sửa họ tên, số điện thoại. Khi lưu, chỉ gửi
  những trường thực sự thay đổi qua `PATCH /api/users/me`
  ([ProfilePage.tsx:15](../../../apps/web/src/features/account/pages/ProfilePage.tsx#L15),
  [ProfilePage.tsx:67](../../../apps/web/src/features/account/pages/ProfilePage.tsx#L67)). **Avatar chưa được
  triển khai** trên giao diện này.
- Trang địa chỉ đọc danh sách, tạo, sửa, xoá sau xác nhận và đặt một địa chỉ làm mặc định. Sau thao tác xoá hoặc
  đặt mặc định, danh sách được làm mới cả khi yêu cầu thành công lẫn thất bại; xoá địa chỉ đang sửa sẽ đóng form
  ([AddressPage.tsx:29](../../../apps/web/src/features/account/pages/AddressPage.tsx#L29),
  [AddressPage.tsx:55](../../../apps/web/src/features/account/pages/AddressPage.tsx#L55)).
- Form gọi `GET /api/administrative-areas` để lấy tỉnh và `GET /api/administrative-areas?parentId=<id tỉnh>`
  để lấy xã; đổi tỉnh sẽ bỏ lựa chọn xã cũ. Khi API trả danh sách tỉnh rỗng, giao diện báo rõ và không cho tạo
  địa chỉ; địa chỉ đã lưu vẫn có thể sửa các trường khác mà không gửi lại `administrativeAreaId`
  ([AddressForm.tsx:32](../../../apps/web/src/features/account/components/AddressForm.tsx#L32),
  [AddressForm.tsx:104](../../../apps/web/src/features/account/components/AddressForm.tsx#L104),
  [AddressPage.tsx:38](../../../apps/web/src/features/account/pages/AddressPage.tsx#L38)).
- Khi xoá phiên đăng nhập, React Query bỏ riêng cache `profile` và `addresses`; dữ liệu khu vực hành chính là
  tham chiếu công khai nên vẫn được giữ
  ([AuthProvider.tsx:70](../../../apps/web/src/features/account/AuthProvider.tsx#L70)).

## Ranh giới với đặt hàng

Sổ địa chỉ là **dữ liệu nguồn** cho bước đặt hàng. Đơn hàng không có khoá ngoại tới `addresses`: `orders`
giữ `shipping_address_snapshot` (JSONB bắt buộc, [data-model.md](../../shared/data-model.md)). Sửa hay xoá địa
chỉ sau khi đặt không đổi đơn cũ. PH-11 đã công bố `CheckoutAddressService.get(userId, id, transaction?)` qua `modules/users/index.ts`, kiểm đúng chủ và xã/tỉnh hoạt động, trả snapshot địa chỉ ([checkout-address.service.ts:11](../../../apps/api/src/modules/users/checkout-address.service.ts#L11)). Hợp đồng ở [README module](../../../apps/api/src/modules/users/README.md), luồng ở [Checkout](../checkout/README.md).

## Kiểm thử

| Nội dung | Bài kiểm thử |
|---|---|
| Hồ sơ: 401, dạng an toàn, `no-store`, luật trường, mass assignment, không unique, hồi quy API quản trị | `apps/api/test/users-profile.http.spec.ts` |
| Khu vực hành chính, tạo, liệt kê, sửa, xoá, mặc định, 422, IDOR 404, 400 | `apps/api/test/user-addresses.http.spec.ts` |
| Đồng thời, mỗi bài lặp 5 vòng: hai lần đặt mặc định, tạo mặc định cùng đặt mặc định, hai địa chỉ đầu tiên, xoá mặc định cùng đặt mặc định, xoá hết | `apps/api/test/user-addresses-concurrency.http.spec.ts` |
| Luật trường, khoá trước khi đọc, lọc theo `userId` | `apps/api/src/modules/users/dto/contact-fields.spec.ts`, `addresses.service.spec.ts` |
| Tệp tỉnh/xã: số lượng, mã, tỉnh cha, số theo loại, mẫu đối chiếu PDF; nạp lần đầu, nạp lại không đổi gì, giữ địa chỉ và dòng ngoài tệp, dừng khi xung đột, API trả dữ liệu thật | `apps/api/test/administrative-areas-dataset.http.spec.ts` |

## Còn mở

- Production chưa chạy `areas:import`; staging có dữ liệu ở lần seed kế tiếp.
- `GET /api/administrative-areas` xếp theo collation của CSDL, đang so theo byte: "Thành phố Huế" đứng trước
  "Thành phố Hà Nội", "Phường An Hội Tây" trước "Phường An Hội Đông" (gọi API dev, 04/10/2026). Danh sách
  vẫn đủ và đúng, chỉ thứ tự chưa theo tiếng Việt.
- Số điện thoại chỉ nhận dạng `0xxxxxxxxx`; chưa nhận `+84` hay dấu cách. Giao diện nên chuẩn hoá trước khi gửi.
- Chưa có trần số địa chỉ mỗi người. `addresses.user_id` có chỉ mục thường `addresses_user_id_idx`;
  `administrative_areas.parent_id` chưa có chỉ mục; bảng có 3355 dòng, thêm bằng migration riêng khi cần.
- Checkout đã tích hợp local trong PH-11; nghiệm thu cổng thật chờ VNPAY key. Ranh giới snapshot ở mục trên.
