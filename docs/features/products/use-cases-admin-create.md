---
title: UC-04.2 — tạo sản phẩm từ quản trị viên
updated: 2026-11-20
status: đề xuất, đang triển khai Đợt 4
owner: Tài
---
# UC-04.2 · Quản lý thông tin sản phẩm — tạo sản phẩm từ quản trị (Đợt 4)

**Chức năng:** Đặc tả AC53–AC62 của lát tạo mới sản phẩm kèm biến thể/ảnh ban đầu từ quản trị, idempotency theo `createPayloadHash`, điều kiện công bố sản phẩm tạo tay và cô lập khỏi import/kho giả.

Tiếp nối lát đọc [AC1–10](use-cases.md), trạng thái bán [AC11–18](use-cases-admin-status.md), sửa nội dung [AC19–28](use-cases-admin-content.md), biến thể/giá [AC29–40](use-cases-admin-variants.md) và ảnh [AC41–52](use-cases-admin-media.md).

## Luồng và luật nghiệp vụ

Tại `/admin/products/new`, ADMIN chọn danh mục lá, thương hiệu (tùy chọn), nhập thông tin cơ bản, khai báo ≥1 biến thể (màu, cỡ, SKU, giá niêm yết/giá bán) và tùy chọn tải lên 0–8 ảnh qua phiếu tải `product` (hạn 1 giờ).

1. **Quyền và tùy chọn tạo mới:** `GET /api/admin/products/create-options` và `POST /api/admin/products` kiểm vai `ADMIN`, gắn `Cache-Control: no-store`. Danh mục lá kiểm ngay lúc lưu (`CATEGORY_NOT_LEAF` nếu danh mục đang chọn có con) dưới khóa `pg_advisory_xact_lock` dùng chung với tạo danh mục.
2. **Idempotency & cạnh tranh cùng UUID:** Client gửi `id` UUID v4 tự sinh kèm danh sách `variants[].id` và `images[].id`. Server lấy `pg_advisory_xact_lock('product-create:' + id)` và đối chiếu `createPayloadHash` (SHA-256 chuẩn hóa payload tạo) **trước** khi gọi `UploadsService.resolveMedia`: khớp hash → replay `GET /api/admin/products/:id` kể cả khi sản phẩm đã được chỉnh sửa sau tạo; khác hash → `409 IDEMPOTENCY_PAYLOAD_MISMATCH`.
3. **Mặc định ẩn và công bố (`isCustom = true`):** Sản phẩm tạo tay lưu với `isCustom = true`, `adminDisabled = true`, `isActive = false`, tự đánh dấu quản lý nội dung/ảnh/biến thể và tính `priceFrom` từ biến thể đang hoạt động. Khi gỡ ngừng bán thủ công cho sản phẩm `isCustom = true`, server khóa `Category` (theo thứ tự UUID chống deadlock) rồi `Product` và yêu cầu thêm ≥1 ảnh (`422 NO_IMAGES_FOR_ACTIVE_PRODUCT`) cùng danh mục lá & danh mục cha đang bật (`422 CATEGORY_HIDDEN_FOR_ACTIVE_PRODUCT`); sản phẩm import (`isCustom = false`) giữ nguyên hành vi `AC14`.
4. **Hợp đồng Import & Inventory:** `ProductsService.importOne` từ chối ghi đè sản phẩm `isCustom = true` nếu trùng SKU. Không ghi bảng `inventory` khi tạo sản phẩm mới (`InventoryService` tiếp tục trả `UNKNOWN` cho tới khi nhập kho).

## Tiêu chí chấp nhận

