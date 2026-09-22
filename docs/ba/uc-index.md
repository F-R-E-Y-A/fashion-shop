# Danh mục use case

> Tệp này do **Phan Ngọc Duy** lập và duy trì trong HT-04 (Sprint 1).
> Mỗi use case một dòng. Người sở hữu phân hệ tự cập nhật cột **Trạng thái** khi tới lượt.
>
> **Mức:** Mục tiêu người dùng = UC hoàn chỉnh một mục tiêu; Mục tiêu con = bước bên trong.
> **Độ ưu tiên (MoSCoW):** Phải có · Nên có · Có thì tốt.
> **Thuộc dòng việc:** mã `PH-` hoặc `HT-` trong bảng chia việc.

---

## PH-01 · Tài khoản & Xác thực

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-01.1 | Đăng ký tài khoản | Khách vãng lai | Mục tiêu người dùng | Phải có | Thấp | PH-01 | Phan Ngọc Duy | Đã viết |
| PH-01.2 | Đăng nhập | Khách vãng lai | Mục tiêu người dùng | Phải có | Trung bình | PH-01 | Phan Ngọc Duy | Đã viết |
| PH-01.3 | Đặt lại mật khẩu | Khách vãng lai | Mục tiêu người dùng | Phải có | Thấp | PH-01 | Phan Ngọc Duy | Đã viết |
| PH-01.4 | Đăng xuất | Khách hàng | Mục tiêu con | Phải có | Thấp | PH-01 | Phan Ngọc Duy | Đã viết |
| PH-01.5 | Cập nhật thông tin cá nhân | Khách hàng | Mục tiêu người dùng | Phải có | Thấp | PH-01 | Phan Ngọc Duy | Đã viết |
| PH-01.6 | Quản lý địa chỉ giao hàng | Khách hàng | Mục tiêu người dùng | Phải có | Thấp | PH-01 | Phan Ngọc Duy | Đã viết |
| PH-01.7 | Cập nhật hồ sơ vóc dáng (Fit Profile) | Khách hàng | Mục tiêu người dùng | Có thì tốt | Thấp | PH-01 | Phan Ngọc Duy | Đã viết |

---

## PH-02 · Quản trị tài khoản

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-02.1 | Quản lý tài khoản người dùng | Quản trị viên | Mục tiêu người dùng | Phải có | Thấp | PH-02 | Phan Ngọc Duy | Chưa viết |
| PH-02.2 | Quản lý nhân viên & phân quyền | Quản trị viên | Mục tiêu người dùng | Phải có | Trung bình | PH-02 | Phan Ngọc Duy | Chưa viết |

---

## PH-03 · Khám phá sản phẩm

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-03.1 | Duyệt danh mục sản phẩm | Khách vãng lai | Mục tiêu người dùng | Phải có | Thấp | PH-03 | Phan Ngọc Duy | Đã viết |
| PH-03.2 | Tìm kiếm sản phẩm | Khách vãng lai | Mục tiêu người dùng | Phải có | Trung bình | PH-03 | Phan Ngọc Duy | Đã viết |
| PH-03.3 | Lọc và sắp xếp sản phẩm | Khách vãng lai | Mục tiêu con | Phải có | Trung bình | PH-03 | Phan Ngọc Duy | Đã viết |
| PH-03.4 | Xem chi tiết sản phẩm | Khách vãng lai | Mục tiêu người dùng | Phải có | Trung bình | PH-03 | Phan Ngọc Duy | Đã viết |
| PH-03.5 | Xem hướng dẫn chọn size | Khách vãng lai | Mục tiêu con | Nên có | Thấp | PH-03 | Phan Ngọc Duy | Đã viết |

---

