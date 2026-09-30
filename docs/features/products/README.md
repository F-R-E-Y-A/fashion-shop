---
title: Khám phá sản phẩm — bản đồ và kế hoạch PH-01
updated: 2026-09-30
status: đang làm
owner: Bảo
---
# Khám phá sản phẩm

**Chức năng:** Cửa vào của feature sản phẩm: PH-01 tuần này làm gì, dữ liệu, API, giao diện, hợp đồng với hai bạn, kế hoạch từng buổi, trạng thái hôm nay.

| | |
|---|---|
| **Người sở hữu** | Bảo · `apps/api/src/modules/products` · `apps/web/src/features/products` · bảng trong `prisma/schema/catalog.prisma` |
| **Dòng việc** | PH-01 (Issue #6, nhánh `feature/ph-01-product-catalog`), S2 21/09 – 27/09; đợt 2 (tìm kiếm, lọc, trang chủ) nhánh `feature/ph-01-search-discovery`, hạn 01/10 |
| **Use case** | UC-03.1 duyệt danh mục, UC-03.2 tìm kiếm, UC-03.3 lọc và sắp xếp, UC-03.4 xem chi tiết, trong [use-cases.md](use-cases.md) |
| **Dữ liệu** | [erd.md](erd.md): sơ đồ và từ điển bảy bảng |
| **Quyết định** | [ADR-007](LOG.md#adr-007) mô hình dữ liệu **đã chốt** (M2, cài ở PR #11) · [ADR-008](LOG.md#adr-008) hình dạng API · [ADR-009](../../LOG.md#adr-009) CSS Modules — hai ADR sau đang **đề xuất** · [ADR-019](LOG.md#adr-019) tìm kiếm hiểu tiếng Việt · [ADR-020](LOG.md#adr-020) token giao diện bản 1 — cả hai **đề xuất** |

## Giải quyết việc gì

Khách vào trang chủ, bấm một danh mục, mở một sản phẩm, chọn được cỡ và màu, thấy giá đổi theo lựa chọn. Xong PH-01 thì Duy có biến thể để bỏ vào giỏ, Tài có hàm để nạp hơn 300 sản phẩm thật.

## Việc cần chốt và phối hợp

1. **Duyệt [use-cases.md](use-cases.md), chốt ADR-008 trước khi mở rộng API**: Bảo xác nhận phương án A hoặc B rồi đổi dòng `Trạng thái` trong [LOG](LOG.md#adr-008). ADR-007 đã chốt; lược đồ M2 trong [erd.md](erd.md) đã có ở nhánh này.
2. **Nền đã đồng bộ**: PR #11 (schema M2) và PR #13 (crawler/staging) đã vào `develop`; nhánh PH-01 nhận cả hai ở merge commit `38eaac2`. PR #13 chưa đưa dữ liệu thật vào Catalog.
3. **Công bố hợp đồng cho Duy**: `getVariantForCart(s)` đã cài và chữ ký ở [README của module](../../../apps/api/src/modules/products/README.md) mục Hợp đồng công bố. Còn dán vào Issue #7 để Duy dùng đúng hình dạng.

## Phạm vi S2

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

Dữ liệu giả trong `prisma/seed/catalog.seed.ts`: danh mục cha Áo, Quần, Phụ kiện và bảy danh mục con; sáu màu (có `mac-dinh`), mười cỡ có `sort_order` (có `FREE`), ba thương hiệu; 20 sản phẩm. Ảnh dùng địa chỉ mẫu cố định theo `slug` và màu, vì kho ảnh chưa có ([platform/README](../platform/README.md) lộ trình). Bài kiểm thử import hằng số từ tệp seed, không gõ lại số.

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

## Trạng thái hôm nay (30/09/2026)

**Đợt 2 — tìm kiếm, bộ lọc, trang chủ** (nhánh `feature/ph-01-search-discovery`, các commit local, chưa push): máy chủ tìm kiếm hiểu câu tiếng Việt và lọc có số đếm, gợi ý có giới hạn tần suất, ô tìm kiếm toàn cục, trang `/tim-kiem`, bộ lọc dùng chung cho danh mục, trang chủ Giờ Hổ Phách. Số đo ngày 30/09: `npm run check` exit 0 (API unit 221 bài, web 136 bài); `npm run test:http` 208 bài xanh trước khi thêm bài `log=false`, file tìm kiếm chạy riêng 39 bài xanh; `npm run db:drift -w apps/api` → `No difference detected.`; `npm run build -w apps/web` không còn cảnh báo chunk trên 500 kB (chunk lớn nhất 431 kB); `GET /api/products?search=&facets=true` p95 80–90 ms trên 87 sản phẩm; Lighthouse di động trên bản build: Accessibility 100, Best Practices 96, SEO 92, LCP 871 ms, CLS 0,04 (điểm Performance chưa đo). ADR-019 và ADR-020 đang **đề xuất**.

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
