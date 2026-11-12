---
title: Đặc tả Tổng quan quản trị chỉ đọc — Issue92
updated: 2026-11-11
status: đang triển khai Issue92
owner: Tài
---
# Đặc tả Tổng quan vận hành cửa hàng (Issue #92 — đề xuất, chờ Duy/Bảo duyệt mã UC)

**Chức năng:** Định nghĩa yêu cầu chức năng, tiêu chí chấp nhận và quy tắc kiểm thử cho màn hình Tổng quan quản trị theo Issue #92.

## 1. Luồng chính

1. ADMIN điều hướng vào `/admin`.
2. Hệ thống kiểm tra quyền qua `RequireAdmin` ngoài `AdminLayout`.
3. Trang tải song song 5 truy vấn độc lập:
   - Người dùng: `GET /api/admin/users?page=1&pageSize=1`
   - Sản phẩm: `GET /api/admin/products?status=all&page=1&pageSize=1`
   - Đơn hàng: `GET /api/admin/orders?page=1&pageSize=1` (thẻ liên kết UI trỏ tới `/admin/orders?tab=all`)
   - Cần xử lý: `GET /api/admin/orders?attention=true&page=1&pageSize=5`
   - Tồn thấp: `GET /api/admin/inventory/low-stock?threshold=5&limit=5`
4. Giao diện dựng 4 thẻ KPI và 2 bảng dữ liệu tối đa 5 dòng.
5. ADMIN có thể nhấn vào các thẻ/dòng để chuyển sang trang chi tiết, hoặc bấm "Làm mới" để cập nhật số liệu.

## 2. Tiêu chí chấp nhận

- **AC1 (KPI counts)**: Mọi số liệu KPI đều trích xuất từ thuộc tính `total` do máy chủ trả về, tuyệt đối không đếm `items.length` tại trình duyệt. Giá trị `total = 0` hiển thị rõ số 0.
- **AC2 (Attention query sharing)**: Thẻ KPI "Cần xử lý" và bảng "Đơn cần đối soát/xử lý" dùng chung đúng một useQuery hook với `pageSize=5`. Initial fetch chỉ gửi đúng 1 HTTP request.
- **AC3 (Low stock warning)**: Bảng "Tồn thấp" hiển thị các biến thể có `availableQuantity <= threshold` (mặc định 5). Lọc trên toàn bộ cơ sở dữ liệu trước khi `LIMIT`, không lọc trên client.
- **AC4 (Partial failure isolation)**: Khi một khối gặp lỗi 5xx hoặc mất mạng, chỉ riêng khối đó hiển thị trạng thái lỗi và nút "Thử lại". Các khối khác vẫn hiển thị số liệu bình thường.
- **AC5 (Actor-safe 403 enforcement)**: Nhận 403 ở bất kỳ khối nào lập tức kích hoạt `markForbidden()`, dọn sạch cache của actor và ẩn toàn bộ trang bằng `AdminForbidden`. Các request về muộn bị từ chối qua `SessionChangedError`.
- **AC6 (Safe refresh coordination)**: Nút "Làm mới" gọi refetch song song, hiển thị trạng thái "Đang làm mới…" và bị vô hiệu hóa để chống click lặp.
- **AC7 (Responsive & accessibility)**: Giao diện dạng lưới trên máy tính và dạng thẻ xếp chồng trên di động 360px (scrollWidth <= innerWidth); vùng chạm tối thiểu 44px; không lồng phím/thẻ tương tác (tách biệt Link và button khi có lỗi, loại bỏ hoàn toàn cấu trúc a button / button a); hỗ trợ bàn phím và prefers-reduced-motion.
