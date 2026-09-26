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
| `list(query)` | Đường dẫn `GET /api/products` | Đã có; PH-01 thêm `sort`, `featured`, danh mục con |
| `findBySlug(slug)` | Đường dẫn `GET /api/products/:slug` | Đã có; PH-01 thêm ảnh và biến thể |
| `getVariantForCart(variantId)` | Duy, giỏ hàng (PH-02) | **Đã cài** ở `c7811ea`; `null` khi không có biến thể |
| `getVariantsForCart(variantIds)` | Duy, trang giỏ hàng nhiều dòng | **Đã cài** ở `c7811ea`; một truy vấn, giữ thứ tự đầu vào và bỏ ID không có |
| `importProducts(rows)` | Tài, nạp dữ liệu thật (HT-03, PH-03) | **Hẹn**, chữ ký dưới đây, cài đặt 26/09 |

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

getVariantForCart(variantId: string): Promise<VariantForCart | null>; // null khi khong co bien the do
getVariantsForCart(variantIds: string[]): Promise<VariantForCart[]>; // mot truy van cho ca gio

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
  | 'SKU_CONFLICT'; // cac sku cua dong thuoc tu hai san pham tro len

export type ImportRowResult =
  | { sourceKey: string; status: 'created' | 'updated'; productId: string; slug: string }
  | { sourceKey: string; status: 'failed'; reason: ImportFailReason; detail: string };

importProducts(rows: ImportProductRow[]): Promise<ImportRowResult[]>; // cung thu tu voi rows
```

Luật của `importProducts`, theo mô hình M2 ([erd.md](../../../../../docs/features/products/erd.md) luật 5, 6):

| # | Luật | Vì sao |
|---|---|---|
| 1 | **Nhận ra sản phẩm qua `sku`**: không `sku` nào của dòng có sẵn thì tạo sản phẩm mới; có và cùng thuộc một sản phẩm thì cập nhật sản phẩm đó; thuộc từ hai sản phẩm trở lên thì `SKU_CONFLICT`. Tài sinh `sku` ổn định từ nguồn, ví dụ `<SOURCE>-<sourceProductId>-<MAU>-<CO>` | Tên sản phẩm đổi giữa hai lần chạy vẫn nhận ra, mà không phải thêm cột nguồn vào bảng của Bảo |
| 2 | **`slug` sinh một lần khi tạo**: `slugify(name)` + `-` + 6 ký tự đầu của `sha1(sourceKey)`; cập nhật không đổi `slug` | Hai sản phẩm trùng tên không đụng nhau; đường dẫn cũ không gãy khi tên đổi |
| 3 | Cập nhật ghi đè tên, mô tả, danh mục, thương hiệu, giá. Biến thể có trong dòng thì bật `is_active = true`; biến thể cũ không còn trong dòng thì `is_active = false`, **không xoá**. `products.is_active` không đổi. `price_from` tính lại | Giỏ và đơn của Duy trỏ vào biến thể (luật 1 của erd.md); ẩn sản phẩm là quyết định của người, không phải của lần nạp |
| 4 | Ảnh ghi theo `(product_id, sort_order)` bằng thứ tự mảng, ảnh thừa bị xoá. `colorCode` của ảnh phải là màu có trong `variants` của dòng | Ảnh không ai khác trỏ vào |
| 5 | Danh mục và cỡ là **danh sách đóng**: không có thì dòng lỗi, không tự tạo. Thương hiệu và màu là **danh sách mở**: chưa có thì tạo, có rồi giữ nguyên tên | Danh mục có cây, cỡ có thứ tự: tự tạo sẽ lệch menu và nút cỡ. Một dòng nạp không được sửa tên màu mà sản phẩm khác đang dùng |
| 6 | **Mỗi dòng một giao dịch**; dòng lỗi không kéo dòng khác. Hàm không ghi bảng `staging` | Tài đánh dấu `IMPORTED` cho dòng `created`, `updated` trong giao dịch của mình. Nếu chết giữa hai bước thì chạy lại: luật 1 làm lần sau thành cập nhật, không sinh bản trùng |

Đổi chữ ký một hàm đã công bố thì báo ở buổi chốt Thứ Tư và ghi một mục vào `docs/features/products/LOG.md`.
