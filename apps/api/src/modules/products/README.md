# Phân hệ `products` — module mẫu

**Chủ sở hữu:** Bảo · **Dòng việc:** PH-03 (S2–S3), PH-14 (S8) · **Bảng:** `categories`, `products` trong `prisma/schema/catalog.prisma`.

Đây là module MẪU. Làm phân hệ mới thì chép cả thư mục này, đổi tên, giữ đúng bốn tầng:

| Tệp | Vai trò | Luật |
|---|---|---|
| `dto/*.query.ts`, `dto/*.response.ts` | Hình dạng vào và ra, có chú thích Swagger | Không import Prisma |
| `*.controller.ts` | Nhận HTTP, kiểm dữ liệu vào, gọi service | Không import Prisma, không có logic |
| `*.service.ts` | Nghiệp vụ, truy vấn qua `PrismaService` | Chỉ ghi bảng mình sở hữu |
| `index.ts` | Cửa duy nhất cho phân hệ khác | Xuất service và kiểu, không xuất controller |
| `*.service.spec.ts` | Kiểm thử đơn vị, Prisma giả | Tên bài ghi `PH-xx/AC-n` |

## Hợp đồng công bố

Phân hệ khác lấy dữ liệu sản phẩm bằng cách tiêm `ProductsService` (import từ `./index.js`), không tự truy vấn bảng `products`.

| Hàm | Ý nghĩa | Trạng thái |
|---|---|---|
| `list(query)` | Liệt kê sản phẩm đang bán, phân trang, lọc theo tên và danh mục | Đã có |
| `findBySlug(slug)` | Một sản phẩm theo đường dẫn rút gọn, 404 nếu không có | Đã có |
| `getVariants(productId)` | Biến thể theo kích cỡ, màu, giá | PH-03 S3 |
| `importProducts(rows)` | Nạp hàng loạt từ dữ liệu cào (Tài gọi ở HT-03) | S2 |

Đổi chữ ký một hàm đã công bố thì báo ở buổi chốt Thứ Tư và ghi vào `docs/ba/uc-03-*.md`.
