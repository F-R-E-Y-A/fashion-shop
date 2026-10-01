---
title: UC-01 Mở rộng hồ sơ người dùng
updated: 2026-10-01
status: đề xuất
owner: Duy
---
# UC-01 · Mở rộng hồ sơ người dùng

**Chức năng:** Đặc tả các use case mở rộng của người dùng: thông tin cá nhân, sổ địa chỉ và hồ sơ vóc dáng.

> **Ghi chú phân hệ:** Các use case xác thực cốt lõi (Đăng ký, Xác thực OTP, Đăng nhập, Làm mới/Đăng xuất, Quên/Đổi mật khẩu) thuộc sở hữu của phân hệ Auth và đã được chuẩn hóa tại [`docs/features/auth/use-cases.md`](../features/auth/use-cases.md). Tệp này lưu trữ các use case mở rộng tiếp theo của tài khoản khách hàng.

| | |
|---|---|
| **Người viết đặc tả** | Phan Ngọc Duy (HT-04) |
| **Tác nhân chính** | Khách hàng |
| **Bảng CSDL liên quan** | `users`, `addresses`, `fit_profiles` |
| **Trạng thái** | Đề xuất (chưa giao sprint) |

---

## UC-01.7 · Cập nhật thông tin cá nhân

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **cập nhật họ tên và số điện thoại**, để **thông tin trên đơn hàng chính xác**.

### Điều kiện trước
- Người dùng đã đăng nhập.

### Điều kiện sau
- `users.full_name` và / hoặc `users.phone` được cập nhật.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Truy cập trang "Thông tin cá nhân" | Lấy và hiện dữ liệu hiện tại |
| 2 | Chỉnh sửa và bấm "Lưu" | Kiểm tra số điện thoại (10 chữ số, bắt đầu 0) |
| 3 | | Cập nhật bảng `users`, trả 200 |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Số điện thoại đã dùng bởi tài khoản khác | Trả 409 `PHONE_ALREADY_EXISTS` |
| E2 | Định dạng số điện thoại sai | Trả 400 `INVALID_PHONE` |

### Tiêu chí chấp nhận
- [ ] **AC1** `PATCH /api/users/me` với họ tên mới trả 200 và dữ liệu đã cập nhật
- [ ] **AC2** Số điện thoại trùng tài khoản khác trả 409
- [ ] **AC3** Token hết hạn trả 401

---

## UC-01.8 · Quản lý địa chỉ giao hàng

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **thêm, sửa, xóa địa chỉ giao hàng và đặt một địa chỉ mặc định**, để **chọn nhanh khi đặt hàng**.

### Điều kiện trước
- Người dùng đã đăng nhập.

### Điều kiện sau
- Bảng `addresses` được tạo / cập nhật / xóa theo yêu cầu.
- Chỉ một địa chỉ có `is_default = true` tại một thời điểm.

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Mỗi user chỉ có tối đa một `is_default = true`; đổi mặc định phải cập nhật atomically |
| BR2 | Không xóa cứng địa chỉ đang được tham chiếu trong đơn hàng đang xử lý |

### Tiêu chí chấp nhận
- [ ] **AC1** `POST /api/users/me/addresses` tạo địa chỉ mới trả 201 với dữ liệu đầy đủ
- [ ] **AC2** Đặt mặc định mới thì địa chỉ cũ mặc định chuyển thành `false`
- [ ] **AC3** `DELETE` địa chỉ của tài khoản khác trả 403 Forbidden

---

## UC-01.9 · Cập nhật hồ sơ vóc dáng (Fit Profile)

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **nhập số đo vóc dáng và phong cách mặc ưa thích**, để **nhận gợi ý size phù hợp hơn khi xem sản phẩm**.

### Điều kiện trước
- Người dùng đã đăng nhập và đồng ý điều khoản dữ liệu vóc dáng.

### Điều kiện sau
- `fit_profiles` được tạo hoặc cập nhật theo `user_id`.

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | `fit_profiles.consent_at` phải được ghi nhận trước khi lưu số đo |
| BR2 | Tất cả số đo là tuỳ chọn, không bắt buộc nhập đủ |

### Tiêu chí chấp nhận
- [ ] **AC1** `PUT /api/users/me/fit-profile` không có `consent_at` trả 400
- [ ] **AC2** `GET /api/users/me/fit-profile` trả null nếu tài khoản chưa từng lưu số đo
