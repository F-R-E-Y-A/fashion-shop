---
title: Khám phá sản phẩm — nhật ký quyết định và thay đổi
updated: 2026-09-25
status: đang dùng
owner: Bảo
---
# Khám phá sản phẩm — nhật ký (chỉ thêm vào cuối)

Quyết định và thay đổi đáng nhớ của feature `products`, mới nhất ở cuối. Khuôn: [LOG-entry.md](../../shared/templates/LOG-entry.md). Quyết định chạm cả nhóm ở [docs/LOG.md](../../LOG.md).

---

## 2026-09-13 · Module mẫu `products` dựng làm khuôn cho cả nhóm

**Loại:** thay đổi mã · **Phạm vi:** `modules/products`, `features/products` · **Commit:** [060abea](https://github.com/F-R-E-Y-A/fashion-shop/commit/060abea), [c9a015a](https://github.com/F-R-E-Y-A/fashion-shop/commit/c9a015a)

Hai bảng `categories`, `products`, hai đường dẫn liệt kê và xem một sản phẩm, trang danh sách và trang chi tiết tối giản, bốn bài đơn vị và năm bài HTTP. Dựng để hai bạn chép khuôn bốn tầng, **không phải mô hình thật**: giá nằm trên sản phẩm, chưa có biến thể và ảnh. PH-01 viết lại theo sơ đồ quan hệ thực thể của feature.

---

<a id="adr-007"></a>
## 2026-09-25 · ADR-007 — Biến thể là đơn vị bán; màu, cỡ, thương hiệu là bảng tra cứu

**Loại:** quyết định · **Phạm vi:** `catalog.prisma`, sơ đồ [erd.md](erd.md); ảnh hưởng giỏ hàng và tồn kho (Duy), nạp dữ liệu và sơ đồ tổng (Tài) · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi PH-01 tạo migration)

### Hiện trạng

- Bảo chốt hướng ngày 24/09: sửa ERD và use case cho chuẩn trước, rồi viết lại mã. Module `products` hiện là bản demo hai bảng, giá và ảnh nằm trên sản phẩm ([catalog.prisma](../../../apps/api/prisma/schema/catalog.prisma)), nên mô hình không bị ràng buộc bởi mã cũ.
- Ba nguồn nói về mô hình, theo hai kiểu:
  - Issue #6 (PH-01) và #7 (PH-02): *biến thể theo cỡ và màu, mỗi biến thể một giá và một mã hàng*; dòng giỏ hàng trỏ khoá ngoại sang biến thể; hợp đồng `getVariantForCart(variantId)`. Ví dụ trong [orders.prisma](../../../apps/api/prisma/schema/orders.prisma) khoá tồn kho theo `variantId`.
  - Đặc tả UC-03 của Duy trong pull request #9 (chưa gộp) dùng **ba tầng**: sản phẩm → biến thể theo màu → `SKUS` theo cỡ, cộng bảng `COLORS`, `SIZES`, `BRANDS`. Bảng kế hoạch nhóm chỉ ghi "sản phẩm, biến thể, danh mục"; không tệp kế hoạch nào có `SKUS`.
- Nếu cỡ và màu là **cột chữ** trên biến thể thì có ba chỗ hỏng: nút cỡ sắp theo chữ ra `L, M, S, XL` (UC-03.4 cần `S, M, L, XL`); "Đen", "đen", "Black" thành ba màu khi lọc (UC-03.3/BR2 lọc theo mã màu); thương hiệu gõ tự do thì không lọc được, mà dữ liệu thật của Tài có từ 10 thương hiệu trở lên (kế hoạch, E4).

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Hai tầng, cỡ và màu là cột chữ | Ít bảng nhất | Ba chỗ hỏng ở trên | Được |
| B. Ba tầng như đặc tả của Duy: biến thể theo màu, `skus` theo cỡ | Ảnh gắn tự nhiên vào biến thể màu | Hai cấp để chọn một món hàng; giỏ, tồn kho, đơn phải trỏ vào `sku`; Duy đang viết giỏ theo `variantId` | Khó khi đã có đơn |
| **C. Hai tầng, cộng bảng tra cứu `colors`, `sizes`, `brands` (chọn)** | Một mã biến thể mang giá, hợp đồng với Duy không đổi; thứ tự cỡ, ô màu, bộ lọc đều đúng; ERD chuẩn hoá, không lặp dữ liệu màu và cỡ | Thêm ba bảng nhỏ; nạp dữ liệu phải quy tên màu, cỡ, thương hiệu ra mã | Được: gộp lại thành cột chữ là một migration |

