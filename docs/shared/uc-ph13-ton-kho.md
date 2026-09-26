# PH-13 · Tồn kho & Nhập hàng

> Chép từ `uc-template.md`. Người viết đặc tả & người viết mã: **Phan Ngọc Duy** (sprint 2).

| | |
|---|---|
| **Thuộc dòng việc** | PH-13, sprint S2 |
| **Người viết** | Phan Ngọc Duy (HT-04) |
| **Tác nhân chính** | Nhân viên, Khách hàng (PH-13.4) |
| **Tác nhân phụ** | — |
| **Bảng CSDL** | `INVENTORIES`, `INVENTORY_MOVEMENTS`, `INVENTORY_RESERVATIONS`, `SKUS`, `PRODUCTS`, `PRODUCT_VARIANTS`, `BACK_IN_STOCK_SUBSCRIPTIONS` (nếu có), `USERS` |
| **Trạng thái** | Đã duyệt |

---

## PH-13.1 · Xem tồn kho theo SKU

### Câu chuyện người dùng

Là một **nhân viên**, tôi muốn **xem số lượng tồn kho hiện tại theo từng SKU**, để **biết sản phẩm nào cần nhập thêm và sản phẩm nào đang dồi dào**.

### Điều kiện trước

- Nhân viên đã đăng nhập với vai trò `staff` hoặc `admin`.

### Điều kiện sau

