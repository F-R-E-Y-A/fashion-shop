---
title: Khám phá sản phẩm — bản đồ và kế hoạch PH-01
updated: 2026-09-25
status: đang làm
owner: Bảo
---
# Khám phá sản phẩm

**Chức năng:** Cửa vào của feature sản phẩm: PH-01 tuần này làm gì, dữ liệu, API, giao diện, hợp đồng với hai bạn, kế hoạch từng buổi, trạng thái hôm nay.

| | |
|---|---|
| **Người sở hữu** | Bảo · `apps/api/src/modules/products` · `apps/web/src/features/products` · bảng trong `prisma/schema/catalog.prisma` |
| **Dòng việc** | PH-01 (Issue #6, nhánh `feature/ph-01-product-catalog`), S2 21/09 – 27/09 |
| **Use case** | UC-03.1 duyệt danh mục, UC-03.4 xem chi tiết, phần sắp xếp của UC-03.3, trong [use-cases.md](use-cases.md) |
| **Dữ liệu** | [erd.md](erd.md): sơ đồ và từ điển bảy bảng |
| **Quyết định** | [ADR-007](LOG.md#adr-007) mô hình dữ liệu **đã chốt** (M2, cài ở PR #11) · [ADR-008](LOG.md#adr-008) hình dạng API · [ADR-009](../../LOG.md#adr-009) CSS Modules — hai ADR sau đang **đề xuất** |

## Giải quyết việc gì

Khách vào trang chủ, bấm một danh mục, mở một sản phẩm, chọn được cỡ và màu, thấy giá đổi theo lựa chọn. Xong PH-01 thì Duy có biến thể để bỏ vào giỏ, Tài có hàm để nạp hơn 300 sản phẩm thật.

## Ba việc trước dòng mã đầu tiên

1. **Duyệt [use-cases.md](use-cases.md), chốt ADR-008**: đổi dòng `Trạng thái` thành `đã chốt` hoặc sửa lại. ADR-007 đã chốt ngày 25/09 và [erd.md](erd.md) đã thành lược đồ thật ([LOG](LOG.md#m2-trong-pr-11)). Mã viết lại theo hai tệp này, không theo module demo.
2. **Nền đã sẵn**: tài liệu theo cấu trúc mới đã vào `develop` qua pull request #12 (`58f45e9`); nhánh này tách từ đó và nối với Issue #6.
3. **Công bố hợp đồng cho Duy, đã trễ hẹn Thứ Ba 23/09.** Chữ ký đã soạn sẵn ở [products/README.md](../../../apps/api/src/modules/products/README.md) mục Hợp đồng công bố. Dán vào Issue #7 để Duy chạy trên dữ liệu giả đúng hình dạng ngay tối nay.

## Phạm vi S2

| Hạng mục | Use case, tiêu chí | Mức |
|---|---|---|
| Bảy bảng theo [erd.md](erd.md); migration có ràng buộc `CHECK` viết tay; `db:drift` sạch | ADR-007 | **Xong** ở PR #11 (`f39ae11`) |
| Dữ liệu giả: hai cấp danh mục, 20 sản phẩm, vài sản phẩm có ít nhất hai cỡ và hai màu | Issue #6 | Phải có; PR #11 đã có 10 sản phẩm, còn nâng lên 20 |
| Liệt kê có phân trang, lọc danh mục gồm danh mục con, sắp xếp mới nhất và theo giá | UC-03.1/AC1, AC2, AC4; UC-03.3/AC4 | Phải có |
| Cây danh mục; một danh mục theo đường dẫn, 404 khi không có | UC-03.1/AC5 | Phải có |
| `getVariantForCart` cho Duy | Issue #6, #7 | Phải có, **làm sớm nhất** |
| Trang chủ, trang danh mục; ba trạng thái ở mọi trang | UC-03.1 | Phải có |
| Kiểm thử đơn vị cho service, kiểm thử HTTP cho đường dẫn mới | [testing.md](../../shared/testing.md) | Phải có |
| `importProducts` cho Tài nạp dữ liệu thật cuối tuần | Issue #6 | Phải có |
| Trang chi tiết đầy đủ: thư viện ảnh, chọn biến thể, giá đổi theo biến thể | UC-03.4/AC1, AC2, AC5 | Có thể trượt S3 |
| Sản phẩm liên quan; đã xem gần đây (lưu ở trình duyệt) | UC-03.4 | Có thể trượt S3 |
| Tìm kiếm, bộ lọc giá, màu, cỡ, bảng size | UC-03.2, UC-03.3, UC-03.5 | Ngoài S2 |
| Hiện tồn kho còn, sắp hết, hết | UC-03.4/BR1–BR3, AC3, AC4 | Ngoài S2, chờ tồn kho của Duy |

## Dữ liệu

Sơ đồ, từng cột, ràng buộc và chỉ mục ở [erd.md](erd.md); lý do ở [ADR-007](LOG.md#adr-007). Tóm tắt: **biến thể là đơn vị bán**, mỗi biến thể một màu, một cỡ, một mã hàng, một giá; màu, cỡ, thương hiệu là bảng tra cứu; ảnh gắn với sản phẩm, có thể gắn với một màu; `products.price_from` giữ giá thấp nhất để sắp xếp theo giá. Giỏ hàng và tồn kho của Duy trỏ khoá ngoại vào `product_variants.id`.

Dữ liệu giả trong `prisma/seed/catalog.seed.ts`, mã định danh cố định như hiện nay: danh mục cha Áo, Quần, Phụ kiện và bảy danh mục con; sáu màu (có `mac-dinh`), mười cỡ có `sort_order` (có `FREE`), ba thương hiệu; 10 sản phẩm, một sản phẩm dùng biến thể mặc định; ảnh dùng địa chỉ ảnh mẫu cố định theo `slug` và màu, vì kho ảnh chưa có ([platform/README](../platform/README.md) lộ trình). Bài kiểm thử import hằng số từ tệp seed, không gõ lại số.

## API

Theo [shared/api.md](../../shared/api.md) và [ADR-008](LOG.md#adr-008). Đây là **đề xuất**; cài xong dòng nào thì xoá dòng đó, Swagger `/api/docs` là nguồn.

| Đường dẫn | Việc | Tham số, hình dạng | Tiêu chí |
|---|---|---|---|
| `GET /api/products` | Có sẵn, mở rộng | thêm `sort=newest\|price_asc\|price_desc` (mặc định `newest`), `featured=true`; `categorySlug` gồm cả danh mục con. Mỗi dòng: `id, name, slug, brandName, categoryName, categorySlug, imageUrl, price, listPrice` (`listPrice` khác `null` khi đang giảm giá) | UC-03.1/AC1, AC2, AC4; UC-03.3/AC4 |
| `GET /api/products/:slug` | Có sẵn, mở rộng | thêm `material`, `careInstructions`, `brandName`, `breadcrumb[]`, `colors[]` (`code, name, hex`), `images[]` (`url, alt, colorCode`), `variants[]` (`id, sku, colorCode, sizeCode, price, listPrice`, xếp theo thứ tự cỡ); slug khai bằng lớp DTO để đi qua `ValidationPipe` (ND-10) | UC-03.4/AC1, AC2, AC5 |
| `GET /api/products/:slug/related` | Mới | `limit` mặc định 4; cùng danh mục, trừ chính nó, đang bán | UC-03.4 |
| `GET /api/categories` | Mới | cây danh mục đang hiện: `id, name, slug, children[]`, xếp theo `sortOrder` | UC-03.1 |
| `GET /api/categories/:slug` | Mới | `id, name, slug, breadcrumb[]` (`name, slug` từ gốc xuống); 404 `NOT_FOUND` khi không có | UC-03.1/AC5 |

`CategoriesController` đặt trong module `products` vì cùng một chủ và cùng bảng; không tạo module mới.

## Hợp đồng với phân hệ khác

Chữ ký thật và trạng thái ở [README của module](../../../apps/api/src/modules/products/README.md); ở đây chỉ ghi ai chờ gì.

| Ai chờ | Thứ gì | Hạn | Ghi chú |
|---|---|---|---|
| Duy, PH-02 | `getVariantForCart(variantId)` và bản nhiều dòng `getVariantsForCart(ids)` | Công bố ngay; cài đặt sáng Thứ Bảy 26/09 | Bản nhiều dòng tránh mỗi dòng giỏ một truy vấn |
| Duy, PH-02 | Chỗ đặt nút "Thêm vào giỏ" trên trang chi tiết | Chủ Nhật khi ghép | Trang chi tiết import nút từ `@/features/cart` qua cửa `index`, luật ranh giới cho phép; trước đó để nút giả bị khoá |
| Tài, PH-03 | `importProducts(rows)` | Chữ ký Thứ Sáu, cài đặt Thứ Bảy | Chạy lại không sinh bản trùng: nhận ra sản phẩm qua `sku` của biến thể; `slug` sinh một lần khi tạo |

## Giao diện

| Đường dẫn trang | Trang | Gọi | Mức |
|---|---|---|---|
| `/` | `HomePage`: hàng mới về, mua theo danh mục, nổi bật | `products?sort=newest&pageSize=8`, `categories`, `products?featured=true&pageSize=8` | Phải có |
| `/danh-muc/:slug` | `CategoryPage`: đường dẫn phân cấp, sắp xếp, lưới, phân trang | `categories/:slug`, `products?categorySlug=&sort=&page=` | Phải có |
| `/san-pham/:slug` | `ProductDetailPage`: thư viện ảnh, chọn màu rồi cỡ, giá, mô tả, liên quan | `products/:slug`, `products/:slug/related` | Có thể trượt |
| `/san-pham` | `ProductListPage` hiện có, chuyển từ `/` sang | `products?search=` | Giữ |
| `*` | Trang không tìm thấy | — | Phải có |

Trạng thái sắp xếp và trang nằm trên đường dẫn (`?sort=price_asc&page=2`) để chia sẻ được và nút quay lại của trình duyệt đúng. Menu danh mục trên đầu trang đặt trong `StoreLayout`, lấy thành phần `CategoryMenu` xuất từ `@/features/products`.

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

Chọn biến thể: chọn màu trước thì ảnh lọc theo màu đó (không có ảnh riêng thì dùng ảnh chung), cỡ không có biến thể đang bán với màu đã chọn thì hiện mờ và không bấm được; đủ màu và cỡ thì giá và mã hàng đổi theo. Thành phần mới đặt trong `features/products/components/`, kiểu bằng `*.module.css` theo [shared/design.md](../../shared/design.md).

## Kế hoạch từng buổi

| Buổi | Việc | Xong khi |
|---|---|---|
| **T6 25/09 tối** | Ba việc ở trên. Lược đồ, migration có `CHECK`, seed M2 **đã xong sớm** trong PR #11 của Tài (`f39ae11`, CI xanh sáu chặng). Còn: sau khi PR #11 gộp, gộp `develop` vào nhánh này; `npm exec -w apps/api -- prisma migrate reset` ở máy (xoá dữ liệu, chạy lại migration và seed) vì cột mới `price_from` bắt buộc | Nhánh này có bảy bảng; `npm run db:drift -w apps/api` trả 0 ở máy |
| **T7 26/09** | Sáng: service và controller cho liệt kê, chi tiết, danh mục, `getVariantForCart(s)`, `importProducts`; DTO cho slug; bài đơn vị và bài HTTP; báo Duy, Tài. Chiều: `HomePage`, `CategoryPage`, `CategoryMenu`, trang không tìm thấy. Tối: `ProductDetailPage` với thư viện ảnh và chọn biến thể | `npm run test:http` xanh; ba trang chạy trên máy, đủ ba trạng thái |
| **CN 27/09 sáng** | Ghép nút giỏ của Duy. `npm run check`, `npm run test:http`. Cập nhật README này, bảng API trong `use-cases.md` theo mã, một mục *thay đổi* trong [LOG](LOG.md) kèm số đo. Mở pull request `Closes #6` | CI xanh sáu chặng; demo 19h |

Thứ tự cắt khi thiếu giờ: đã xem gần đây → sản phẩm liên quan → thư viện ảnh nhiều ảnh (giữ một ảnh) → trang chi tiết đầy đủ. **Không cắt** `getVariantForCart`, `importProducts`, ba trạng thái, kiểm thử.

## Kiểm thử và nghiệm thu

Tên bài theo `UC-NN.m/ACk` ([testing.md](../../shared/testing.md)). Bài hiện có trong module mẫu còn tên `PH-03`, `AC-1`; viết lại khi sửa.

| Tiêu chí | Bài kiểm thử dự kiến | Kết quả |
|---|---|---|
| UC-03.1/AC1 danh mục cha trả cả sản phẩm của danh mục con | `test/products.http.spec.ts` | — |
| UC-03.1/AC2 sản phẩm ngừng bán không hiện | `products.service.spec.ts`, `products.http.spec.ts` | — |
| UC-03.1/AC4 phân trang đúng, `total` khớp | có sẵn, đổi tên | — |
| UC-03.1/AC5 danh mục không có trả 404 | `test/categories.http.spec.ts` | — |
| UC-03.3/AC4 `sort=price_asc` đúng chiều | `products.http.spec.ts` | — |
| UC-03.4/AC1 chi tiết đủ ảnh và biến thể | `products.http.spec.ts` | — |
| UC-03.4/AC2, AC5 ngừng bán hoặc slug lạ trả 404 | có sẵn một phần | — |
| `getVariantForCart` đúng hình dạng Issue #7, `null` khi không có | `products.service.spec.ts` | — |
| `importProducts` chạy hai lần không sinh bản trùng | `test/products-import.http.spec.ts` | — |
| Ba trạng thái ở trang chủ, trang danh mục, trang chi tiết | `features/products/pages/*.test.tsx` | — |

## Trạng thái hôm nay (25/09/2026)

Tầng dữ liệu của PH-01 xong sớm: ADR-007 chốt theo M2 và cài luôn trong PR #11 của Tài (`f39ae11`: lược đồ, migration, seed; module demo đọc giá từ `price_from`), CI xanh sáu chặng. Service, API và giao diện của PH-01 chưa bắt đầu. Chặn: PR #11 chưa gộp nên nhánh này chưa có bảy bảng; ADR-008 chưa chốt; hợp đồng cho Duy trễ từ 23/09; Docker trên máy chưa chạy nên `test:http` chỉ kiểm được trên CI.

## Còn mở

| Câu hỏi | Trả lời đề xuất | Ai chốt |
|---|---|---|
| Tìm kiếm dùng `ILIKE` hay `tsvector` (đặc tả, câu 1) | Ngoài S2; `ILIKE` đang có trong mã đủ cho 300 sản phẩm | Bảo, khi làm UC-03.2 |
| "Phổ biến nhất" không có đơn thì lấy gì (câu 2) | Ngoài S2; khi làm thì lấy mới nhất | Bảo |
| Gợi ý cỡ theo hồ sơ vóc dáng (câu 3) | Ngoài S2 | Tài và Bảo |
| Có lưu "đã xem gần đây" không (câu 4) | Có, lưu ở trình duyệt, không cần bảng; có thể trượt S3 | Bảo |
| Hiện tồn kho trên trang chi tiết | Chờ Duy công bố hàm đọc tồn kho theo `variantId` | Duy |
| Hệ màu và thang chữ | PH-01 đề xuất bằng một mục trong LOG này | Bảo |
