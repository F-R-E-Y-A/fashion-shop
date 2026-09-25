---
title: UC-03 Khám phá sản phẩm — đặc tả use case
updated: 2026-09-24
status: đề xuất, chờ Bảo duyệt
owner: Bảo
---
# UC-03 · Khám phá sản phẩm

**Chức năng:** Khách tìm và xem sản phẩm thế nào: luồng, ngoại lệ, luật nghiệp vụ và tiêu chí chấp nhận của năm use case UC-03.1 tới UC-03.5.

| | |
|---|---|
| **Người viết đặc tả** | Phan Ngọc Duy (HT-04, 22/09); Bảo chỉnh ngày 24/09 theo [erd.md](erd.md) và [shared/api.md](../../shared/api.md) |
| **Người sở hữu mã** | Nguyễn Ngọc Thái Bảo, module `products` |
| **Dòng việc** | **PH-01** làm UC-03.1, UC-03.4 và phần sắp xếp của UC-03.3. UC-03.2, phần lọc của UC-03.3, UC-03.5 chưa giao |
| **Tác nhân chính** | Khách vãng lai (Khách hàng thừa kế) |
| **Dữ liệu** | Bảy bảng trong [erd.md](erd.md): `categories`, `brands`, `products`, `product_variants`, `product_images`, `colors`, `sizes` |

Cách đọc: luồng, luật và tiêu chí chấp nhận là **nguồn nghiệp vụ**. Mục *Đường dẫn API* chỉ ghi tên đường dẫn và lỗi; hình dạng vào ra theo quy ước chung, chi tiết đề xuất ở [README](README.md) mục API, cài xong thì Swagger `/api/docs` là nguồn. Lỗi không tìm thấy trả `404` với `code: NOT_FOUND`; dữ liệu vào sai trả `400`. Số `AC` giữ nguyên như bản của Duy để bài kiểm thử và báo cáo trích dẫn không đổi; tiêu chí nào chưa thuộc PH-01 ghi rõ.

---

## UC-03.1 · Duyệt danh mục sản phẩm

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **duyệt sản phẩm theo nhóm (áo, quần, váy đầm…)**, để **khám phá hàng mà không cần biết tên cụ thể**.

### Điều kiện trước
- Có ít nhất một danh mục và một sản phẩm đang bán.

### Điều kiện sau
- Danh sách sản phẩm được hiện, có phân trang. Không đổi dữ liệu.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Vào trang chủ hoặc chọn một danh mục từ menu | Hiện cây danh mục trên menu |
| 2 | | Trả sản phẩm thuộc danh mục và các danh mục con, mỗi trang 20 sản phẩm |
| 3 | | Mỗi sản phẩm hiện: ảnh đại diện, tên, thương hiệu, giá bán thấp nhất; có giảm giá thì kèm giá niêm yết gạch ngang |
| 4 | Chuyển trang | Hiện trang kế; số trang và sắp xếp nằm trên đường dẫn trang |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Danh mục không tồn tại hoặc đã ẩn | `GET /api/categories/:slug` trả 404; trang hiện "Không tìm thấy danh mục" |
| E2 | Danh mục không có sản phẩm | Trả danh sách rỗng; trang hiện "Chưa có sản phẩm" |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Chỉ hiện sản phẩm đang bán, thuộc danh mục đang hiện, và có ít nhất một biến thể đang bán ([erd.md](erd.md) luật dữ liệu 2) |
| BR2 | Giá bán của một biến thể là `sale_price` nếu có, không thì `list_price`. Thẻ sản phẩm hiện giá bán thấp nhất (`price_from`) |
| BR3 | Danh mục cha hiện cả sản phẩm của mọi danh mục con, theo `parent_id` |
| BR4 | Mặc định sắp xếp mới nhất trước |

### Đường dẫn API
| Phương thức | Đường dẫn | Việc | Lỗi |
|---|---|---|---|
| GET | `/api/categories` | Cây danh mục đang hiện | — |
| GET | `/api/categories/:slug` | Một danh mục kèm đường dẫn phân cấp từ gốc | 404 |
| GET | `/api/products?categorySlug=&page=&pageSize=&sort=` | Liệt kê có phân trang; `categorySlug` không khớp trả danh sách rỗng | 400 |

### Dữ liệu
Đọc `categories`, `products`, `product_variants`, `product_images`, `brands`. Không đọc bảng của người khác.