- Chỉ đọc, không thay đổi dữ liệu.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Truy cập trang "Quản lý tồn kho" | |
| 2 | | Hiện bảng: SKU code, tên SP, màu, size, số lượng tại kho (`on_hand`), đặt trước (`reserved`), có thể bán được (`available = on_hand - reserved`), mức tái nhập (`reorder_level`) |
| 3 | Lọc theo danh mục / thương hiệu / cảnh báo sắp hết | Lọc phía server, phân trang 50 dòng |
| 4 | Bấm vào một SKU | Xem chi tiết: thông tin SKU + lịch sử biến động ngắn gọn |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Không có SKU nào | Hiện danh sách rỗng, hướng dẫn tạo sản phẩm trước |
| E2 | Lọc "cảnh báo sắp hết" | Chỉ hiện SKU có `available ≤ reorder_level` |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | `available = on_hand - reserved`; không được hiển thị số âm (cảnh báo nghiệp vụ nếu xảy ra) |
| BR2 | `reorder_level` mặc định = 5 nếu chưa được thiết lập |
| BR3 | Cột "Cảnh báo" sáng đỏ khi `available ≤ reorder_level`, sáng vàng khi `available ≤ reorder_level × 2` |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/admin/inventory` | `?category_id, ?brand_id, ?low_stock, ?page, ?limit` | `{ data: [InventoryRow], meta }` | 401, 403 |
| GET | `/api/admin/inventory/:sku_id` | — | `{ sku, inventory, recent_movements: [...5] }` | 401, 403, 404 |

### Dữ liệu

- **Đọc:** `INVENTORIES` (sku_id, on_hand, reserved, reorder_level, warehouse_location)
- **Đọc:** `SKUS` (sku_code, list_price, sale_price)
- **Đọc:** `PRODUCT_VARIANTS` (color), `PRODUCTS` (name), `SIZES` (code), `COLORS` (name)

### Tiêu chí chấp nhận

- [ ] GET `/api/admin/inventory` trả danh sách SKU kèm `on_hand`, `reserved`, `available`
- [ ] `available = on_hand - reserved` tại mọi dòng
- [ ] Lọc `?low_stock=true` chỉ trả dòng `available <= reorder_level`
- [ ] Truy cập không có token staff/admin trả 403
- [ ] SKU không tồn tại trả 404

---

## PH-13.2 · Nhập hàng / Điều chỉnh tồn kho

### Câu chuyện người dùng

Là một **nhân viên**, tôi muốn **ghi nhận lô hàng nhập hoặc điều chỉnh tồn kho khi kiểm kê**, để **CSDL phản ánh chính xác số lượng thực tế trong kho**.

### Điều kiện trước

- Nhân viên đã đăng nhập với vai trò `staff` hoặc `admin`.
- SKU cần cập nhật đã tồn tại trong hệ thống.

### Điều kiện sau

- `INVENTORIES.on_hand` được cập nhật.
- `INVENTORY_MOVEMENTS` ghi lại biến động (ai, khi nào, loại, số lượng, ghi chú).

### Luồng chính — Nhập hàng

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Tìm SKU cần nhập (theo SKU code hoặc tên SP) | Hiện thông tin SKU và tồn kho hiện tại |
| 2 | Nhập số lượng nhập, nguồn/nhà cung cấp, ghi chú | |
| 3 | Bấm "Xác nhận nhập hàng" | Kiểm tra số lượng > 0 |
| 4 | | Cập nhật `INVENTORIES.on_hand += quantity` (trong transaction) |
| 5 | | Ghi `INVENTORY_MOVEMENTS` với `type = 'in'` |
| 6 | | Gửi thông báo khi có hàng cho người đăng ký (PH-13.4 async) |
| 7 | | Trả 201 kèm tồn kho mới |

### Luồng chính — Điều chỉnh tồn kho (kiểm kê)

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Tìm SKU cần điều chỉnh | Hiện `on_hand` hiện tại |
| 2 | Nhập số lượng thực tế đếm được (`actual_quantity`), ghi chú lý do | |
| 3 | Bấm "Lưu điều chỉnh" | Tính delta = `actual_quantity - on_hand` |
| 4 | | Ghi `INVENTORY_MOVEMENTS` với `type = 'adjustment'`, `quantity = delta` |
| 5 | | Cập nhật `INVENTORIES.on_hand = actual_quantity` |
| 6 | | Trả 201 kèm tồn kho mới và delta |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Số lượng nhập = 0 hoặc âm | Trả 422 `quantity_must_be_positive` |
| E2 | SKU không tồn tại | Trả 404 `sku_not_found` |
| E3 | Điều chỉnh về 0 khi đang có `reserved > 0` | Trả 422 `cannot_reduce_below_reserved`. Hiện lý do và số lượng reserved |
| E4 | Đồng thời có transaction khác cập nhật cùng SKU | Dùng `SELECT FOR UPDATE` để khoá dòng |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | `on_hand` không được nhỏ hơn `reserved` sau khi điều chỉnh |
| BR2 | Mọi thay đổi `on_hand` PHẢI đi kèm một bản ghi `INVENTORY_MOVEMENTS` (audit trail) |
| BR3 | Không xóa dữ liệu tồn kho; chỉ ghi thêm vào `INVENTORY_MOVEMENTS` |
| BR4 | Sau khi nhập hàng, nếu SKU trước đó hết hàng (`on_hand_old = 0` hoặc `available_old ≤ 0`), kích hoạt job gửi thông báo |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| POST | `/api/admin/inventory/:sku_id/receive` | `{ quantity, note?, supplier? }` | `{ inventory, movement }` | 404, 422 |
| POST | `/api/admin/inventory/:sku_id/adjust` | `{ actual_quantity, note }` | `{ inventory, movement, delta }` | 404, 422 |

### Dữ liệu

- **Ghi / Cập nhật:** `INVENTORIES` (on_hand, updated_at)
- **Ghi:** `INVENTORY_MOVEMENTS` (sku_id, type IN ('in','out','adjustment','reservation'), quantity, note, created_by)
- **Đọc:** `INVENTORY_RESERVATIONS` (để kiểm tra reserved trước khi điều chỉnh)

### Tiêu chí chấp nhận

- [ ] POST `/receive` với `quantity=10` tăng `on_hand` đúng 10 và tạo movement `type='in'`
- [ ] POST `/adjust` với `actual_quantity=5` khi `on_hand=8`: `on_hand → 5`, movement ghi `quantity=-3`
- [ ] Điều chỉnh về 0 khi `reserved > 0` trả 422 `cannot_reduce_below_reserved`
- [ ] Số lượng âm trả 422 `quantity_must_be_positive`
- [ ] Mọi thay đổi có thể truy vết qua `INVENTORY_MOVEMENTS` với `created_by` đúng

---

## PH-13.3 · Xem lịch sử biến động tồn kho

### Câu chuyện người dùng

Là một **nhân viên**, tôi muốn **xem toàn bộ lịch sử biến động tồn kho của một SKU theo thời gian**, để **điều tra nguyên nhân khi số liệu không khớp hoặc giải trình kiểm kê**.

### Điều kiện trước

- Nhân viên đã đăng nhập với vai trò `staff` hoặc `admin`.

### Điều kiện sau

- Chỉ đọc; không thay đổi dữ liệu.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Vào trang chi tiết tồn kho của một SKU | |
| 2 | | Hiện timeline biến động: thời gian, loại (`in / out / adjustment / reservation`), số lượng, người thực hiện, ghi chú |
| 3 | Lọc theo khoảng thời gian, loại biến động | Lọc server-side |
| 4 | Bấm "Xuất CSV" (tuỳ chọn) | Tạo file CSV và tải về |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Mặc định hiện 3 tháng gần nhất; cho phép lọc theo khoảng tuỳ chọn |
| BR2 | Không cho phép chỉnh sửa hay xóa lịch sử (immutable audit log) |
| BR3 | Chỉ nhân viên và quản trị viên xem được; khách hàng không có quyền |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/admin/inventory/:sku_id/movements` | `?from, ?to, ?type, ?page, ?limit` | `{ data: [Movement], meta }` | 401, 403, 404 |

