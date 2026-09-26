# PH-03 · Khám phá sản phẩm

> Chép từ `uc-template.md`. Người viết đặc tả: **Phan Ngọc Duy** (HT-04).
> Người viết mã: **Phan Ngọc Duy** (sprint 2).

| | |
|---|---|
| **Thuộc dòng việc** | PH-03, sprint S2 |
| **Người viết** | Phan Ngọc Duy (HT-04) |
| **Tác nhân chính** | Khách vãng lai (Khách hàng thừa kế) |
| **Tác nhân phụ** | — |
| **Bảng CSDL** | `PRODUCTS`, `PRODUCT_VARIANTS`, `PRODUCT_IMAGES`, `SKUS`, `CATEGORIES`, `BRANDS`, `COLORS`, `SIZES`, `SIZE_GUIDES`, `SIZE_GUIDE_ROWS`, `PRODUCT_RELATIONS`, `REVIEWS` |
| **Trạng thái** | Đã duyệt |

---

## PH-03.1 · Duyệt danh mục sản phẩm

### Câu chuyện người dùng

Là một **khách vãng lai**, tôi muốn **duyệt danh mục sản phẩm theo nhóm (áo, quần, váy đầm, …)**, để **khám phá hàng mà không cần biết tên cụ thể**.

### Điều kiện trước

- Có ít nhất một `CATEGORIES` và `PRODUCTS` đang hoạt động (`status = 'active'`).

### Điều kiện sau

- Danh sách sản phẩm được hiện, phân trang.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Truy cập trang chủ hoặc chọn một danh mục từ menu | |
| 2 | | Trả danh sách sản phẩm thuộc danh mục (và danh mục con), phân trang 20 SP/trang |
| 3 | | Mỗi SP hiện: ảnh chính, tên, giá niêm yết, giá khuyến mãi (nếu có), điểm đánh giá trung bình |
| 4 | Cuộn xuống / chuyển trang | Tải thêm hoặc hiện trang kế |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Danh mục không tồn tại | Trả 404 `category_not_found` |
| E2 | Danh mục không có sản phẩm | Trả danh sách rỗng, hiện thông báo "Chưa có sản phẩm" |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Chỉ hiện sản phẩm `status = 'active'`; biến thể `status = 'active'` |
| BR2 | Giá hiện là `SKUS.sale_price` nếu < `list_price`, ngược lại hiện `list_price` |
| BR3 | Danh mục cha hiện cả sản phẩm của danh mục con (đệ quy theo `parent_id`) |
| BR4 | Mặc định sắp xếp theo `PRODUCTS.created_at DESC` |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/categories` | — | `[Category]` (cây phân cấp) | — |
| GET | `/api/categories/:slug/products` | `?page, ?limit, ?sort` | `{ data: [ProductCard], meta: { total, page } }` | 404 |

### Dữ liệu

- **Đọc:** `CATEGORIES` (id, parent_id, name, slug, status)
- **Đọc:** `PRODUCTS` (id, name, slug, status, category_id)
- **Đọc:** `PRODUCT_VARIANTS` (id, product_id, status)
- **Đọc:** `PRODUCT_IMAGES` (url, is_primary, variant_id)
- **Đọc:** `SKUS` (list_price, sale_price, status)
- **Tổng hợp:** AVG rating từ `REVIEWS`

### Tiêu chí chấp nhận

- [ ] GET `/api/categories/:slug/products` trả đúng sản phẩm thuộc danh mục và danh mục con
- [ ] Sản phẩm `status = 'inactive'` không xuất hiện
- [ ] Mỗi phần tử trả về có: `id, name, slug, image_url, list_price, sale_price, avg_rating`
- [ ] Phân trang: `?page=1&limit=20` hoạt động đúng; `meta.total` khớp COUNT
- [ ] Danh mục không tồn tại trả 404

---

## PH-03.2 · Tìm kiếm sản phẩm

### Câu chuyện người dùng

Là một **khách vãng lai**, tôi muốn **nhập từ khoá tìm kiếm và thấy danh sách sản phẩm liên quan**, để **nhanh chóng tìm được sản phẩm cụ thể tôi muốn mua**.

### Điều kiện trước

- Có sản phẩm trong hệ thống.

### Điều kiện sau

- Kết quả tìm kiếm được trả về, phân trang.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhập từ khoá vào ô tìm kiếm, nhấn Enter hoặc bấm biểu tượng kính lúp | |
| 2 | | Tìm kiếm full-text trong `PRODUCTS.name`, `description`, `BRANDS.name`, `CATEGORIES.name` |
| 3 | | Trả danh sách sản phẩm khớp, phân trang 20 SP/trang, sắp theo độ liên quan |
| 4 | Nhập thêm / thay đổi từ khoá | Cập nhật kết quả (debounce 300ms) |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Không có kết quả | Trả danh sách rỗng, gợi ý danh mục phổ biến |
| E2 | Từ khoá < 2 ký tự | Trả 422 `query_too_short` |
| E3 | Từ khoá > 200 ký tự | Trả 422 `query_too_long` |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Tìm kiếm không phân biệt chữ hoa / thường |
| BR2 | Sprint 2: dùng PostgreSQL `ILIKE` hoặc `to_tsvector`; không yêu cầu Elasticsearch ở giai đoạn này |
| BR3 | Chỉ trả sản phẩm `status = 'active'` |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/products/search` | `?q, ?page, ?limit` | `{ data: [ProductCard], meta }` | 422 |

