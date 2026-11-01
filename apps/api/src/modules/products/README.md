# Phân hệ `products` — module mẫu

**Chủ sở hữu:** Bảo · **Dòng việc:** PH-01 (Issue #6) · **Bảng:** `categories`, `brands`, `colors`, `sizes`, `products`, `product_variants`, `product_images` trong `prisma/schema/catalog.prisma`, mô hình M2 cài ở PR #11, từ điển ở [erd.md](../../../../../docs/features/products/erd.md) · **Tài liệu feature:** [docs/features/products/](../../../../../docs/features/products/README.md)

Đây là module MẪU. Làm phân hệ mới thì chép cả thư mục này, đổi tên, giữ đúng bốn tầng:

| Tệp | Vai trò | Luật |
|---|---|---|
| `dto/*.query.ts`, `dto/*.response.ts` | Hình dạng vào và ra, có chú thích Swagger | Không import Prisma |
| `*.controller.ts` | Nhận HTTP, kiểm dữ liệu vào, gọi service | Không import Prisma, không có logic |
| `*.service.ts` | Nghiệp vụ, truy vấn qua `PrismaService` | Chỉ ghi bảng mình sở hữu |
| `index.ts` | Cửa duy nhất cho phân hệ khác | Xuất service và kiểu, không xuất controller |
| `*.service.spec.ts` | Kiểm thử đơn vị, Prisma giả | Tên bài ghi `UC-NN.m/ACk` |

## Hợp đồng công bố

Phân hệ khác lấy dữ liệu sản phẩm bằng cách tiêm `ProductsService` (import từ `./index.js`), không tự truy vấn bảng của Bảo. Đây là **nguồn duy nhất** về chữ ký các hàm dưới đây.

| Hàm | Ai gọi | Trạng thái |
|---|---|---|
| `list(query)` | Đường dẫn `GET /api/products` | **Đã cài** `sort`, `featured`, danh mục con ở `bee54a0` |
| `findBySlug(slug)` | Đường dẫn `GET /api/products/:slug` | **Đã cài** ảnh và biến thể ở `bee54a0` |
| `related(slug, limit)` | Đường dẫn `GET /api/products/:slug/related` | **Đã cài** ở `bee54a0` |
| `getVariantForCart(variantId)` | Duy, giỏ hàng (PH-02) | **Đã cài** ở `c7811ea`; `null` khi không có biến thể |
| `getVariantsForCart(variantIds)` | Duy, trang giỏ hàng nhiều dòng | **Đã cài** ở `c7811ea`; một truy vấn, giữ thứ tự đầu vào và bỏ ID không có |
| `importProducts(rows)` | Tài, nạp dữ liệu thật (HT-03, PH-03) | **Đã cài** ở [b2c8de0](https://github.com/F-R-E-Y-A/fashion-shop/commit/b2c8de0), kiểm dữ liệu bổ sung ở [eb8cc61](https://github.com/F-R-E-Y-A/fashion-shop/commit/eb8cc61) |

```ts
/** Du lieu mot bien the de hien trong gio. Hinh dang hen trong Issue #6 va #7, cong them productSlug. */
export interface VariantForCart {
  variantId: string;
  productId: string;
  productSlug: string; // de gio hang dan nguoc ve trang chi tiet
  name: string; // ten san pham
  variantLabel: string; // "M / Đen"; bo phan mac dinh: mu co FREE ra "Đen", bien the mac dinh ra ""
  price: string; // gia dang ban, chuoi Decimal; salePrice neu co, khong thi listPrice
  imageUrl: string | null; // anh cua mau do, khong co thi anh dai dien
  isActive: boolean; // false khi san pham hoac bien the ngung ban: gio hang bao "het ban"
}

getVariantForCart(variantId: string, transaction?: Prisma.TransactionClient): Promise<VariantForCart | null>;
getVariantsForCart(variantIds: string[], transaction?: Prisma.TransactionClient): Promise<VariantForCart[]>;

/** Mot san pham Tai nap tu staging (HT-03). Chay lai bao nhieu lan cung khong sinh ban trung. */
export interface ImportProductRow {
  sourceKey: string; // `${source}:${sourceProductId}` cua raw_product_records; tra lai nguyen trong ket qua
  name: string;
  categorySlug: string; // danh muc LA co san (CATEGORIES trong prisma/seed/catalog.seed.ts); khong tu tao
  brand?: { slug: string; name: string }; // chua co thi tao, co roi thi giu nguyen
  description?: string;
  material?: string;
  careInstructions?: string;
  attributes?: Record<string, unknown>; // thuoc tinh phu, khong loc
  images: { url: string; alt?: string; colorCode?: string }[]; // thu tu mang la sort_order, anh dau la anh dai dien
  variants: ImportVariantRow[]; // it nhat mot
}

export interface ImportVariantRow {
  sku: string; // khoa khop bien the; on dinh theo (san pham nguon, mau, co)
  color?: { code: string; name: string; hex?: string }; // bo trong la mau mac-dinh; ma chua co thi tao, co roi thi giu nguyen
  sizeCode?: string; // bo trong la co FREE; phai co san trong bang sizes
  listPrice: string; // chuoi Decimal, > 0
  salePrice?: string; // > 0 va < listPrice
}

export type ImportFailReason =
  | 'NO_VARIANT' // variants rong
  | 'INVALID_PRICE' // listPrice <= 0, hoac salePrice khong nam trong (0, listPrice)
  | 'DUPLICATE_COLOR_SIZE' // hai bien the cung mau cung co
  | 'CATEGORY_NOT_FOUND' // khong co danh muc slug nay, hoac danh muc khong phai la
  | 'SIZE_NOT_FOUND'
  | 'SKU_CONFLICT'; // SKU trung trong dong, hoac cac SKU thuoc tu hai san pham tro len

export type ImportRowResult =
  | { sourceKey: string; status: 'created' | 'updated'; productId: string; slug: string }
  | { sourceKey: string; status: 'failed'; reason: ImportFailReason; detail: string };

importProducts(rows: ImportProductRow[]): Promise<ImportRowResult[]>; // cung thu tu voi rows
```

Luật của `importProducts`, theo mô hình M2 ([erd.md](../../../../../docs/features/products/erd.md) luật 5, 6):

| # | Luật | Vì sao |
|---|---|---|
| 1 | **Nhận ra sản phẩm qua `sku`**: không `sku` nào của dòng có sẵn thì tạo sản phẩm mới; có và cùng thuộc một sản phẩm thì cập nhật sản phẩm đó; thuộc từ hai sản phẩm trở lên hoặc lặp SKU ngay trong dòng thì `SKU_CONFLICT`. Tài sinh `sku` ổn định từ nguồn, ví dụ `<SOURCE>-<sourceProductId>-<MAU>-<CO>` | Tên sản phẩm đổi giữa hai lần chạy vẫn nhận ra, mà không phải thêm cột nguồn vào bảng của Bảo |
| 2 | **`slug` sinh một lần khi tạo**: `slugify(name)` + `-` + 6 ký tự đầu của `sha1(sourceKey)`; cập nhật không đổi `slug` | Hai sản phẩm trùng tên không đụng nhau; đường dẫn cũ không gãy khi tên đổi |
| 3 | Cập nhật ghi đè tên, mô tả, danh mục, thương hiệu, giá. Biến thể có trong dòng thì bật `is_active = true`; biến thể cũ không còn trong dòng thì `is_active = false`, **không xoá**. `products.is_active` không đổi. `price_from` tính lại | Giỏ và đơn của Duy trỏ vào biến thể (luật 1 của erd.md); ẩn sản phẩm là quyết định của người, không phải của lần nạp |
| 4 | Ảnh ghi theo `(product_id, sort_order)` bằng thứ tự mảng, ảnh thừa bị xoá. `colorCode` không thuộc màu của dòng được lưu thành ảnh chung (`colorId = null`) | Ảnh không ai khác trỏ vào; ảnh không khớp màu vẫn dùng được |
| 5 | Danh mục và cỡ là **danh sách đóng**: không có thì dòng lỗi, không tự tạo. Thương hiệu và màu là **danh sách mở**: chưa có thì tạo, có rồi giữ nguyên tên | Danh mục có cây, cỡ có thứ tự: tự tạo sẽ lệch menu và nút cỡ. Một dòng nạp không được sửa tên màu mà sản phẩm khác đang dùng |
| 6 | **Mỗi dòng một giao dịch**; dòng lỗi không kéo dòng khác. Hàm không ghi bảng `staging` | Tài đánh dấu `IMPORTED` cho dòng `created`, `updated` trong giao dịch của mình. Nếu chết giữa hai bước thì chạy lại: luật 1 làm lần sau thành cập nhật, không sinh bản trùng |

Đổi chữ ký một hàm đã công bố thì báo ở buổi chốt Thứ Tư và ghi một mục vào `docs/features/products/LOG.md`.

PH-11 bổ sung transaction tuỳ chọn cho hai hàm đọc biến thể: Cart truyền transaction đang giữ khoá owner để đọc Catalog, ghi giỏ và dựng phản hồi cùng giao dịch; không truyền thì giữ cách gọi cũ. Lỗi truy vấn được truyền về caller, không tạo sản phẩm hay giá giả. Xem [ADR-026](../../../../../docs/LOG.md#adr-026).

Catalog đọc tồn khả dụng qua cửa `inventory/index.ts`. Danh sách, tìm kiếm, gợi ý, sản phẩm liên quan và chi tiết nhận trạng thái tồn; chi tiết có tồn từng biến thể. Thiếu bản ghi Inventory nghĩa là chưa biết tồn, không đồng nghĩa hết hàng. SSE chỉ gửi revision công khai; Swagger là nguồn hình dạng HTTP.

## Tìm kiếm, lọc và gợi ý (PH-01 đợt 2)

Thư mục `search/` chứa toàn bộ phần tìm kiếm. **`CatalogSearchService` và mọi thứ trong `search/` không phải hợp đồng công bố**: `index.ts` không xuất chúng, phân hệ khác không được gọi. Lý do và số đo: [ADR-019](../../../../../docs/features/products/LOG.md#adr-019).

| Tệp | Vai trò |
|---|---|
| `normalize-vi.ts`, `color-family.ts`, `price-buckets.ts`, `dictionary.ts`, `parse-query.ts`, `catalog-engine.ts`, `audience.ts` | Hàm thuần: đọc câu, họ màu, mốc giá, từ điển, lọc và xếp hạng. Mỗi tệp có `.spec.ts`; `golden-queries.json` là 47 câu mẫu |
| `uses-search-engine.ts` | Hàm thuần: query có tham số nào cần đường tìm kiếm không |
| `catalog-search.service.ts` | Nạp sản phẩm hiển thị, chạy bộ máy, dựng `interpretation`, `relaxed`, `facets`; ghi `search_query_logs` không chờ |
| `search-dictionary.service.ts` | Đọc từ điển mở rộng từ `search_configurations`, nhớ tạm 60 giây |
| `suggest-rate-limit.service.ts` | 60 lần mỗi phút mỗi IP; Redis lỗi thì cho qua |
| `search.controller.ts` | `GET /api/search/suggest` |

`GET /api/products` chọn đường theo `usesSearchEngine(query)` ([products.controller.ts:38](products.controller.ts#L38)): có `search` hoặc một tham số lọc thì đi qua `CatalogSearchService`, không thì giữ đường liệt kê cũ của `ProductsService`.

### Từ điển mở rộng `synonyms.v1`

Thêm dịp mặc mà không sửa mã: chèn một dòng vào `search_configurations` với `configuration_key = 'synonyms.v1'`. Từ điển đọc lại sau tối đa 60 giây (hoặc `SearchDictionaryService.invalidate()` trong kiểm thử). JSON sai hình dạng thì dùng từ điển trong mã và cảnh báo một lần.

```json
{
  "occasions": [
    {
      "value": "dam-cuoi",
      "label": "Dịp: đám cưới",
      "triggers": ["đám cưới", "dam cuoi"],
      "terms": ["lụa", "linen"]
    }
  ]
}
```

- `triggers`: cụm khách gõ (có dấu hay không dấu) để nhận ra dịp; `label` hiện trong chip "Đã hiểu".
- `terms`: các từ cần thấy trong tên, danh mục, màu hoặc mô tả sản phẩm; một dịp là HOẶC giữa các `terms`.
- Kiểm thử: [catalog-search.http.spec.ts](../../../test/catalog-search.http.spec.ts) bài "dip mac them trong search_configurations".