### Dữ liệu

- **Đọc:** `INVENTORY_MOVEMENTS` (id, sku_id, type, quantity, note, created_by, created_at)
- **JOIN:** `USERS` (full_name của người thực hiện)

### Tiêu chí chấp nhận

- [ ] GET trả danh sách biến động đúng thứ tự thời gian giảm dần
- [ ] Lọc `?from=2026-09-01&to=2026-09-30` chỉ trả dữ liệu trong tháng 9
- [ ] Lọc `?type=in` chỉ trả biến động loại nhập hàng
- [ ] Trường `created_by_name` chứa họ tên người thực hiện (JOIN từ USERS)
- [ ] Khách hàng (token role='customer') trả 403

---

## PH-13.4 · Đặt thông báo khi có hàng trở lại

### Câu chuyện người dùng

Là một **khách hàng**, tôi muốn **đăng ký nhận thông báo khi SKU hết hàng có hàng trở lại**, để **không phải vào kiểm tra thường xuyên và bỏ lỡ khi hàng về**.

### Điều kiện trước

- Khách hàng đã đăng nhập.
- SKU đang hết hàng (`available = 0`).

### Điều kiện sau

- Bản ghi đăng ký lưu trong `NOTIFICATIONS` / `BACK_IN_STOCK_SUBSCRIPTIONS` (hoặc bảng tương đương).
- Khi nhập hàng (PH-13.2), job async gửi thông báo đến người đăng ký.

### Luồng chính — Đăng ký

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Trên trang chi tiết sản phẩm, chọn biến thể hết hàng | |
| 2 | Bấm "Thông báo khi có hàng" | |
| 3 | | Kiểm tra user chưa đăng ký SKU này |
| 4 | | Lưu đăng ký; trả 201 |
| 5 | | Hiện thông báo "Chúng tôi sẽ báo bạn khi có hàng" |

### Luồng chính — Gửi thông báo (async, kích hoạt từ PH-13.2)

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Job phát hiện SKU vừa về hàng (`available_old = 0` → `available_new > 0`) | |
| 2 | | Tìm tất cả đăng ký hợp lệ cho SKU đó |
| 3 | | Gửi thông báo qua email / in-app |
| 4 | | Đánh dấu đăng ký `notified_at = NOW()` |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | User đã đăng ký SKU này rồi | Trả 200 (idempotent), không tạo bản ghi mới |
| E2 | SKU vẫn còn hàng khi đăng ký | Trả 422 `sku_still_in_stock`. Không lưu đăng ký |
| E3 | Gửi thông báo thất bại (email down) | Ghi lại lỗi vào `jobs` hoặc outbox; retry sau |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Mỗi user chỉ đăng ký một lần mỗi SKU; endpoint idempotent |
| BR2 | Sau khi gửi thông báo, không tự động hủy đăng ký (user chủ động hủy) |
| BR3 | Dùng Outbox pattern hoặc job queue; không gửi thông báo đồng bộ trong request nhập hàng |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| POST | `/api/products/skus/:sku_id/notify-me` | — | `{ message }` | 401, 422 |
| DELETE | `/api/products/skus/:sku_id/notify-me` | — | 204 | 401, 404 |

### Dữ liệu

- **Ghi:** Bảng đăng ký (sku_id, user_id, created_at, notified_at) — tên bảng cụ thể đặt khi thiết kế DB PH-15
- **Đọc:** `INVENTORIES` (kiểm tra `available = 0`)

### Tiêu chí chấp nhận

- [ ] POST `/notify-me` khi SKU hết hàng trả 201
- [ ] POST lần 2 cùng SKU trả 200 (idempotent), không tạo bản ghi trùng
- [ ] POST khi SKU còn hàng trả 422 `sku_still_in_stock`
- [ ] Sau khi nhập hàng (PH-13.2), job gửi thông báo đến đúng người đăng ký
- [ ] User chưa đăng nhập trả 401

---

## Câu hỏi còn treo

1. `BACK_IN_STOCK_SUBSCRIPTIONS` — bảng này tự tạo hay tích hợp vào `NOTIFICATIONS`? Cần chốt với nhóm Tài (NOTIFICATIONS).
2. Gửi thông báo qua kênh nào trước trong sprint 2: email, in-app, hay cả hai?
3. Khi nhập hàng, có giới hạn số lượng tối đa mỗi lần (ví dụ 10.000 đơn vị) để tránh nhập nhầm không?
4. `INVENTORY_RESERVATIONS` — reservation được tạo khi nào chính xác: khi thêm vào giỏ hay khi đặt hàng?
