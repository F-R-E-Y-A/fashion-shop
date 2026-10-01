---
title: UC-05 Giỏ hàng — đặc tả use case
updated: 2026-10-01
status: đang dùng
owner: Duy
---
# UC-05 · Giỏ hàng

**Chức năng:** Khách xem giỏ, thêm sản phẩm, cập nhật số lượng, xóa dòng và hợp nhất giỏ khi đăng nhập: luồng, luật và tiêu chí chấp nhận.

| | |
|---|---|
| **Người viết đặc tả** | Phan Ngọc Duy (PH-02) |
| **Người sở hữu mã** | Phan Ngọc Duy, module `apps/api/src/modules/cart` và `apps/web/src/features/cart` |
| **Dòng việc** | **PH-02** làm toàn bộ UC-05.1 đến UC-05.5 |
| **Tác nhân chính** | Khách vãng lai, Khách hàng |
| **Dữ liệu** | Bảng `carts`, `cart_items` trong `orders.prisma` |

---

## UC-05.1 · Xem giỏ hàng

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **xem danh sách các sản phẩm đã chọn mua**, để **biết tổng số lượng và tạm tính số tiền cần thanh toán**.

### Điều kiện trước
- Khách vãng lai có `x-guest-token` hoặc Khách hàng có Bearer access token.

### Điều kiện sau
- Trả về danh sách chi tiết các dòng trong giỏ, tổng số món và tổng tiền tạm tính.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Bấm vào biểu tượng Giỏ hàng trên thanh menu | Gửi yêu cầu lấy thông tin giỏ hàng |
| 2 | | Đọc các dòng giỏ hàng từ CSDL, nạp giá và ảnh sản phẩm |
| 3 | | Trả về thông tin giỏ hàng và hiển thị trên màn hình `/gio-hang` |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Thiếu cả guest token lẫn token đăng nhập | Trả 400 `Thieu dinh danh gio hang.` |
| E2 | Giỏ hàng trống | Trả về danh sách rỗng `items: []`, `total: '0.00'`, `itemCount: 0` |

### Tiêu chí chấp nhận
- [ ] **AC1** `GET /api/cart` kèm định danh hợp lệ trả 200 kèm danh sách sản phẩm và tổng tiền chính xác
- [ ] **AC2** Không có header định danh trả 400

---

## UC-05.2 · Thêm sản phẩm vào giỏ hàng

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **thêm một biến thể sản phẩm (màu, cỡ) với số lượng mong muốn vào giỏ**, để **chuẩn bị mua hàng**.

### Điều kiện sau
- Biến thể được thêm mới vào `cart_items` hoặc được cộng dồn số lượng nếu đã tồn tại trước đó.

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Nếu sản phẩm/biến thể đã ngừng bán (`isActive = false`), từ chối không cho thêm |
| BR2 | Cặp `(cart_id, product_variant_id)` luôn là duy nhất trong CSDL; thêm trùng sẽ cộng dồn số lượng |

### Tiêu chí chấp nhận
- [ ] **AC1** `POST /api/cart/items` với biến thể mới trả 201 và tạo dòng mới trong giỏ
- [ ] **AC2** Thêm trùng biến thể đã có sẽ cộng dồn số lượng vào dòng hiện tại

---

## UC-05.3 · Cập nhật số lượng và xóa món

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **tăng, giảm số lượng hoặc xóa bỏ một sản phẩm trong giỏ**, để **điều chỉnh đơn hàng theo ý muốn**.

### Tiêu chí chấp nhận
- [ ] **AC1** `PATCH /api/cart/items/:variantId` cập nhật số lượng mới và tính lại tổng tiền
- [ ] **AC2** `DELETE /api/cart/items/:variantId` xóa hoàn toàn dòng sản phẩm đó khỏi giỏ

---

## UC-05.4 · Xóa toàn bộ giỏ hàng

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **xóa toàn bộ sản phẩm trong giỏ chỉ với một thao tác**, để **làm mới giỏ hàng**.

### Tiêu chí chấp nhận
- [ ] **AC1** `DELETE /api/cart` xóa toàn bộ các dòng thuộc giỏ hàng và trả `{ ok: true }`

---

## UC-05.5 · Hợp nhất giỏ hàng khi đăng nhập

### Câu chuyện người dùng
Là một **khách vãng lai vừa đăng nhập**, tôi muốn **giữ lại các món hàng đã chọn trước khi đăng nhập**, để **không phải tìm và chọn lại từ đầu**.

### Điều kiện trước
- Đã đăng nhập (có Bearer JWT token) và có giỏ hàng khách vãng lai (`x-guest-token`).

### Điều kiện sau
- Các sản phẩm từ giỏ khách được chuyển sang giỏ tài khoản; nếu trùng biến thể thì cộng dồn số lượng; giỏ khách cũ được dọn dẹp sạch trong CSDL.

### Tiêu chí chấp nhận
- [ ] **AC1** `POST /api/cart/merge` chưa đăng nhập trả 401 Unauthorized
- [ ] **AC2** Có token và `x-guest-token` hợp lệ sẽ gộp đầy đủ các món vào giỏ tài khoản và xóa giỏ khách