### Tiêu chí chấp nhận

- [ ] GET `/api/products/search?q=áo` trả sản phẩm có "áo" trong tên hoặc mô tả
- [ ] `q` dưới 2 ký tự trả 422 `query_too_short`
- [ ] Không có kết quả trả `data: []` và `meta.total = 0`
- [ ] Sản phẩm `inactive` không xuất hiện trong kết quả

---

## PH-03.3 · Lọc và sắp xếp sản phẩm

> **Quan hệ UML:** `<<extend>>` PH-03.1 và PH-03.2

### Câu chuyện người dùng

Là một **khách vãng lai**, tôi muốn **lọc sản phẩm theo giá, màu sắc, kích cỡ và sắp xếp theo tiêu chí**, để **thu hẹp nhanh danh sách tới những sản phẩm phù hợp**.

### Điều kiện trước

- Người dùng đang xem danh mục (PH-03.1) hoặc kết quả tìm kiếm (PH-03.2).

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Chọn bộ lọc: khoảng giá, màu sắc, kích cỡ, thương hiệu | |
| 2 | Chọn sắp xếp: Mới nhất, Giá tăng dần, Giá giảm dần, Phổ biến nhất | |
| 3 | | Áp dụng filter + sort vào query hiện tại; trả kết quả mới |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Lọc giá theo `SKUS.sale_price` (hoặc `list_price` nếu không có sale) |
| BR2 | Lọc màu theo `COLORS.code`; lọc size theo `SIZES.code` |
| BR3 | Nhiều bộ lọc cùng loại là OR (ví dụ: màu đỏ OR màu xanh); khác loại là AND |
| BR4 | "Phổ biến nhất" sắp xếp theo tổng `ORDER_ITEMS.quantity` 30 ngày gần nhất |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/categories/:slug/products` | `?min_price, ?max_price, ?colors[], ?sizes[], ?brands[], ?sort` | `{ data, meta, filters_available }` | 404, 422 |

### Tiêu chí chấp nhận

- [ ] Lọc `?min_price=100000&max_price=500000` chỉ trả SP có giá trong khoảng
- [ ] Lọc `?colors[]=red&colors[]=blue` trả SP có biến thể màu đỏ HOẶC xanh
- [ ] Lọc `?sizes[]=M` chỉ trả SP có SKU size M còn hàng (`INVENTORIES.on_hand > 0`)
- [ ] `sort=price_asc` sắp xếp đúng chiều tăng dần theo giá

---

## PH-03.4 · Xem chi tiết sản phẩm

### Câu chuyện người dùng

Là một **khách vãng lai**, tôi muốn **xem đầy đủ thông tin một sản phẩm cụ thể bao gồm ảnh, mô tả, giá, màu sắc và kích cỡ có sẵn**, để **quyết định có mua không**.

### Điều kiện trước

- Sản phẩm tồn tại với `status = 'active'`.

### Điều kiện sau

- Thông tin sản phẩm được hiển thị; không có thay đổi dữ liệu.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhấn vào sản phẩm từ danh sách | |
| 2 | | Trả thông tin đầy đủ: tên, mô tả, chất liệu, hướng dẫn bảo quản, giá, thương hiệu, danh mục |
| 3 | | Trả danh sách biến thể theo màu, ảnh theo biến thể |
| 4 | | Trả danh sách size cho từng biến thể và tồn kho (`on_hand - reserved`) |
| 5 | | Trả tóm tắt đánh giá (AVG rating, tổng lượt) |
| 6 | Chọn màu | Hiện ảnh và size tương ứng biến thể đó |
| 7 | Chọn size | Hiện trạng thái tồn kho (còn hàng / sắp hết / hết hàng) |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Tồn kho hiển thị = `INVENTORIES.on_hand - INVENTORIES.reserved` |
| BR2 | Cảnh báo "sắp hết" khi tồn kho ≤ `INVENTORIES.reorder_level` |
| BR3 | Size hết hàng vẫn hiện nhưng bị mờ và không cho chọn |
| BR4 | Giá hiện: nếu `sale_price < list_price` thì gạch `list_price` và làm nổi `sale_price` |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/products/:slug` | — | `{ product, variants: [{ color, images, skus: [{ size, list_price, sale_price, stock }] }], review_summary }` | 404 |