### Tiêu chí chấp nhận
- [ ] **AC1** `GET /api/products?categorySlug=<cha>` trả cả sản phẩm của danh mục con
- [ ] **AC2** Sản phẩm ngừng bán, hoặc không còn biến thể nào đang bán, không xuất hiện
- [ ] **AC3** Mỗi phần tử có `id, name, slug, brandName, imageUrl, price, listPrice`; `listPrice` khác `null` chỉ khi đang giảm giá. Điểm đánh giá trung bình **chưa thuộc PH-01**, thêm khi có hàm công bố của feature đánh giá
- [ ] **AC4** `?page=1&pageSize=20` trả đúng 20 dòng đầu; `total` khớp số sản phẩm thoả BR1
- [ ] **AC5** `GET /api/categories/<slug không có>` trả 404 `NOT_FOUND`

---

## UC-03.2 · Tìm kiếm sản phẩm — chưa giao

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **nhập từ khoá và thấy sản phẩm liên quan**, để **nhanh chóng tìm được thứ mình muốn mua**.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhập từ khoá, nhấn Enter hoặc bấm kính lúp | |
| 2 | | Tìm trong tên, mô tả, tên thương hiệu, tên danh mục |
| 3 | | Trả sản phẩm khớp, mỗi trang 20, xếp theo độ liên quan |
| 4 | Sửa từ khoá | Cập nhật kết quả sau 300 ms ngừng gõ |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Không có kết quả | Trả danh sách rỗng, gợi ý các danh mục gốc |
| E2 | Từ khoá dưới 2 ký tự | Trả 400 |
| E3 | Từ khoá quá 120 ký tự | Trả 400 (giới hạn hiện có trong DTO liệt kê) |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Không phân biệt chữ hoa, chữ thường |
| BR2 | Bản hiện tại tìm theo tên bằng `ILIKE`; tìm cả mô tả, thương hiệu, danh mục và chịu lỗi chính tả khi làm use case này |
| BR3 | Chỉ trả sản phẩm thoả UC-03.1/BR1 |

### Đường dẫn API
Dùng chung `GET /api/products?search=` đã có, không tạo `/api/products/search`: tránh hai đường liệt kê, và tránh chữ `search` bị hiểu thành một slug.

### Tiêu chí chấp nhận
- [ ] **AC1** `?search=áo` trả sản phẩm có "áo" trong tên (trong mô tả khi làm đủ BR2)
- [ ] **AC2** `search` dưới 2 ký tự trả 400
- [ ] **AC3** Không có kết quả trả `items: []`, `total: 0`
- [ ] **AC4** Sản phẩm ngừng bán không xuất hiện

---

## UC-03.3 · Lọc và sắp xếp sản phẩm — PH-01 làm phần sắp xếp

> **Quan hệ UML:** `<<extend>>` UC-03.1 và UC-03.2

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **lọc theo giá, màu, cỡ, thương hiệu và sắp xếp**, để **thu hẹp nhanh tới những sản phẩm hợp với mình**.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Chọn bộ lọc: khoảng giá, màu, cỡ, thương hiệu (chưa giao) | |
| 2 | Chọn sắp xếp: Mới nhất, Giá tăng dần, Giá giảm dần (PH-01); Phổ biến nhất (chưa giao) | |
| 3 | | Áp bộ lọc và sắp xếp lên danh sách hiện tại; giữ trên đường dẫn trang |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Lọc và sắp xếp theo giá dùng `price_from` |
| BR2 | Lọc màu theo `colors.code`, cỡ theo `sizes.code`, thương hiệu theo `brands.slug` |
| BR3 | Nhiều giá trị cùng loại là HOẶC; khác loại là VÀ |
| BR4 | "Phổ biến nhất" xếp theo số lượng bán 30 ngày gần nhất. Số này thuộc bảng đơn hàng của Duy, nên đọc qua hàm Duy công bố, không truy vấn bảng đơn |

### Đường dẫn API
`GET /api/products` thêm `sort=newest|price_asc|price_desc` (PH-01); khi làm lọc thêm `minPrice`, `maxPrice`, `colors`, `sizes`, `brands` (giá trị cách nhau bằng dấu phẩy).

### Tiêu chí chấp nhận
- [ ] **AC1** `minPrice=100000&maxPrice=500000` chỉ trả sản phẩm có giá trong khoảng — chưa giao
- [ ] **AC2** `colors=do,xanh` trả sản phẩm có biến thể màu đỏ hoặc xanh — chưa giao
- [ ] **AC3** `sizes=M` chỉ trả sản phẩm có cỡ M còn hàng, theo hàm đọc tồn kho của Duy — chưa giao
- [ ] **AC4** `sort=price_asc` xếp đúng chiều tăng dần theo giá — **PH-01**

---

## UC-03.4 · Xem chi tiết sản phẩm

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **xem đủ ảnh, mô tả, giá, màu và cỡ của một sản phẩm**, để **quyết định có mua không**.

### Điều kiện trước
- Sản phẩm tồn tại và thoả UC-03.1/BR1.

