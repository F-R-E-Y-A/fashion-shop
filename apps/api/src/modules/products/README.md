# Phân hệ `products` — module mẫu

**Chủ sở hữu:** Bảo · **Dòng việc:** PH-01 (Issue #6) · **Bảng:** `categories`, `products` trong `prisma/schema/catalog.prisma`; PH-01 thêm `brands`, `colors`, `sizes`, `product_variants`, `product_images` theo [erd.md](../../../../../docs/features/products/erd.md) · **Tài liệu feature:** [docs/features/products/](../../../../../docs/features/products/README.md)

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
| `getVariantForCart(variantId)` | Duy, giỏ hàng (PH-02) | **Hẹn**, chữ ký dưới đây, cài đặt 26/09 |
| `getVariantsForCart(variantIds)` | Duy, trang giỏ hàng nhiều dòng | **Hẹn**, cài đặt 26/09 |
| `importProducts(rows)` | Tài, nạp dữ liệu thật (HT-03, PH-03) | **Hẹn**, chữ ký dưới đây, cài đặt 26/09 |

```ts
/** Du lieu mot bien the de hien trong gio. Hinh dang hen trong Issue #6 va #7, cong them productSlug. */
export interface VariantForCart {
  variantId: string;
  productId: string;
  productSlug: string; // de gio hang dan nguoc ve trang chi tiet
  name: string; // ten san pham
  variantLabel: string; // "M / Đen"
  price: string; // gia dang ban, chuoi Decimal; salePrice neu co, khong thi listPrice
  imageUrl: string | null; // anh cua mau do, khong co thi anh dai dien
  isActive: boolean; // false khi san pham hoac bien the ngung ban: gio hang bao "het ban"
}

getVariantForCart(variantId: string): Promise<VariantForCart | null>; // null khi khong co bien the do
getVariantsForCart(variantIds: string[]): Promise<VariantForCart[]>; // mot truy van cho ca gio

/** Mot dong du lieu that Tai nap vao. Chay lai bao nhieu lan cung khong sinh ban trung. */
export interface ImportProductRow {
  slug: string; // khoa khop san pham
  name: string;
  description?: string;
  brand?: string;
  categorySlug: string; // danh muc phai co san
  images: { url: string; alt?: string; color?: string }[];
  variants: { sku: string; size: string; color: string; colorHex?: string; listPrice: string; salePrice?: string }[]; // sku la khoa khop bien the
}

importProducts(rows: ImportProductRow[]): Promise<{ created: number; updated: number; failed: { slug: string; reason: string }[] }>;
```

Đổi chữ ký một hàm đã công bố thì báo ở buổi chốt Thứ Tư và ghi một mục vào `docs/features/products/LOG.md`.
