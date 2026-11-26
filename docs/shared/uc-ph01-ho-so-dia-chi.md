---
title: Hồ sơ cá nhân, sổ địa chỉ và vóc dáng — đặc tả nguồn S2
updated: 2026-11-25
status: lịch sử, xem thêm docs/features/users
owner: Duy
---
# UC-01.7 · UC-01.8 · UC-01.9 · Hồ sơ cá nhân, địa chỉ và vóc dáng

**Chức năng:** Đặc tả nguồn Sprint 2 tách từ tài liệu tài khoản: cập nhật thông tin cá nhân, quản lý sổ địa chỉ giao hàng và hồ sơ vóc dáng.

> Tách từ [uc-ph01-tai-khoan-xac-thuc.md](uc-ph01-tai-khoan-xac-thuc.md) để giữ mỗi tệp dưới 300 dòng (luật 8). Tài liệu triển khai hiện hành của `users` xem tại [profile-address.md](../features/users/profile-address.md).

---

## PH-01.5 · Cập nhật thông tin cá nhân (nay là UC-01.7)

### Câu chuyện người dùng

Là một **khách hàng**, tôi muốn **cập nhật họ tên và số điện thoại**, để **thông tin trên đơn hàng chính xác**.

### Điều kiện trước

- Người dùng đã đăng nhập.

### Điều kiện sau

- `USERS.full_name` và / hoặc `USERS.phone` được cập nhật.

### Luồng chính

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Truy cập trang "Thông tin cá nhân" | Lấy và hiện dữ liệu hiện tại |
| 2 | Chỉnh sửa và bấm "Lưu" | Kiểm tra số điện thoại (10 chữ số, bắt đầu 0) |
| 3 | | Cập nhật `USERS`, trả 200 |

### Luồng phụ và ngoại lệ

| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Số điện thoại đã dùng bởi tài khoản khác | Trả 409 `phone_already_exists` |
| E2 | Định dạng số điện thoại sai | Trả 422 `invalid_phone` |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/users/me` | — | `{ id, email, phone, full_name }` | 401 |
| PATCH | `/api/users/me` | `{ full_name?, phone? }` | `{ user }` | 409, 422 |

### Tiêu chí chấp nhận

- [ ] PATCH `/api/users/me` với họ tên mới trả 200 và dữ liệu đã cập nhật
- [ ] Số điện thoại trùng tài khoản khác trả 409
- [ ] Token hết hạn trả 401

---

## PH-01.6 · Quản lý địa chỉ giao hàng (nay là UC-01.8)

### Câu chuyện người dùng

Là một **khách hàng**, tôi muốn **thêm, sửa, xóa địa chỉ giao hàng và đặt một địa chỉ mặc định**, để **chọn nhanh khi đặt hàng**.

### Điều kiện trước

- Người dùng đã đăng nhập.

### Điều kiện sau

- `ADDRESSES` được tạo / cập nhật / xóa theo yêu cầu.
- Chỉ một địa chỉ có `is_default = true` tại một thời điểm.

### Luồng chính — Thêm địa chỉ

| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Điền recipient_name, phone, tỉnh/xã, địa chỉ cụ thể | |
| 2 | Tích "Đặt làm mặc định" (tuỳ chọn) | |
| 3 | Bấm "Lưu" | Nếu `is_default = true`, cập nhật địa chỉ cũ thành `false` trước |
| 4 | | Lưu bản ghi mới, trả 201 |

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | Mỗi user chỉ có một `is_default = true`; thay đổi mặc định phải cập nhật atomically |
| BR2 | Không xóa địa chỉ đang được tham chiếu trong `ORDER_ADDRESSES` (snapshot đã tạo, không ảnh hưởng) |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/users/me/addresses` | — | `[Address]` | 401 |
| POST | `/api/users/me/addresses` | `{ recipient_name, phone, province_code, ward_code, address_line, is_default? }` | `{ address }` | 422 |
| PUT / PATCH | `/api/users/me/addresses/:id` | `{ ...fields }` | `{ address }` | 403, 404 |
| DELETE | `/api/users/me/addresses/:id` | — | 204 | 403, 404 |

### Tiêu chí chấp nhận

- [ ] POST tạo địa chỉ mới trả 201 với dữ liệu đầy đủ
- [ ] Đặt mặc định: địa chỉ cũ mặc định chuyển thành `false` atomically
- [ ] DELETE địa chỉ không phải của mình trả 403 / 404
- [ ] GET trả danh sách địa chỉ của user hiện tại, không lộ địa chỉ user khác

---

## PH-01.7 · Cập nhật hồ sơ vóc dáng (nay là UC-01.9)

### Câu chuyện người dùng

Là một **khách hàng**, tôi muốn **nhập số đo vóc dáng và phong cách mặc ưa thích**, để **nhận gợi ý size phù hợp hơn khi xem sản phẩm**.

### Điều kiện trước

- Người dùng đã đăng nhập.
- Người dùng đã đọc và đồng ý chính sách dữ liệu cá nhân.

### Điều kiện sau

- `FIT_PROFILES` được tạo hoặc cập nhật (UPSERT theo `user_id`).

### Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR1 | `FIT_PROFILES.consent_at` phải được ghi nhận trước khi lưu số đo |
| BR2 | Tất cả số đo là tuỳ chọn, không bắt buộc nhập đủ |
| BR3 | Xóa hồ sơ vóc dáng: đặt tất cả số đo về NULL, giữ `consent_at` |

### Hợp đồng API

| Phương thức | Đường dẫn | Vào | Ra | Mã lỗi |
|---|---|---|---|---|
| GET | `/api/users/me/fit-profile` | — | `{ FitProfile \| null }` | 401 |
| PUT | `/api/users/me/fit-profile` | `{ height_cm?, weight_kg?, chest_cm?, waist_cm?, hip_cm?, preferred_fit?, consent_at }` | `{ fit_profile }` | 422 |

### Tiêu chí chấp nhận

- [ ] PUT không có `consent_at` trả 422
- [ ] PUT hợp lệ tạo hoặc cập nhật `FIT_PROFILES`, trả 200
- [ ] GET trả null nếu chưa tạo hồ sơ
- [ ] Tất cả số đo là số dương hoặc null; giá trị âm trả 422

---

## Câu hỏi còn treo

1. `FIT_PROFILES` hiện chưa triển khai ở backend và frontend (ngoài phạm vi phát hành hiện tại); xem [use-case-index.md](use-case-index.md).