### Điều kiện sau
- Thông tin sản phẩm được hiện; không đổi dữ liệu.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhấn vào một sản phẩm | |
| 2 | | Trả tên, mô tả, chất liệu, hướng dẫn bảo quản, thương hiệu, danh mục và đường dẫn phân cấp |
| 3 | | Trả các màu đang bán, ảnh chung và ảnh theo từng màu |
| 4 | | Trả các biến thể đang bán: màu, cỡ, mã hàng, giá niêm yết, giá khuyến mãi |
| 5 | | Trả sản phẩm liên quan cùng danh mục |
| 6 | Chọn màu | Thư viện ảnh lọc theo màu đó; cỡ không có biến thể của màu đó hiện mờ |
| 7 | Chọn cỡ | Giá và mã hàng đổi theo biến thể vừa chọn |

Tồn kho còn, sắp hết, hết theo từng cỡ và tóm tắt đánh giá **chưa thuộc PH-01**: cần hàm công bố của tồn kho (Duy) và đánh giá (Tài).

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Tồn kho hiện ra = khả dụng theo hàm đọc tồn kho của Duy (`on_hand - reserved`), không truy vấn bảng tồn kho — chưa thuộc PH-01 |
| BR2 | Cảnh báo "sắp hết" theo ngưỡng do tồn kho trả về — chưa thuộc PH-01 |
| BR3 | Cỡ không có biến thể đang bán cho màu đã chọn, hoặc hết hàng, vẫn hiện nhưng mờ và không chọn được |
| BR4 | Có `sale_price` thì gạch `list_price` và làm nổi `sale_price` |
| BR5 | Nút cỡ xếp theo `sizes.sort_order`; ô màu vẽ bằng `colors.hex` |

### Đường dẫn API
| Phương thức | Đường dẫn | Việc | Lỗi |
|---|---|---|---|
| GET | `/api/products/:slug` | Chi tiết kèm ảnh và biến thể | 404 |
| GET | `/api/products/:slug/related?limit=4` | Sản phẩm liên quan cùng danh mục, trừ chính nó | 404 |

### Dữ liệu
Đọc `products`, `product_variants`, `product_images`, `colors`, `sizes`, `brands`, `categories`.

### Tiêu chí chấp nhận
- [ ] **AC1** `GET /api/products/:slug` trả tên, mô tả, chất liệu, thương hiệu, danh mục, ảnh (kèm màu), biến thể (màu, cỡ, mã hàng, giá)
- [ ] **AC2** Sản phẩm ngừng bán trả 404
- [ ] **AC3** Tồn kho khả dụng không âm — chưa thuộc PH-01
- [ ] **AC4** Biến thể hết hàng vẫn có trong kết quả, đánh dấu hết — chưa thuộc PH-01
- [ ] **AC5** Slug không tồn tại trả 404 `NOT_FOUND`

---

## UC-03.5 · Xem hướng dẫn chọn cỡ — chưa giao

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **xem bảng hướng dẫn chọn cỡ**, để **chọn đúng cỡ mà không cần thử**.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhấn "Xem hướng dẫn chọn cỡ" trên trang chi tiết | |
| 2 | | Tìm bảng theo thương hiệu, không có thì theo danh mục |
| 3 | | Hiện bảng: cỡ, ngực, eo, hông, chiều cao nhỏ nhất và lớn nhất |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Không có bảng cho sản phẩm này | Ẩn nút |

### Đường dẫn API
`GET /api/products/:slug/size-guide`: trả bảng hoặc `null`, không trả 404 khi thiếu bảng. Hai bảng `size_guides`, `size_guide_rows` thêm vào ERD khi use case này được giao.

### Tiêu chí chấp nhận
- [ ] **AC1** Trả đúng bảng, ưu tiên theo thương hiệu rồi tới danh mục
- [ ] **AC2** Không có bảng thì trả `null`, không trả 404
- [ ] **AC3** Kết quả có đơn vị đo `cm` hoặc `inch`

---

## Câu hỏi còn treo

| Câu hỏi của Duy | Trả lời đề xuất | Ai chốt |
|---|---|---|
| Tìm kiếm dùng `tsvector` hay `ILIKE`? | `ILIKE` đang có đủ cho vài trăm sản phẩm; quyết khi làm UC-03.2 kèm số đo | Bảo |
| "Phổ biến nhất" khi chưa có đơn thì xếp theo gì? | Mới nhất | Bảo |
| Hồ sơ vóc dáng có gợi ý cỡ ở UC-03.4 tuần này? | Không; cần hàm công bố của Tài | Tài và Bảo |
| Có lưu "đã xem gần đây"? | Có, lưu ở trình duyệt, không cần bảng; có thể trượt sang sprint sau | Bảo |
