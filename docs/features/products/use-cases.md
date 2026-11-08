---
title: Khám phá sản phẩm và quản trị catalog — đặc tả use case
updated: 2026-11-08
status: đề xuất, chờ Bảo duyệt
owner: Bảo
---
# Khám phá sản phẩm và quản trị catalog

**Chức năng:** Đặc tả khám phá sản phẩm và quản trị catalog, gồm luồng, luật và tiêu chí nghiệm thu.

| | |
|---|---|
| **Người viết đặc tả** | Phan Ngọc Duy (HT-04, 22/09); Bảo chỉnh ngày 24/09 theo [erd.md](erd.md) và [shared/api.md](../../shared/api.md) |
| **Người sở hữu mã** | Nguyễn Ngọc Thái Bảo, module `products` |
| **Dòng việc** | **PH-01** làm UC-03.1, UC-03.2, UC-03.4 và UC-03.3 (sắp xếp và lọc giá, màu, cỡ, đối tượng, danh mục; chưa lọc thương hiệu). UC-03.5 chưa giao |
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

## UC-03.2 · Tìm kiếm sản phẩm — PH-01 đợt 2

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **nhập từ khoá và thấy sản phẩm liên quan**, để **nhanh chóng tìm được thứ mình muốn mua**.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Nhập từ khoá, nhấn Enter hoặc bấm kính lúp | |
| 2 | | Đọc câu thành danh mục, đối tượng, màu, cỡ, giá, dịp mặc rồi tìm phần chữ còn lại trong tên, danh mục, màu và mô tả ([ADR-019](LOG.md#adr-019)); chưa tìm theo thương hiệu vì 0 sản phẩm có thương hiệu |
| 3 | | Trả sản phẩm khớp, mỗi trang 20, xếp theo độ liên quan, kèm các ý đã hiểu để khách bỏ từng ý |
| 4 | Sửa từ khoá | Cập nhật kết quả sau 300 ms ngừng gõ |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Không có kết quả | API nới dần truy vấn (bỏ từ khoá, dịp mặc, màu, cỡ, giá) và ghi rõ đã bỏ gì trong `relaxed`; hết ràng buộc mà vẫn rỗng thì trả rỗng. Giao diện gợi ý các danh mục gốc và câu mẫu |
| E2 | Từ khoá dưới 2 ký tự | Trả 400 |
| E3 | Từ khoá quá 120 ký tự | Trả 400 (giới hạn hiện có trong DTO liệt kê) |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Không phân biệt chữ hoa, chữ thường |
| BR2 | Phạm vi tìm: tên, danh mục, màu và mô tả; chịu lỗi gõ một hai chữ với từ từ 4 ký tự; có dấu so bản có dấu, không dấu so bản không dấu. Thương hiệu để sau (0 sản phẩm có thương hiệu) |
| BR3 | Chỉ trả sản phẩm thoả UC-03.1/BR1 |

### Đường dẫn API
Dùng chung `GET /api/products?search=`, không tạo `/api/products/search`: tránh hai đường liệt kê, và tránh chữ `search` bị hiểu thành một slug. Gợi ý cho ô tìm kiếm toàn cục: `GET /api/search/suggest?q=` (giới hạn 60 lần mỗi phút mỗi IP, `429` kèm `Retry-After`). Hình dạng phản hồi (`interpretation`, `relaxed`, `facets`) theo Swagger `/api/docs`.

### Tiêu chí chấp nhận
- [x] **AC1** `?search=áo` trả sản phẩm liên quan — `test/catalog-search.http.spec.ts` (UC-03.2/AC1), `search/parse-query.spec.ts`, `search/catalog-engine.spec.ts`
- [x] **AC2** `search` dưới 2 ký tự trả 400 — `test/catalog-search.http.spec.ts` (UC-03.2/AC2, E3)
- [x] **AC3** Không có kết quả trả `items: []`, `total: 0` — `test/catalog-search.http.spec.ts` (UC-03.2/AC3)
- [x] **AC4** Sản phẩm ngừng bán không xuất hiện — `test/catalog-search.http.spec.ts` (UC-03.2/AC4)

---

## UC-03.3 · Lọc và sắp xếp sản phẩm — PH-01 đợt 2 làm lọc giá, màu, cỡ, đối tượng, danh mục

> **Quan hệ UML:** `<<extend>>` UC-03.1 và UC-03.2

### Câu chuyện người dùng
Là một **khách vãng lai**, tôi muốn **lọc theo giá, màu, cỡ, thương hiệu và sắp xếp**, để **thu hẹp nhanh tới những sản phẩm hợp với mình**.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Chọn bộ lọc: khoảng giá, màu, cỡ, đối tượng, danh mục (thương hiệu chưa giao) | |
| 2 | Chọn sắp xếp: Liên quan nhất (khi có câu tìm), Mới nhất, Giá tăng dần, Giá giảm dần; Phổ biến nhất (chưa giao) | |
| 3 | | Áp bộ lọc và sắp xếp lên danh sách hiện tại; giữ trên đường dẫn trang |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Lọc và sắp xếp theo giá dùng `price_from` |
| BR2 | Lọc màu theo **họ màu** (15 họ; xem [ADR-019](LOG.md#adr-019)), cỡ theo `sizes.code`, thương hiệu theo `brands.slug` (chưa giao) |
| BR3 | Nhiều giá trị cùng loại là HOẶC; khác loại là VÀ |
| BR4 | "Phổ biến nhất" xếp theo số lượng bán 30 ngày gần nhất. Số này thuộc bảng đơn hàng của Duy, nên đọc qua hàm Duy công bố, không truy vấn bảng đơn |

### Đường dẫn API
`GET /api/products` có `sort=relevance|newest|price_asc|price_desc`, `minPrice`, `maxPrice`, `colors`, `sizes`, `categories`, `audience` (giá trị cách nhau bằng dấu phẩy) và `facets=true` để nhận số đếm mỗi lựa chọn; `brands` chưa giao.

### Tiêu chí chấp nhận
- [x] **AC1** `minPrice=100000&maxPrice=500000` chỉ trả sản phẩm có giá trong khoảng — `test/catalog-search.http.spec.ts` (UC-03.3/AC1)
- [x] **AC2** `colors=xam,navy` trả sản phẩm có biến thể thuộc một trong hai họ màu — `test/catalog-search.http.spec.ts` (UC-03.3/AC2); dùng **họ màu**, không phải `colors.code`
- [ ] **AC3** `sizes=M` chỉ trả sản phẩm có cỡ M — lọc theo biến thể đang bán, **chưa xét tồn kho** (chờ hàm của Duy, [ND-14](../../TECH_DEBT.md)); bài `UC-03.3/AC3` kiểm phần đã có
- [x] **AC4** `sort=price_asc` xếp đúng chiều tăng dần theo giá — `test/catalog-search.http.spec.ts` (UC-03.3/AC4), `test/products.http.spec.ts`

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
| Tìm kiếm dùng `tsvector` hay `ILIKE`? | Đã trả lời bằng [ADR-019](LOG.md#adr-019) (đề xuất): không dùng cả hai, lọc và xếp hạng trong API bằng luật và từ điển tiếng Việt; chuyển sang `pg_trgm` khi Catalog vượt vài nghìn sản phẩm | Bảo |
| "Phổ biến nhất" khi chưa có đơn thì xếp theo gì? | Mới nhất | Bảo |
| Hồ sơ vóc dáng có gợi ý cỡ ở UC-03.4 tuần này? | Không; cần hàm công bố của Tài | Tài và Bảo |
| Có lưu "đã xem gần đây"? | Có, lưu ở trình duyệt, không cần bảng; có thể trượt sang sprint sau | Bảo |

## UC-04.2 · Quản lý thông tin sản phẩm — lát đọc, Issue #63

**Trạng thái:** đề xuất, Tài thực hiện; Bảo/Duy review. Mã theo danh mục đề xuất PR #26;
chưa tuyên bố hoàn tất các thao tác tạo/sửa/ngừng bán của use case này. Actor MVP là ADMIN, không thêm STAFF.

### Luồng và luật nghiệp vụ

ADMIN mở `/admin/products`, tìm tên/SKU, lọc cờ hoạt động, chọn sắp xếp/số dòng/trang rồi xem
`/admin/products/:id`. URL mang đủ điều kiện để mở tab mới, reload và quay lại đúng tập dữ liệu.
API quản trị độc lập với điều kiện hiển thị storefront; đọc cả sản phẩm/danh mục/biến thể ẩn.
`isActive` chỉ là cờ sản phẩm, không đảm bảo còn hàng hay mua được. Không có mutation trong lát này.

`q` trim, tối đa 120 ký tự, tìm chuỗi con trong tên HOẶC SKU mọi biến thể, không phân biệt hoa/thường,
giữ phân biệt dấu; `%`, `_`, gạch chéo ngược là ký tự literal. Tìm trước phân trang, không nới truy vấn,
không ghi log tìm kiếm storefront; sản phẩm khớp nhiều SKU vẫn chỉ có một dòng.
`status=all|active|inactive` (mặc định all) theo Product.isActive;
`sort=newest|name_asc` theo createdAt giảm/name tăng, id tăng phá hòa (collation DB).
PageQuery áp dụng page 1–100000 (giới hạn skip), pageSize 1–60; UI chọn 12/24/60, mặc định 12.
Tham số lặp/lạ/sai bị API từ chối; UI replace URL chuẩn trước fetch. Đổi điều kiện về trang 1.

Bảng hiển thị ảnh đầu/name/slug/category/brand nullable/priceFrom/isActive/createdAt;
chi tiết thêm description/material/careInstructions/isFeatured/audience/updatedAt,
biến thể SKU/màu/cỡ/listPrice/salePrice/isActive và ảnh theo sortOrder.
Giá là chuỗi Decimal, priceFrom là giá tổng hợp đang lưu; không suy diễn giá bán/tồn kho.
Không trả attributes JSON chưa có hợp đồng, không bịa dữ liệu hoặc nút chức năng.
API thực tế lấy hình dạng từ Swagger; không sao chép DTO vào đây.

### Tiêu chí chấp nhận đề xuất

- [ ] **AC1** Guard ngoài layout; chờ phiên/guest/CUSTOMER không gọi API admin; server kiểm 401/403/ADMIN.
- [ ] **AC2** List/detail thấy cả bản ghi ẩn; public catalog giữ quy tắc cũ; ảnh/brand/giá nullable đúng, không lộ cột ngoài DTO.
- [ ] **AC3** Tìm tên/SKU toàn dữ liệu, literal/hoa thường/dấu đúng, không trùng sản phẩm; total theo cùng bộ lọc với rows.
- [ ] **AC4** Kết hợp status/sort/page/pageSize đúng, thứ tự ổn định; 400 input/query lặp/lạ/UUID sai, 404 UUID không tồn tại.
- [ ] **AC5** Codec URL/query key/request nhất quán, Back/Forward/reload/detail return giữ điều kiện; trang vượt totalPages phục hồi được.
- [ ] **AC6** Cache actor/epoch, AbortSignal; logout/đổi actor/đăng nhập lại cùng actor hủy/xóa dữ liệu; response muộn không phục hồi cache.
- [ ] **AC7** 403 xóa mọi dữ liệu admin của actor và chặn query tiếp; success muộn không khôi phục dữ liệu; không đăng xuất vì 403.
- [ ] **AC8** Đủ tải/lỗi/rỗng/no-results/403/404, không retry 4xx; đổi điều kiện không lộ tập cũ; không ghi DB qua luồng đọc.
- [ ] **AC9** F.R.E.Y.A., CSS Modules, desktop/mobile 360px và keyboard; tên/SKU dài/null đọc được, giữ Tổng quan/Users/Orders/cửa hàng.
- [ ] **AC10** DTO/Swagger/tests/docs và minh chứng thực tế đủ; check/build/docs lint/HTTP riêng đạt, CI và review trước merge.

### Ngoài phạm vi và quyết định còn lại

Tạo/sửa/ngừng bán, SKU/slug, upload/biến thể/danh mục thuộc Issue sau. Tài đã chọn chỉ ẩn/ngừng bán,
giữ dữ liệu; SKU khi đã có đơn, tác động import và lưu trữ ảnh cần chốt trước mutation.
Không thêm kho/KPI/bulk/export/STAFF. README giữ trạng thái triển khai, LOG chỉ thêm quyết định đề xuất.
### Mở rộng trạng thái sản phẩm — Issue #65, đề xuất
Giữ AC1–10 của lát đọc. Tài chốt giữ ngừng bán thủ công qua mọi lần import; chỉ ADMIN chủ động gỡ.
Không xóa dữ liệu, không tự bật danh mục/biến thể, chọn lại giỏ hoặc sửa đơn/payment/inventory.
Bật lại tính cờ hiệu lực theo ảnh nguồn hiện có; gỡ hold không đồng nghĩa mua được.
- [ ] **AC11** PATCH trạng thái kiểm ADMIN trước validation; UUID/body/type/trường lạ/version sai400,
  guest401/CUSTOMER403, thiếu404, version cũ409; response allowlist, no-store, không toggle.
- [ ] **AC12** Ngừng bán đặt manual hold và tắt cờ; bật lại gỡ hold/tính điều kiện nguồn. Version chỉ tăng
  khi hold/cờ đổi, phát hiện ABA; no-op giữ version. Migration false/0 giữ isActive cũ.
- [ ] **AC13** Import và admin khóa cùng hàng, giữ hold kể cả có/không ảnh; lặp không tăng version vô cớ,
  cạnh tranh cả hai thứ tự không mất cập nhật. Không đổi hợp đồng importProducts hoặc ghi bảng ngoài products.
- [ ] **AC14** Sau ngừng bán public list/search/suggest/detail ẩn; lần đọc giỏ sau báo INACTIVE/bỏ chọn,
  thêm mới bị chặn; bật lại không tự chọn giỏ. Đơn/payment/stock/reservation cũ giữ nguyên.
  Checkout chỉ bảo đảm theo thời điểm đọc catalog trong giao dịch hiện có, không hủy checkout đã đọc trước.
- [ ] **AC15** List/detail dùng chung mutation, xác nhận tên/tác động đúng; chống gửi lặp, focus khi pending,
  đóng không hứa hủy server, trả focus về opener hoặc vùng kết quả khi dòng biến mất; mobile360px dùng được.
- [ ] **AC16** Cache theo actor/epoch/thế hệ quyền; hủy GET cũ trước cập nhật, không đè GET version mới hơn.
  Logout/A→B/A→A/403 chặn response mutation muộn, notice và invalidate phiên mới; kiểm cả hai hướng.
- [ ] **AC17** Sau mutation bỏ tập danh sách cũ, refetch query đang active, total/trang từ API; không N+1,
  giữ URL và link quay lại. Dòng rời filter/trang cuối có đường phục hồi, không tự trừ total.
- [ ] **AC18** 400/401/403/404/409/422 có thông báo đúng, không retry4xx/mutation. 409 tải lại rồi xem và
  xác nhận lại; 5xx/network/timeout chỉ GET đối chiếu, không cho gửi thao tác mới khi chưa xác minh được.
  Check/build/HTTP riêng/docs lint và minh chứng phải định danh bản; CI/review người trước merge.