## PH-04 · Quản lý danh mục & Sản phẩm

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-04.1 | Quản lý danh mục | Nhân viên | Mục tiêu người dùng | Phải có | Thấp | PH-04 | Phan Ngọc Duy | Chưa viết |
| PH-04.2 | Quản lý sản phẩm | Nhân viên | Mục tiêu người dùng | Phải có | Cao | PH-04 | Phan Ngọc Duy | Chưa viết |
| PH-04.3 | Quản lý biến thể & SKU | Nhân viên | Mục tiêu người dùng | Phải có | Cao | PH-04 | Phan Ngọc Duy | Chưa viết |
| PH-04.4 | Quản lý ảnh sản phẩm | Nhân viên | Mục tiêu con | Phải có | Trung bình | PH-04 | Phan Ngọc Duy | Chưa viết |
| PH-04.5 | Quản lý bảng hướng dẫn size | Nhân viên | Mục tiêu người dùng | Nên có | Thấp | PH-04 | Phan Ngọc Duy | Chưa viết |

---

## PH-05 · Giỏ hàng

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-05.1 | Thêm sản phẩm vào giỏ | Khách vãng lai | Mục tiêu người dùng | Phải có | Trung bình | PH-05 | Phan Ngọc Duy | Chưa viết |
| PH-05.2 | Quản lý giỏ hàng | Khách hàng | Mục tiêu người dùng | Phải có | Trung bình | PH-05 | Phan Ngọc Duy | Chưa viết |

---

## PH-06 · Danh sách yêu thích

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-06.1 | Quản lý danh sách yêu thích | Khách hàng | Mục tiêu người dùng | Nên có | Thấp | PH-06 | Phan Ngọc Duy | Chưa viết |

---

## PH-07 · Đặt hàng

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-07.1 | Đặt hàng | Khách hàng | Mục tiêu người dùng | Phải có | Cao | PH-07 | Phan Ngọc Duy | Chưa viết |
| PH-07.2 | Áp dụng mã giảm giá | Khách hàng | Mục tiêu con | Nên có | Trung bình | PH-07 | Phan Ngọc Duy | Chưa viết |
| PH-07.3 | Theo dõi đơn hàng | Khách hàng | Mục tiêu người dùng | Phải có | Thấp | PH-07 | Phan Ngọc Duy | Chưa viết |
| PH-07.4 | Hủy đơn hàng | Khách hàng | Mục tiêu người dùng | Phải có | Trung bình | PH-07 | Phan Ngọc Duy | Chưa viết |

---

## PH-08 · Thanh toán

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-08.1 | Thanh toán đơn hàng | Khách hàng | Mục tiêu người dùng | Phải có | Cao | PH-08 | Phan Ngọc Duy | Chưa viết |
| PH-08.2 | Xác nhận thanh toán qua webhook | Cổng thanh toán | Mục tiêu con | Phải có | Cao | PH-08 | Phan Ngọc Duy | Chưa viết |

---

## PH-09 · Giao hàng

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-09.1 | Tạo vận đơn giao hàng | Nhân viên | Mục tiêu người dùng | Phải có | Trung bình | PH-09 | Phan Ngọc Duy | Chưa viết |
| PH-09.2 | Nhận & cập nhật trạng thái giao hàng | Shipper | Mục tiêu người dùng | Phải có | Trung bình | PH-09 | Phan Ngọc Duy | Chưa viết |
| PH-09.3 | Xác nhận giao hàng thành công | Shipper | Mục tiêu con | Phải có | Thấp | PH-09 | Phan Ngọc Duy | Chưa viết |

---

## PH-10 · Khuyến mãi & Mã giảm giá

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-10.1 | Quản lý chương trình khuyến mãi | Nhân viên | Mục tiêu người dùng | Nên có | Trung bình | PH-10 | Phan Ngọc Duy | Chưa viết |
| PH-10.2 | Quản lý mã giảm giá (coupon) | Nhân viên | Mục tiêu người dùng | Nên có | Trung bình | PH-10 | Phan Ngọc Duy | Chưa viết |
| PH-10.3 | Xem thống kê sử dụng coupon | Nhân viên | Mục tiêu con | Có thì tốt | Thấp | PH-10 | Phan Ngọc Duy | Chưa viết |

---

## PH-11 · Đánh giá sản phẩm

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-11.1 | Viết đánh giá sản phẩm | Khách hàng | Mục tiêu người dùng | Nên có | Trung bình | PH-11 | Phan Ngọc Duy | Chưa viết |
| PH-11.2 | Quản lý đánh giá (duyệt / ẩn) | Nhân viên | Mục tiêu người dùng | Nên có | Thấp | PH-11 | Phan Ngọc Duy | Chưa viết |