**Chọn C.** Lấy phần đúng của B (màu, cỡ, thương hiệu là thực thể riêng; ảnh theo màu qua `product_images.color_id`) mà không đổi đơn vị bán. Bảng `skus` trong đặc tả của Duy chính là `product_variants` ở đây. Sơ đồ, cột, ràng buộc, chỉ mục ở [erd.md](erd.md); `products.price_from` giữ giá bán thấp nhất để sắp xếp theo giá, chỉ service `products` ghi.

Giá bán của một biến thể = `sale_price` nếu có, không thì `list_price`; ràng buộc `CHECK` bảo đảm `sale_price < list_price` (UC-03.1/BR2, UC-03.4/BR4). Tồn kho không nằm ở đây: bảng của Duy khoá theo `variant_id`.

### Kết quả mong đợi → thực tế

Mong đợi: bảy bảng như [erd.md](erd.md); `npm run db:drift -w apps/api` trả 0; `GET /api/products/<slug>` trả ít nhất hai cỡ và hai màu cho một sản phẩm mẫu, nút cỡ đúng thứ tự `sort_order`; `getVariantForCart` đúng hình dạng Issue #7 hẹn; `importProducts` chạy hai lần không sinh màu, cỡ, thương hiệu trùng.
Thực tế: (điền khi PH-01 gộp).

### Điều kiện xem lại

Khi một loại hàng cần thuộc tính biến thể khác màu và cỡ (ví dụ độ dài quần), xem có cần bảng thuộc tính tổng quát.

---

<a id="adr-008"></a>
## 2026-09-25 · ADR-008 — API của PH-01 đi theo quy ước chung: đường dẫn phẳng, hình dạng `Page`, `camelCase`

**Loại:** quyết định · **Phạm vi:** đường dẫn `/api/products`, `/api/categories` · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi PH-01 cài đặt)

### Hiện trạng

