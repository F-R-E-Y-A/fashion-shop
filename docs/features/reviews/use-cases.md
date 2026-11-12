---
title: Đánh giá sản phẩm — Đề xuất Use Cases Đợt 1
updated: 2026-11-12
status: đề xuất thảo luận — chờ Duy/Bảo thống nhất mã định danh UC chính thức
owner: Tài
---
# Đánh giá sản phẩm — Đề xuất Use Cases

**Chức năng:** Mô tả các trường hợp sử dụng (Use Cases) đề xuất cho phân hệ Đánh giá sản phẩm Đợt 1 (Issue #96).

> [!NOTE]
> Mã UC dưới đây là đề xuất phục vụ triển khai kỹ thuật cho Issue #96, không tự ý gán mã UC chính thức khi chưa có sự thống nhất từ nhóm kiến trúc (Bảo/Duy).

## Đề xuất UC-REV-01: Gửi đánh giá cho sản phẩm đã mua

### Mục tiêu & Tác nhân
- **Tác nhân:** Khách hàng đã đăng nhập (`CUSTOMER`).
- **Mục tiêu:** Đánh giá chất lượng sản phẩm (số sao từ 1 đến 5 và lời nhận xét tùy chọn) cho sản phẩm thuộc đơn hàng đã giao thành công.

### Tiền điều kiện
1. Khách hàng đã đăng nhập vào hệ thống.
2. Đơn hàng thuộc sở hữu của khách hàng (`userId` khớp token).
3. Đơn hàng có trạng thái `DELIVERED` trong lịch sử trạng thái đơn hàng (`OrderStatusHistory`).
4. Dòng hàng (`orderItemId`) chưa từng được gửi đánh giá hợp lệ trước đó.

### Luồng sự kiện chính
1. Khách hàng truy cập trang chi tiết đơn hàng (`/don-hang/:id`).
2. Giao diện hiển thị nút "Viết đánh giá" cho các sản phẩm đủ điều kiện.
3. Khách hàng bấm nút, giao diện mở form nhập gồm:
   - Thang điểm sao 1 đến 5 (có thể chọn bằng chuột hoặc phím Tab/Space).
   - Ô nhập nhận xét tối đa 2000 ký tự (có hiển thị bộ đếm ký tự thời gian thực).
4. Khách hàng chọn số sao, nhập cảm nhận và bấm "Gửi đánh giá".
5. Hệ thống ghi nhận đánh giá với trạng thái `PENDING` (chờ duyệt) và phản hồi thành công.
6. Giao diện chuyển sang trạng thái đã gửi đánh giá, hiển thị huy hiệu "Đang chờ duyệt" và khóa form.

### Luồng ngoại lệ
- **3a. Chưa từng DELIVERED:** Trả về `422 Unprocessable Entity` với lý do `NOT_DELIVERED`.
- **4a. Dòng hàng của người khác (IDOR):** Trả về `404 Not Found`.
- **4b. Gửi lại cùng nội dung (Idempotency):** Trả về bản ghi đánh giá đã commit trước đó.
- **4c. Gửi lại khác nội dung/sao:** Trả về `409 Conflict`.
- **4d. Dữ liệu không hợp lệ:** Sao không thuộc [1..5] hoặc nội dung > 2000 ký tự: Trả về `400 Bad Request`.

---

## Đề xuất UC-REV-02: Xem danh sách đánh giá công khai của sản phẩm

### Mục tiêu & Tác nhân
- **Tác nhân:** Mọi người dùng (khách vãng lai hoặc khách đã đăng nhập).
- **Mục tiêu:** Tham khảo các đánh giá khách quan của người mua trước về sản phẩm trước khi đưa ra quyết định mua sắm.

### Tiền điều kiện
- Sản phẩm đang ở trạng thái hoạt động công khai ngoài cửa hàng (`isActive: true` và `adminDisabled: false`).

### Luồng sự kiện chính
1. Người dùng truy cập trang chi tiết sản phẩm (`/san-pham/:slug`).
2. Cuối trang hiển thị khu vực "Đánh giá của khách hàng".
3. Hệ thống tải danh sách đánh giá công khai:
   - Chỉ lọc các bản ghi có `moderationStatus = 'APPROVED'` và `deletedAt = null`.
   - Dữ liệu trả về chỉ gồm: mã định danh đánh giá, số sao, nội dung và thời điểm đánh giá (tuyệt đối không lộ danh tính khách hàng).
4. Người dùng có thể phân trang xem các đánh giá tiếp theo nếu có nhiều đánh giá.

### Luồng ngoại lệ
- **1a. Sản phẩm bị ẩn hoặc không tồn tại:** Trả về `404 Not Found`.
- **3a. Chưa có đánh giá nào được duyệt:** Hiển thị thông điệp trống "Chưa có đánh giá được duyệt".