---

## PH-12 · Xử lý đơn hàng (vận hành)

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-12.1 | Xử lý & xác nhận đơn hàng | Nhân viên | Mục tiêu người dùng | Phải có | Trung bình | PH-12 | Phan Ngọc Duy | Chưa viết |
| PH-12.2 | Bàn giao đơn cho shipper | Nhân viên | Mục tiêu con | Phải có | Thấp | PH-12 | Phan Ngọc Duy | Chưa viết |

---

## PH-13 · Tồn kho & Nhập hàng

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-13.1 | Xem tồn kho theo SKU | Nhân viên | Mục tiêu người dùng | Phải có | Thấp | PH-13 | Phan Ngọc Duy | Đã viết |
| PH-13.2 | Nhập hàng / điều chỉnh tồn kho | Nhân viên | Mục tiêu người dùng | Phải có | Cao | PH-13 | Phan Ngọc Duy | Đã viết |
| PH-13.3 | Xem lịch sử biến động tồn kho | Nhân viên | Mục tiêu người dùng | Phải có | Thấp | PH-13 | Phan Ngọc Duy | Đã viết |
| PH-13.4 | Đặt thông báo khi có hàng trở lại | Khách hàng | Mục tiêu người dùng | Nên có | Thấp | PH-13 | Phan Ngọc Duy | Đã viết |

---

## PH-14 · Đổi trả & Hoàn tiền

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-14.1 | Yêu cầu đổi / trả hàng | Khách hàng | Mục tiêu người dùng | Phải có | Trung bình | PH-14 | Phan Ngọc Duy | Chưa viết |
| PH-14.2 | Xử lý yêu cầu đổi trả | Nhân viên | Mục tiêu người dùng | Phải có | Cao | PH-14 | Phan Ngọc Duy | Chưa viết |
| PH-14.3 | Hoàn tiền | Nhân viên | Mục tiêu con | Phải có | Cao | PH-14 | Phan Ngọc Duy | Chưa viết |
| PH-14.4 | Đổi sang sản phẩm khác | Nhân viên | Mục tiêu con | Nên có | Cao | PH-14 | Phan Ngọc Duy | Chưa viết |

---

## PH-15 · Thông báo

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-15.1 | Xem và quản lý thông báo | Khách hàng | Mục tiêu người dùng | Nên có | Thấp | PH-15 | Phan Ngọc Duy | Chưa viết |

---

## PH-16 · Báo cáo & Thống kê

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Thuộc dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| PH-16.1 | Xem báo cáo & thống kê | Quản trị viên | Mục tiêu người dùng | Nên có | Trung bình | PH-16 | Phan Ngọc Duy | Chưa viết |
| PH-16.2 | Cấu hình hệ thống | Quản trị viên | Mục tiêu người dùng | Phải có | Thấp | PH-16 | Phan Ngọc Duy | Chưa viết |

---

## Tổng hợp

| Tác nhân | Số UC |
|---|---|
| Khách vãng lai | 9 (PH-01.1–3, PH-03.1–5, PH-05.1) |
| Khách hàng | 16 (PH-01.4–7, PH-05.2, PH-06.1, PH-07.1–4, PH-08.1, PH-11.1, PH-13.4, PH-14.1, PH-15.1) |
| Nhân viên | 17 (PH-04.1–5, PH-09.1, PH-10.1–3, PH-11.2, PH-12.1–2, PH-13.1–3, PH-14.2–4) |
| Quản trị viên | 4 (PH-02.1–2, PH-16.1–2) + thừa kế toàn bộ NV |
| Shipper | 2 (PH-09.2–3) |
| Cổng thanh toán | 1 (PH-08.2) |
| **Tổng** | **49 use case** |

> **Ghi chú quan hệ tổng quát hoá:**
> - Khách hàng **thừa kế** Khách vãng lai — dùng được tất cả UC của Khách vãng lai.
> - Quản trị viên **thừa kế** Nhân viên — dùng được tất cả UC của Nhân viên.