- [ ] **AC53** (âm/thuận) `GET /api/admin/products/create-options` và `POST /api/admin/products` kiểm `ADMIN` trước validation; guest `401`, CUSTOMER `403`, `Cache-Control: no-store`; trả `brands`, `colors`, `sizes` đúng thứ tự.
- [ ] **AC54** (thuận) Tạo sản phẩm thành công với `isActive = false`, `adminDisabled = true`, `isCustom = true`, lưu `createPayloadHash`, `ProductVariant[]`, `ProductImage[]`, tính đúng `priceFrom`; storefront công khai chưa lộ sản phẩm mới.
- [ ] **AC55** (biên) Idempotency & cạnh tranh cùng UUID: gửi lại cùng `id` + payload ban đầu sau timeout (ngay cả khi sản phẩm đã sửa hoặc ticket đã gắn) replay `200/201` không gọi lại `resolveMedia`; cùng `id` khác payload trả `409 IDEMPOTENCY_PAYLOAD_MISMATCH`; hai request cùng UUID chạy đồng thời được tuần tự hóa, không sinh hai bản ghi và không tiêu thụ ticket hai lần.
- [ ] **AC56** (âm/biên) Danh mục không tồn tại `404`; danh mục cha (có con) `422 CATEGORY_NOT_LEAF`; khóa cạnh tranh với luồng thêm danh mục con bảo toàn bất biến sản phẩm chỉ gắn danh mục lá.
- [ ] **AC57** (âm) Trùng `slug` trả `409 SLUG_EXISTS`, trùng SKU toàn cục trả `409 SKU_EXISTS`. Trùng `(colorId, sizeId)`, giá không hợp lệ hoặc vượt 8 ảnh trả `400`. Phiếu ảnh sai chủ, sai mục đích hoặc quá hạn 1 giờ trả `422 INVALID_MEDIA`. Yêu cầu bị từ chối không tạo sản phẩm hoặc tiêu thụ phiếu ảnh.
- [ ] **AC58** (thuận/âm) Công bố sản phẩm tạo tay (`isCustom = true`) qua `PATCH /status`: chặn thiếu biến thể active (`422`), thiếu ảnh (`422 NO_IMAGES_FOR_ACTIVE_PRODUCT`), danh mục lá hoặc danh mục cha đang ẩn (`422 CATEGORY_HIDDEN_FOR_ACTIVE_PRODUCT`, có khóa chống race ẩn danh mục); giữ nguyên hành vi cũ của sản phẩm import (`isCustom = false`).
- [ ] **AC59** (thuận/biên) `importProducts` từ chối ghi đè sản phẩm `isCustom = true` trùng SKU; tạo sản phẩm mới không tạo bản ghi `inventory`, trạng thái tồn vẫn là `UNKNOWN`.
- [ ] **AC60** (thuận/biên) Giao diện `/admin/products/new`: AdminKit, CSS Modules, tiếng Việt có dấu, 360px/1280px, validation tại form, danh mục cha bị khóa chọn, khi kho ảnh tắt (`enabled: false`) vẫn tạo được sản phẩm không ảnh ở trạng thái ẩn.
- [ ] **AC61** (biên) Phiên và `uncertainCreate` trên Web: giữ marker qua điều hướng cùng phiên, đối chiếu `GET /api/admin/products/:id` theo **cả UUID và `createPayloadHash`** (chỉ báo thành công khi khớp hash; khi `200` cùng UUID nhưng khác hash phải báo xung đột UUID và cho tạo bằng UUID mới), `404` giữ nguyên UUID để gửi lại idempotent, chặn response muộn sau `403`/đổi tài khoản.
- [ ] **AC62** (thuận/biên, tay) Playwright E2E tại `1280px` và `360px` đi từ `/admin/products` → `/admin/products/new`, xác nhận sản phẩm chưa xuất hiện ngoài storefront khi đang ẩn, công bố với ảnh từ kho giả lập rồi đối chiếu tên, giá và ảnh ngoài storefront. Chụp ảnh qua `testInfo.outputPath()`/`attach()` và chạy `npm run check`, build, `docs:lint`, kiểm tra migration và HTTP trên DB/Redis test riêng.
