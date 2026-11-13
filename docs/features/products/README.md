---
title: Khám phá sản phẩm — bản đồ và kế hoạch PH-01
updated: 2026-11-10
status: đang làm
owner: Bảo
---
# Khám phá sản phẩm

**Chức năng:** Cửa vào của feature sản phẩm: PH-01 tuần này làm gì, dữ liệu, API, giao diện, hợp đồng với hai bạn, kế hoạch từng buổi, trạng thái hôm nay.

| | |
|---|---|
| **Người sở hữu** | Bảo · `apps/api/src/modules/products` · `apps/web/src/features/products` · bảng trong `prisma/schema/catalog.prisma` |
| **Dòng việc** | PH-01 nền: PR #17 đã gộp, Issue #6 đóng. Đợt 2 tìm kiếm/lọc/trang chủ: [PR #28](https://github.com/F-R-E-Y-A/fashion-shop/pull/28) đã gộp 03/10, [Issue #23](https://github.com/F-R-E-Y-A/fashion-shop/issues/23) đóng. Sửa header: [PR #31](https://github.com/F-R-E-Y-A/fashion-shop/pull/31) còn mở 04/10 |
| **Use case** | UC-03.1 duyệt danh mục, UC-03.2 tìm kiếm, UC-03.3 lọc và sắp xếp, UC-03.4 xem chi tiết, trong [use-cases.md](use-cases.md) |
| **Dữ liệu** | [erd.md](erd.md): sơ đồ và từ điển bảy bảng |
| **Quyết định** | [ADR-007](LOG.md#adr-007) mô hình dữ liệu **đã chốt** (M2, cài ở PR #11) · [ADR-008](LOG.md#adr-008) hình dạng API · [ADR-009](../../LOG.md#adr-009) CSS Modules — hai ADR sau đang **đề xuất** · [ADR-019](LOG.md#adr-019) tìm kiếm hiểu tiếng Việt · [ADR-020](LOG.md#adr-020) token giao diện bản 1 — cả hai **đề xuất** |

## Giải quyết việc gì

PH-11 bổ sung cập nhật giá/tồn bằng SSE và mở thêm vào giỏ từ trang chi tiết. Catalog gọi cửa Inventory để hiển thị tồn khả dụng; không giữ hàng trước payment. Hợp đồng biến thể có transaction tuỳ chọn tại [README module](../../../apps/api/src/modules/products/README.md); quyết định ở [ADR-031](../../LOG.md#adr-031). Nợ lọc cỡ theo tồn [ND-14](../../TECH_DEBT.md) vẫn mở.

Khách vào trang chủ, bấm một danh mục, mở một sản phẩm, chọn được cỡ và màu, thấy giá đổi theo lựa chọn. Xong PH-01 thì Duy có biến thể để bỏ vào giỏ, Tài có hàm để nạp hơn 300 sản phẩm thật.

## Việc cần chốt và phối hợp

1. **Trạng thái quyết định**: ADR-007 đã chốt; ADR-008, ADR-019 và ADR-020 giữ đúng dòng `Trạng thái` trong [LOG](LOG.md). Việc mã đã gộp không thay cho Bảo chốt ADR.
2. **Nền đã đồng bộ**: PR #11 (schema M2) và PR #13 (crawler/staging) đã vào `develop`; nhánh PH-01 nhận cả hai ở merge commit `38eaac2`. PR #13 chưa đưa dữ liệu thật vào Catalog.
3. **Hợp đồng với Duy**: `getVariantForCart(s)` đã cài, chữ ký ở [README module](../../../apps/api/src/modules/products/README.md). Giỏ hàng đã tích hợp qua PR #15; không còn chờ giỏ để ghép PH-01. Tồn kho vẫn là phần riêng, xem [ND-14](../../TECH_DEBT.md).

## Phạm vi S2

Bảng dưới giữ kế hoạch của S2; trạng thái tích hợp hiện tại ở mục **Trạng thái hôm nay**. Dữ liệu demo đã chuyển sang test fixtures, seed hiện không tạo sản phẩm.

| Hạng mục | Use case, tiêu chí | Mức |
|---|---|---|
| Bảy bảng theo [erd.md](erd.md); migration có ràng buộc `CHECK` viết tay; `db:drift` sạch | ADR-007 | **Xong** ở PR #11 (`f39ae11`) |
| Dữ liệu giả: hai cấp danh mục, 20 sản phẩm, vài sản phẩm có ít nhất hai cỡ và hai màu | Issue #6 | **Xong** ở `bee54a0` |
| Liệt kê có phân trang, lọc danh mục gồm danh mục con, sắp xếp mới nhất và theo giá | UC-03.1/AC1, AC2, AC4; UC-03.3/AC4 | Phải có |
| Cây danh mục; một danh mục theo đường dẫn, 404 khi không có | UC-03.1/AC5 | Phải có |
| `getVariantForCart` cho Duy | Issue #6, #7 | Đã cài ở `c7811ea`; còn công bố trên Issue #7 |
| Trang chủ, trang danh mục; ba trạng thái ở mọi trang | UC-03.1 | Phải có |
| Kiểm thử đơn vị cho service, kiểm thử HTTP cho đường dẫn mới | [testing.md](../../shared/testing.md) | Phải có |
| `importProducts` cho Tài nạp dữ liệu thật cuối tuần | Issue #6 | Phải có |
| Trang chi tiết đầy đủ: thư viện ảnh, chọn biến thể, giá đổi theo biến thể | UC-03.4/AC1, AC2, AC5 | Có thể trượt S3 |
| Sản phẩm liên quan; đã xem gần đây (lưu ở trình duyệt) | UC-03.4 | Có thể trượt S3 |
| Tìm kiếm hiểu câu tiếng Việt, bộ lọc giá, màu, cỡ, đối tượng, danh mục, ô tìm kiếm toàn cục, trang chủ mới | UC-03.2, UC-03.3 | **Xong** ở đợt 2 (`feature/ph-01-search-discovery`) |
| Bảng size | UC-03.5 | Ngoài S2 |
| Hiện tồn kho còn, sắp hết, hết | UC-03.4/BR1–BR3, AC3, AC4 | Ngoài S2, chờ tồn kho của Duy |

## Dữ liệu

Sơ đồ, từng cột, ràng buộc và chỉ mục ở [erd.md](erd.md); lý do ở [ADR-007](LOG.md#adr-007). Tóm tắt: **biến thể là đơn vị bán**, mỗi biến thể một màu, một cỡ, một mã hàng, một giá; màu, cỡ, thương hiệu là bảng tra cứu; ảnh gắn với sản phẩm, có thể gắn với một màu; `products.price_from` giữ giá thấp nhất để sắp xếp theo giá. Giỏ hàng và tồn kho của Duy trỏ khoá ngoại vào `product_variants.id`.

`prisma/seed/catalog.seed.ts#L51` chỉ upsert danh mục, thương hiệu, màu và cỡ; sản phẩm giả dành cho kiểm thử nằm trong `apps/api/test/fixtures/catalog-products.ts` và `apps/web/src/features/products/test-support/catalog-fixtures.ts`. Dữ liệu thật đi qua staging và `importProducts`, theo mục bên dưới. Không coi `npm run setup` là bước nạp sản phẩm.

## API

Theo [shared/api.md](../../shared/api.md) và [ADR-008](LOG.md#adr-008). Năm đường dẫn đọc sản phẩm, danh mục đã cài ở `bee54a0`; hình dạng thật do Swagger `/api/docs` sinh từ mã. Kiểm thử HTTP nằm trong `apps/api/test/products.http.spec.ts` và `apps/api/test/categories.http.spec.ts`.

`CategoriesController` đặt trong module `products` vì cùng một chủ và cùng bảng; không tạo module mới.

**Đợt 2 (30/09)** thêm, hình dạng đầy đủ xem Swagger `/api/docs`:

- `GET /api/products` nhận thêm `categories`, `audience`, `colors`, `sizes`, `minPrice`, `maxPrice`, `facets`, `sort=relevance`, `log`; có `search` thì trả thêm `interpretation` và `relaxed`; có `facets=true` thì trả `facets`. Mỗi sản phẩm có thêm `hoverImageUrl`, `colorSwatches`, `colorCount`.
- `GET /api/search/suggest?q=`: gợi ý cho ô tìm kiếm toàn cục, giới hạn 60 lần mỗi phút mỗi IP.
- `GET /api/categories`: mỗi nút có `productCount` (danh mục cha bằng tổng của nó và các con).
- Lý do, phương án và số đo: [ADR-019](LOG.md#adr-019). Cột `products.audience` (nam, nữ, unisex) do migration `20260930090000_ph01_search_audience` thêm và điền từ slug nguồn; `importProducts` ghi cột này từ lần nạp sau.
- Kiểm thử HTTP: `apps/api/test/catalog-search.http.spec.ts`.

## Nạp dữ liệu thật trên máy mới

`npm run setup` chỉ seed danh mục và các bảng tra cứu, nên bạn cùng nhóm clone về sẽ thấy cửa hàng **trống**. Muốn có 90 sản phẩm thật (87 hiển thị) như máy của Bảo, chạy từ thư mục gốc, theo thứ tự:

```bash
# 1. Đưa ứng viên đã chuẩn hoá vào bảng staging (kiểm trước: thêm --dry-run)
npm run crawler:persist -- --input tools/crawler/output/ht-03/bulk-20260925-300

# 2. Thử khô: đối chiếu tệp ứng viên với staging, in số liệu, KHÔNG ghi Catalog
npm run catalog:refresh -w apps/api -- --input tools/crawler/output/ht-03/bulk-20260925-300/normalized-candidates.jsonl

# 3. Ghi thật. Cờ --confirm-db bắt buộc, phải khớp tên cơ sở dữ liệu trong .env
npm run catalog:refresh -w apps/api -- --input tools/crawler/output/ht-03/bulk-20260925-300/normalized-candidates.jsonl --apply --confirm-db fashion_shop
```

Đã kiểm 30/09: bước 2 trên máy của Bảo in `"mode": "dry-run"`, `"approvedCandidates": 90`, `"importRows": 90`, `"noImageRows": 3`. Bước 1 và 3 **chưa chạy lại** trong đợt này vì máy này đã có dữ liệu; đọc lệnh từ `tools/crawler/src/persist-cli.ts` và `apps/api/scripts/refresh-approved-catalog.ts`. Đường dẫn `--input` tính từ **thư mục gốc kho**, không phải thư mục hiện tại.

Hai lưu ý:

1. Tệp `normalized-candidates.jsonl` đang được git theo dõi còn **HTML ở 122 trong 314 mô tả** (đo 30/09 bằng cách đếm mô tả có thẻ HTML). Bản đã làm sạch hiện chỉ có ở `work/ph01-data-refresh-20260927/` ngoài kho. Chạy lại `npm run crawler:normalize -- --input tools/crawler/output/ht-03/bulk-20260925-300` sẽ ghi đè các tệp trong `tools/crawler/output/`, là thư mục của Tài: **hỏi Bảo trước khi commit các tệp đó**.
2. Bước 3 ghi vào cơ sở dữ liệu `fashion_shop`; dùng cơ sở dữ liệu thử nghiệm riêng nếu muốn giữ nguyên dữ liệu đang có.

## Hợp đồng với phân hệ khác

Chữ ký thật và trạng thái ở [README của module](../../../apps/api/src/modules/products/README.md); ở đây chỉ ghi ai chờ gì.

| Ai chờ | Thứ gì | Hạn | Ghi chú |
|---|---|---|---|
| Duy, PH-02 | `getVariantForCart(variantId)` và bản nhiều dòng `getVariantsForCart(ids)` | Đã cài; công bố trên Issue #7 | Bản nhiều dòng tránh mỗi dòng giỏ một truy vấn |
| Duy, PH-02 | Chỗ đặt nút "Thêm vào giỏ" trên trang chi tiết | Chủ Nhật khi ghép | Trang chi tiết import nút từ `@/features/cart` qua cửa `index`, luật ranh giới cho phép; trước đó để nút giả bị khoá |
| Tài, PH-03 | `importProducts(rows)` | Chữ ký Thứ Sáu, cài đặt Thứ Bảy | Chạy lại không sinh bản trùng: nhận ra sản phẩm qua `sku` của biến thể; `slug` sinh một lần khi tạo |

## Giao diện

| Đường dẫn trang | Trang | Gọi | Mức |
|---|---|---|---|
| `/` | `HomePage` (Giờ Hổ Phách): hero có ô tìm kiếm câu nói, dải chữ, ba lối vào danh mục, hàng mới về, dịp mặc, Nàng/Chàng, câu chuyện chất liệu, nổi bật | `products?sort=newest&pageSize=10`, `categories`, `products?search=&pageSize=3&log=false` (dịp mặc, chất liệu), `products?audience=&facets=true&pageSize=1`, `products?featured=true&pageSize=8` | Phải có |
| `/tim-kiem` | `SearchPage`: ô nhập lớn, chip "Đã hiểu" bỏ được, bộ lọc có số đếm, sắp xếp, phân trang; trạng thái nằm trên URL (`q`, `audience`, `categories`, `colors`, `sizes`, `minPrice`, `maxPrice`, `sort`, `page`) | `products?search=&facets=true&…` | Phải có |
| `/danh-muc/:slug` | `CategoryPage`: đường dẫn phân cấp, bộ lọc dùng chung, sắp xếp, lưới, phân trang | `categories/:slug`, `products?categorySlug=&facets=true&…` | Phải có |
| `/san-pham/:slug` | `ProductDetailPage`: thư viện ảnh, chọn màu rồi cỡ, giá, mô tả, liên quan | `products/:slug`, `products/:slug/related` | Có thể trượt |
| `/san-pham` | `ProductListPage` hiện có, trang mẫu cho nhóm chép | `products?search=` | Giữ |
| `*` | Trang không tìm thấy | — | Phải có |

Ô tìm kiếm toàn cục nằm ở header (`SearchTrigger`): phím `/` hoặc `Ctrl/⌘ K` mở hộp thoại combobox ARIA, chờ 300 ms ngừng gõ mới gọi `/api/search/suggest`, có "Tìm gần đây" lưu ở trình duyệt. Header trong suốt trên hero của trang chủ, đặc lại khi cuộn quá 40 px; chiều cao header đo bằng `ResizeObserver` vào biến `--header-h`. Các trang trừ trang chủ tải theo nhu cầu (`React.lazy`), thư viện React tách gói riêng.

Trạng thái sắp xếp, lọc và trang nằm trên đường dẫn (`?sort=price_asc&page=2`) để chia sẻ được và nút quay lại của trình duyệt đúng. Menu danh mục trên đầu trang đặt trong `StoreLayout`, lấy thành phần `CategoryMenu` xuất từ `@/features/products`.

Ba ô danh mục gốc trên trang chủ (`home/CategoryBento`) dùng ảnh chiến dịch tĩnh `/images/home/category-{ao,quan,phu-kien}.webp` đã tạo theo hero được duyệt; không lấy ảnh ngẫu nhiên từ sản phẩm crawl. Lưới sản phẩm và trang chi tiết vẫn dùng ảnh thật từ Catalog. Bộ sắp xếp ở trang danh mục giữ `<select>` và URL hiện có, với giao diện biên tập riêng và nhãn truy cập `Sắp xếp`.

```text
Trang chủ                               Chi tiết sản phẩm
┌──────────────────────────────────┐    ┌──────────────────────────────────────┐
│ Logo   Áo  Quần  Phụ kiện   Giỏ  │    │ Trang chủ / Áo / Áo thun / <tên>     │
│ Hàng mới về            Xem hết → │    │ ┌──────────┐  <thương hiệu>          │
│ [ảnh][ảnh][ảnh][ảnh]              │    │ │ ảnh 3:4  │  <tên sản phẩm>         │
│ Mua theo danh mục                │    │ │          │  199.000 ₫  (249.000 ₫ gạch) │
│ [ Áo ] [ Quần ] [ Phụ kiện ]     │    │ └──────────┘  Màu: Đen   ● ● ○       │
│ Nổi bật                          │    │ [▫][▫][▫][▫]  Cỡ: [S] [M] [L] [XL]   │
│ [ảnh][ảnh][ảnh][ảnh]              │    │               [ Thêm vào giỏ ] ← PH-02 │
└──────────────────────────────────┘    │ Mô tả … · Sản phẩm liên quan …       │
                                         └──────────────────────────────────────┘
```

Chọn biến thể: chọn màu trước thì ảnh lọc theo màu đó (không có ảnh riêng thì dùng ảnh chung), cỡ không có biến thể đang bán với màu đã chọn thì hiện mờ và không bấm được; đủ màu và cỡ thì giá và mã hàng đổi theo. Thành phần dùng ở từ hai trang trở lên đặt trong `features/products/components/`; khối riêng của trang chủ trong `home/`, ô tìm kiếm trong `search/`, bộ lọc trong `filters/`. Mỗi thành phần một `*.module.css` theo [shared/design.md](../../shared/design.md) và [ADR-020](LOG.md#adr-020); `Catalog.module.css` đã tách và xoá.

## Task của PH-01

Mỗi `task/` tách từ `feature/ph-01-product-catalog`, có kiểm thử cùng mã, rồi gộp bằng merge commit về nhánh feature. Một Issue #6 theo dõi cả feature; không mở Issue trùng cho từng task.

| Thứ tự | Nhánh task | Phạm vi và điều kiện xong |
|---|---|---|
| 1 | `task/catalog-cart-contract` | Đã cài hai hàm, kiểm thử giá, trạng thái bán và ảnh, xuất kiểu qua `index.ts`; còn công bố cho Duy ở Issue #7. |
| 2 | `task/catalog-import` | Cài `importProducts` theo hợp đồng M2, mỗi dòng một transaction; chạy lại không sinh trùng, kiểm thử dòng lỗi và idempotency. |
| 3 | `task/catalog-api` | Nâng seed, hoàn thiện liệt kê, danh mục, chi tiết và HTTP tests theo ADR-008 đã chốt. |
| 4 | `task/catalog-web` | Trang chủ và danh mục với phân trang, sắp xếp, ba trạng thái; trang chi tiết và phần có thể trượt theo thứ tự ưu tiên ở dưới. |

Trước PR `Closes #6`: chạy `npm run check`, `npm run docs:lint`, kiểm thử HTTP, cập nhật README/LOG và đối chiếu Swagger với API đã cài.

Thứ tự cắt khi thiếu giờ: đã xem gần đây → sản phẩm liên quan → thư viện ảnh nhiều ảnh (giữ một ảnh) → trang chi tiết đầy đủ. **Không cắt** `getVariantForCart`, `importProducts`, ba trạng thái, kiểm thử.

## Kiểm thử và nghiệm thu

Tên bài theo `UC-NN.m/ACk` ([testing.md](../../shared/testing.md)). Kiểm thử API đã chạy trong Pha 2; kiểm thử giao diện sẽ bổ sung trong Pha 3.

| Tiêu chí | Bài kiểm thử dự kiến | Kết quả |
|---|---|---|
| UC-03.1/AC1 danh mục cha trả cả sản phẩm của danh mục con | `test/products.http.spec.ts` | — |
| UC-03.1/AC2 sản phẩm ngừng bán không hiện | `products.service.spec.ts`, `products.http.spec.ts` | — |
| UC-03.1/AC4 phân trang đúng, `total` khớp | có sẵn, đổi tên | — |
| UC-03.1/AC5 danh mục không có trả 404 | `test/categories.http.spec.ts` | — |
| UC-03.3/AC4 `sort=price_asc` đúng chiều | `products.http.spec.ts` | — |
| UC-03.4/AC1 chi tiết đủ ảnh và biến thể | `products.http.spec.ts` | — |
| UC-03.4/AC2, AC5 ngừng bán hoặc slug lạ trả 404 | có sẵn một phần | — |
| `getVariantForCart` đúng hình dạng Issue #7, `null` khi không có | `products.service.spec.ts` | Đã có bài kiểm thử ở `c7811ea` |
| `importProducts` chạy hai lần không sinh bản trùng | `test/products-import.http.spec.ts` | — |
| Ba trạng thái ở trang chủ, trang danh mục, trang chi tiết | `features/products/pages/*.test.tsx` | — |

## Tìm kiếm ngữ nghĩa (06/11/2026)

Nhánh `task/ph-01-semantic-search` thêm tìm kiếm lai theo [ADR-048](LOG.md#adr-048) (đề xuất). Luật và từ điển vẫn lọc và giữ chip "Đã hiểu". Mô hình `Xenova/multilingual-e5-small` chạy trong API (thư mục [`search/semantic/`](../../../apps/api/src/modules/products/search/semantic/semantic-index.service.ts)) dùng để gộp hạng và thêm sản phẩm gần nghĩa. Bật bằng `SEARCH_SEMANTIC=local`, mặc định `off`; staging Render để `off` ([ND-17](../../TECH_DEBT.md)). Tiêu chí ở [UC-03.2/AC5–AC10](use-cases.md). Số đo trước và sau: `npm run search:eval -w apps/api`, bộ câu có nhãn ở `apps/api/scripts/search-eval/cases.json`.

## Trạng thái hôm nay (04/10/2026)

**Đợt 2 đã vào `develop`** qua PR #28 tại `ee46445` ngày 03/10; Issue #23 đã đóng. Đã có tìm kiếm hiểu câu tiếng Việt bằng luật/từ điển, facets, gợi ý, trang `/tim-kiem`, bộ lọc chung và trang chủ mới (`apps/api/src/modules/products/search/catalog-search.service.ts#L130`, `apps/web/src/app/routes.tsx#L43`). Đây là query understanding theo luật; tới 06/11 chưa cài embedding hoặc LLM runtime.

**Kiểm chứng 04/10:** `npm.cmd run check` exit 0 tại `33f323c` (nhánh sửa header): API 259 pass, web 136 pass, crawler 50 pass/1 skip. Năm dòng stdout cuối: `ℹ fail 0` / `ℹ cancelled 0` / `ℹ skipped 1` / `ℹ todo 0` / `ℹ duration_ms 592.0993`. CI PR #28 trên `1809122` có 281 HTTP test pass trong 13 file; `gh pr checks 28 --json name,state,link` trả sáu gate `SUCCESS`. Không cộng các số này thành số test riêng của Bảo.

**Còn mở:** PR #31 sửa header ở màn hẹp, hero và chữ thương hiệu; mã nằm ở `bugfix/header-brand-text@33f323c`, CI thành công nhưng chưa gộp ngày 04/10. Bộ nhận diện F.R.E.Y.A. đã được bàn giao ở workspace `work/branding/freya-brand-kit-v1/`. Cuối phiên 04/10 đã thấy asset trong `apps/web/public/images/brand/freya/` và thương hiệu/slogan mới tại `core/brand.ts#L2`, `:5`, nối vào `StoreLayout.tsx#L60`, `:108`; đây là thay đổi local chưa commit, cần nghiệm thu riêng. Kết quả check nêu trên được chạy trước các thay đổi nhận diện này. ADR-019 và ADR-020 vẫn **đề xuất**. Số đo hiệu năng/Lighthouse ngày 30/09 là mốc lịch sử, chưa đo lại ở commit hiện tại.

### Trạng thái 27/09/2026

Các pha nền của PH-01 và `task/catalog-data-ux` đã được gộp vào `feature/ph-01-product-catalog`. Đợt này đã làm sạch mô tả crawl, nạp lại 90 candidate đã duyệt, tách sản phẩm giả sang test fixtures, xóa seed khỏi DB local và sửa scroll, gallery, màu, header, hero. DB local sau khi chạy lại `npm run db:seed -w apps/api` có 90 product, 339 variant, 1.199 ảnh, 0 product seed và 87 product active; API list trả total=87. Ba product không có ảnh dùng được không xuất hiện trong storefront.

Kiểm tra: `npm run check` exit 0 (API unit 28/28, web 27/27, crawler 50 pass, 1 skip); `npm run test:http` exit 0 (57/57); `npm run db:drift -w apps/api` không thấy lệch; `npm run build -w apps/web` exit 0 với cảnh báo chunk JavaScript trên 500 kB; kiểm tài liệu feature exit 0. Bảo đã duyệt giao diện. Nhánh feature dùng để mở PR vào `develop` với `Closes #6`; cần CI và người khác review trước khi merge. Issue #6 chưa đóng.

## Còn mở

| Câu hỏi | Trả lời đề xuất | Ai chốt |
|---|---|---|
| Tìm kiếm dùng `ILIKE` hay `tsvector` (đặc tả, câu 1) | Đã trả lời bằng [ADR-019](LOG.md#adr-019) (đề xuất): luật và từ điển tiếng Việt, lọc trong API | Bảo chốt ADR |
| "Phổ biến nhất" không có đơn thì lấy gì (câu 2) | Ngoài S2; khi làm thì lấy mới nhất | Bảo |
| Gợi ý cỡ theo hồ sơ vóc dáng (câu 3) | Ngoài S2 | Tài và Bảo |
| Có lưu "đã xem gần đây" không (câu 4) | Có, lưu ở trình duyệt, không cần bảng; có thể trượt S3 | Bảo |
| Hiện tồn kho trên trang chi tiết | Chờ Duy công bố hàm đọc tồn kho theo `variantId` | Duy |
| Hệ màu và thang chữ | Đề xuất ở [ADR-020](LOG.md#adr-020) | Bảo |


## Quản trị catalog chỉ đọc — Issue #63

Tài triển khai lát đọc UC-04.2 theo [đặc tả đề xuất](use-cases.md#uc-042--quản-lý-thông-tin-sản-phẩm--lát-đọc-issue-63).
Lát đọc đã gộp qua [PR #64](https://github.com/F-R-E-Y-A/fashion-shop/pull/64) tại `b4a056b`;
Issue #63 đã đóng. Nhánh frontend đã đồng bộ develop `924dceb` gồm Catalog, Orders, trạng thái và khuyến mãi.
[AdminProductsController](../../../apps/api/src/modules/products/admin-products.controller.ts#L27)
kiểm ADMIN qua AuthModule; [service](../../../apps/api/src/modules/products/admin-products.service.ts#L70)
đọc cả bản ghi ẩn, tách khỏi storefront. Hình dạng HTTP theo Swagger nhóm `admin-products`.
Không đổi schema, hợp đồng import/public index hoặc ghi bảng qua luồng đọc.

[Danh sách](../../../apps/web/src/features/products/admin/AdminCatalogPage.tsx#L22) và
[chi tiết](../../../apps/web/src/features/products/admin/AdminCatalogDetailPage.tsx#L16) giữ điều kiện URL,
dùng authenticatedRequest/guardQuery và cache session/admin/products/actor.
Tổng quan giữ AdminProductsPage cũ; route mới là `/admin/products` và `/admin/products/:id`.
Danh sách có q tên/SKU, cờ hoạt động, sắp xếp, phân trang; không coi isActive là đảm bảo bán được.

PR #60 đã merge; menu Sản phẩm dùng [AdminNavigation](../../../apps/web/src/app/AdminNavigation.tsx#L23),
breadcrumb danh sách/chi tiết dùng [AdminLayout](../../../apps/web/src/app/AdminLayout.tsx#L19).
Giữ nguyên drawer, focus và các bài kiểm thử của shell; bổ sung kiểm tra route catalog.
Check/build/HTTP/docs lint và QA được định danh bằng commit/patch trong báo cáo ở kho docs;
không coi kết quả local là CI đã đạt. Quyết định [ADR-044](LOG.md#adr-044) vẫn đề xuất.
Tạo/sửa nội dung, biến thể/ảnh và danh mục thuộc đợt sau; Tài đã chọn giữ dữ liệu, không xóa cứng.

## Ngừng bán và gỡ ngừng bán — Issue #65, PR #71

[PR #71](https://github.com/F-R-E-Y-A/fashion-shop/pull/71) đã được Bảo approve và merge tại `bb6f648` ngày 09/11; Issue #65 đã đóng.
Lát trạng thái mở rộng [UC-04.2/AC11–18](use-cases.md#mở-rộng-trạng-thái-sản-phẩm--issue-65-đề-xuất);
CI của head `258b0ca` đạt 7/7; hình dạng HTTP lấy từ Swagger `admin-products`.
[Admin service](../../../apps/api/src/modules/products/admin-products.service.ts) kiểm phiên bản và khóa
cùng hàng với [import](../../../apps/api/src/modules/products/product-status.ts); import không gỡ hold thủ công.
Một migration bổ sung hold/version, mặc định false/0 giữ cờ isActive cũ; chỉ kiểm trên DB test riêng,
không áp lên DB phát triển. Việc rollout DB phát triển vẫn hoãn theo yêu cầu Tài, tách khỏi nghiệm thu frontend.

[Luồng chung](../../../apps/web/src/features/products/admin/product-status-action.tsx) dùng authenticatedRequest,
actor/epoch/thế hệ quyền; list/detail xác nhận tên và tác động, ngăn gửi lặp, xử lý kết quả chưa rõ bằng GET.
Sau thành công bỏ tập filter cũ và tải total/trang lại; không tính lại total từ một dòng.
Không ghi dữ liệu admin bằng response phiên cũ/403 hoặc đè phiên bản mới hơn đang đọc.
Bật lại là gỡ ngừng bán thủ công, không tự bật danh mục/biến thể hoặc chọn lại giỏ.

## Danh mục quản trị đọc và ẩn hiện — Issue #79

Đặc tả đề xuất [UC-04.1](use-cases-admin-categories.md) thuộc Issue #79: đọc cây phân cấp, chi tiết và chuyển đổi trạng thái hiển thị (`isActive`) an toàn qua CAS bằng `updatedAt`.
Không tạo mới, sửa tên/slug/cha/thứ tự, không xóa và không kéo thả.
Phân quyền ADMIN kiểm tra trước validation, allowlist và `Cache-Control: no-store`.
Ngữ nghĩa: ẩn cha làm nhánh con không hiển thị hiệu lực (`parentHidden: true`), không đổi cờ DB con; bật cha chỉ khôi phục con có `isActive = true`.
Số đếm: `productCount` (trực tiếp) và `subtreeProductCount` (toàn nhánh) trong cùng snapshot `RepeatableRead`.
CAS kiểm tra `expectedUpdatedAt` ISO mili-giây, khóa hàng `FOR UPDATE`, tăng đơn điệu `GREATEST(NOW(), updated_at + 1ms)`; no-op không UPDATE và không bump catalog revision.
Storefront và Cart phản ánh trạng thái ẩn/hiện danh mục; seed lặp bảo toàn quyết định ẩn của admin; quyết định kiến trúc đề xuất [ADR-053](LOG.md#adr-053).

Giỏ lần đọc sau báo INACTIVE và bỏ chọn; thêm bị Cart từ chối theo lỗi hiện có.
Checkout đã đọc Catalog trước khi ngừng bán có thể tiếp tục; không tự hủy/hoàn tiền đơn hoặc sửa kho.
Kiểm bằng unit/web, [HTTP regression](../../../apps/api/test/admin-product-status.http.spec.ts) và
[E2E admin](../../../apps/web/e2e/admin-product-status.spec.ts) trên DB riêng: giảm chuyển động thật,
desktop/mobile, hai hướng list/detail và focus. Zoom200% thật còn chờ kiểm; không thay bằng viewport.
Quyết định [ADR-049](LOG.md#adr-049) vẫn đề xuất; số045 trùng quyết định đã gộp nên đã đổi số.
ảnh/log/patch định danh bản giữ trong kho docs; chưa coi bản local là nghiệm thu toàn bộ admin.

## Tổng quan admin — frontend đã gộp PR #76

`/admin` giữ `AdminProductsPage` sau `RequireAdmin`, đọc `total` của danh sách sản phẩm công khai hiện có.
Thẻ này không đếm mọi bản ghi catalog hoặc cam kết sản phẩm còn tồn; không phải dashboard doanh thu.
Nhánh `feature/ph-03-admin-frontend-refinement` thêm H1, card theo AdminKit, trạng thái tải, lỗi và Thử lại;
`total: 0` hiện số 0, số lớn định dạng `vi-VN`; nhãn “Sản phẩm công khai” không cam kết có tồn.
Giữ `listProducts`, query key và hợp đồng API hiện tại.

Yêu cầu trình bày nằm tại [UC-02.1/AC9](../users/use-cases.md); nguồn tổng theo UC-03.1/AC4 ở
[use-cases.md](use-cases.md). Bài `AdminProductsPage.test.tsx` kiểm dữ liệu/feedback;
[E2E layout](../../../apps/web/e2e/admin-layout.spec.ts) đối chiếu total qua API thật và giảm chuyển động, không thay kiểm zoom thủ công. Danh sách/chi tiết quản trị Catalog đã tích hợp từ PR #64; đợt này giữ nguyên API và
chức năng đọc catalog. Khung, CSS dùng chung và vùng Products cần Bảo review trước gộp.

## Sửa nội dung quản trị — Issue #77

[AC19–28](use-cases-admin-content.md) bổ sung bốn trường nội dung, CAS riêng và bảo vệ từng trường qua import.
[Issue77](https://github.com/F-R-E-Y-A/fashion-shop/issues/77), task/admin-product-edit trên catalog đã đồng bộ develop752b410.
API đã cài trong admin-products; DTO/controller sinh hợp đồng tại Swagger `/api/docs`.
Migration thêm version nội dung và danh sách trường được giữ khi import; mới áp trên DB test riêng,
chưa rollout DB phát triển. Giữ slug/giá/trạng thái/kho/đơn theo hợp đồng cũ.
409 giữ draft, ghép ba bản gốc/đang soạn/máy chủ; xung đột cùng trường cần người dùng chọn.
GET tải lại giữ phần gõ thêm trong lúc chờ; timeout/network/5xx cần đối chiếu trước lưu tiếp.
Quyết định [ADR-052](LOG.md#adr-052) còn đề xuất; chưa tự coi là đã nghiệm thu hoặc merge Issue77.