Bảng *Hợp đồng API* trong đặc tả UC-03 của Duy (pull request #9) viết trước khi có quy ước: `GET /api/categories/:slug/products`, trả `{ data, meta }`, trường `snake_case`, `?limit`, lỗi `422 query_too_short`. Mã và quy ước đã có từ 19/09: một đường dẫn liệt kê có bộ lọc bằng tham số, trả `{ items, total, page, pageSize, totalPages }` qua `toPage()` ([page.response.ts:18-31](../../../apps/api/src/common/pagination/page.response.ts#L18)), trường `camelCase`, dữ liệu vào sai trả 400 ([shared/api.md](../../shared/api.md)). Bài HTTP hiện có đã kiểm `?categorySlug=ao`.

### Phương án

| Phương án | Được gì | Mất gì |
|---|---|---|
| **A. Theo quy ước: `GET /api/products?categorySlug=&sort=&featured=`; danh mục riêng ở `GET /api/categories/:slug` (chọn)** | Một đường dẫn liệt kê dùng cho trang chủ, trang danh mục và tìm kiếm sau này; giao diện chỉ học một hình dạng; khớp mã và bài kiểm thử đang có | Đặc tả phải chỉnh theo; đã chỉnh trong [use-cases.md](use-cases.md) |
| B. Theo đặc tả gốc: đường dẫn lồng, `{ data, meta }`, `snake_case` | Đúng chữ đặc tả | Hai hình dạng phân trang trong một hệ thống; phá quy ước ba người đã chép |

**Chọn A.** Luồng, luật và tiêu chí chấp nhận của đặc tả giữ nguyên; chỉ hình dạng đổi. Ba hệ quả cho tiêu chí:

- **UC-03.1/AC5** (danh mục không tồn tại trả 404) kiểm ở `GET /api/categories/:slug`. Liệt kê với `categorySlug` lạ trả danh sách rỗng, vì bộ lọc không khớp gì không phải là lỗi.
- **UC-03.1/AC3** đổi tên trường sang `camelCase`; điểm đánh giá trung bình để sau, khi feature đánh giá của Tài có hàm công bố.
- **UC-03.2/E2** (từ khoá quá ngắn) trả **400** chứ không phải 422, vì đó là dữ liệu vào sai hình dạng chứ không phải phạm luật nghiệp vụ.

### Kết quả mong đợi → thực tế

Mong đợi: Swagger `/api/docs` có đủ các đường dẫn ở mục API của [README](README.md); bài HTTP mang tên `UC-03.x/ACk` xanh. Cài xong đường dẫn nào thì xoá dòng đó khỏi mục API trong README.
Thực tế: (điền khi PH-01 gộp).

### Điều kiện xem lại

Nếu tìm kiếm (UC-03.2) chuyển sang Meilisearch và cần hình dạng kết quả riêng, như điểm liên quan hay đoạn tô sáng.

---

## 2026-09-25 · Hồ sơ phản biện ADR-007 và ADR-008

**Loại:** phản biện, bổ sung · **Phạm vi:** [ADR-007](#adr-007), [ADR-008](#adr-008) · **Công cụ AI:** Claude Code (Opus 5.5)

### ADR-007 — mô hình danh mục

| Bên | Nội dung | Kết cục |
|---|---|---|
| Người phản biện | Bảo, 24/09: mã hiện có chỉ là bản demo; sửa ERD và use case cho chuẩn rồi viết lại mã; tận dụng ý hay trong PR #9 của Duy | Mô hình quyết bằng ERD, không bằng mã cũ |
| AI gợi ý lần đầu | Hai tầng, cỡ và màu là **cột chữ** trên biến thể (bản nháp 24/09, không đẩy lên GitHub) | Bỏ |
| AI sai | H-13: bản nháp đó bỏ sót ba chỗ: nút cỡ sắp theo chữ ra `L, M, S, XL`; một màu gõ nhiều kiểu thành nhiều màu khi lọc; thương hiệu chữ tự do không lọc được | AI tự bắt khi dựng từ điển dữ liệu cho ERD |
| Ý của Duy (PR #9) | Ba tầng: biến thể theo màu, `SKUS` theo cỡ, bảng `COLORS`, `SIZES`, `BRANDS` | Giữ ý màu, cỡ, thương hiệu là thực thể riêng; bỏ tầng `SKUS` để đơn vị bán vẫn là biến thể |
| Ý của Tài (PR #11) | Hai tầng, `size` và `color` là chữ cho phép null, một cột `price`; ràng buộc duy nhất viết tay `NULLS NOT DISTINCT` | Làm CI chặng 4 đỏ vì Prisma không mô tả được ràng buộc đó; màu, cỡ là khoá ngoại bắt buộc như ADR-007 thì dùng `@@unique` thường, hết lệch |

**Kết luận:** đề xuất phương án C của ADR-007, chờ Bảo chốt. **Bằng chứng:** [erd.md:159 @3206aa0](https://github.com/F-R-E-Y-A/fashion-shop/blob/3206aa0/docs/features/products/erd.md#L159) (`sizes.sort_order`), [uc-ph03:12 @fe21833](https://github.com/F-R-E-Y-A/fashion-shop/blob/fe21833/docs/ba/uc-ph03-kham-pha-san-pham.md#L12) (mô hình của Duy), [catalog.prisma:42 @be97e0e](https://github.com/F-R-E-Y-A/fashion-shop/blob/be97e0e/apps/api/prisma/schema/catalog.prisma#L42) (mô hình của Tài); log CI chặng 4 của PR #11: `Removed unique index on columns (product_id, size, color)`.

### ADR-008 — hình dạng API

| Bên | Nội dung | Kết cục |
|---|---|---|
| Câu hỏi phản biện | Bảo: mã hiện có chỉ là demo, viết lại cũng được | AI tách hai loại: bảng, service, trang của `products` là demo và viết lại tự do; quy ước `Page`, khuôn lỗi, trả 400 khi dữ liệu vào sai là **nền tảng** hai bạn đang chép, đổi thì phải có ADR |
| AI gợi ý | Không tạo `/api/products/search` mà dùng tham số `search` đã có của đường dẫn liệt kê | Giữ |
| AI (suy luận) | Nếu khai `/api/products/search` sau `@Get(':slug')` thì chữ `search` bị hiểu là một slug, theo thứ tự khớp đường dẫn của Express | Chưa chạy thử; lý do chính vẫn là tránh hai đường liệt kê |

**Kết luận:** đề xuất theo quy ước chung, chờ Bảo chốt. **Bằng chứng:** [list-products.query.ts:15 @58f45e9](https://github.com/F-R-E-Y-A/fashion-shop/blob/58f45e9/apps/api/src/modules/products/dto/list-products.query.ts#L15), [products.controller.ts:29 @58f45e9](https://github.com/F-R-E-Y-A/fashion-shop/blob/58f45e9/apps/api/src/modules/products/products.controller.ts#L29), [use-cases.md:103 @3206aa0](https://github.com/F-R-E-Y-A/fashion-shop/blob/3206aa0/docs/features/products/use-cases.md#L103).