### Dữ liệu

- **Đọc:** `PRODUCTS`, `PRODUCT_VARIANTS`, `PRODUCT_IMAGES`, `SKUS`, `INVENTORIES`
- **Đọc:** `COLORS`, `SIZES`, `BRANDS`, `CATEGORIES`
- **Tổng hợp:** `REVIEWS` (avg rating, count)

### Tiêu chí chấp nhận

- [ ] GET `/api/products/:slug` trả đủ các trường: tên, mô tả, biến thể, SKU, tồn kho, rating
- [ ] Sản phẩm `inactive` trả 404
- [ ] Tồn kho = `on_hand - reserved`; giá trị không âm
- [ ] SKU hết hàng (`stock = 0`) vẫn xuất hiện trong response với `stock: 0`
- [ ] Slug không tồn tại trả 404 `product_not_found`

---

## PH-03.5 · Xem hướng dẫn chọn size

### Câu chuyện người dùng

Là một **khách vãng lai**, tôi muốn **xem bảng hướng dẫn chọn size của sản phẩm**, để **chọn đúng size mà không cần đo thử**.

### Điều kiện trước

- Sản phẩm thuộc danh mục có `SIZE_GUIDES` liên kết.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhấn "Xem hướng dẫn size" trên trang chi tiết sản phẩm | |
| 2 | | Tìm `SIZE_GUIDES` theo `brand_id` hoặc `category_id` |
| 3 | | Hiện bảng `SIZE_GUIDE_ROWS`: cột size code, ngực, eo, hông, chiều cao tối thiểu/tối đa |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Không có bảng size cho sản phẩm / danh mục này | Ẩn nút "Xem hướng dẫn size" |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/products/:slug/size-guide` | — | `{ guide: { name, unit, rows: [{size_code, chest, waist, hip, height_min, height_max}] } \| null }` | 404 |

### Tiêu chí chấp nhận

- [ ] GET trả bảng size đúng cho sản phẩm (ưu tiên `brand_id`, fallback `category_id`)
- [ ] Không có bảng size: trả `guide: null`, không trả 404
- [ ] Đơn vị đo (`cm` hoặc `inch`) được trả trong `unit`

---

## Câu hỏi còn treo

1. Tìm kiếm sprint 2 dùng PostgreSQL `tsvector` hay `ILIKE`? (Ảnh hưởng performance khi dữ liệu > 1000 SP)
2. "Phổ biến nhất" tính trong 30 ngày — nếu không có đơn hàng nào thì fallback là gì?
3. `FIT_PROFILES` có được dùng để gợi ý size trong PH-03.4 ngay ở sprint 2 không, hay để sprint sau?
4. Trang chi tiết có cần `recently_viewed` tracking không, hay dời sang sprint sau?
