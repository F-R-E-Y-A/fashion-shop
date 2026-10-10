## Thuộc công việc nào

Mã: PH-01
Sprint: S2 · 21/09 - 27/09
Closes #6

## Làm được gì

1. Cung cấp hàm nạp dữ liệu chuẩn hoá `ProductsService.importProducts()` theo hợp đồng M2, xử lý an toàn qua Transaction và đã nạp thành công 90 sản phẩm thật từ YODY.
2. Hoàn thiện toàn bộ REST API danh mục và sản phẩm: liệt kê (lọc danh mục con, sắp xếp giá/mới nhất, phân trang, nổi bật), chi tiết sản phẩm kèm biến thể/ảnh, sản phẩm liên quan và cây danh mục đa cấp.
3. Hoàn thiện giao diện web desktop chuẩn UX/UI: Trang chủ (khối Hàng mới về, Danh mục, Nổi bật với 100% ảnh thật), Trang danh mục (lưới sản phẩm, bộ lọc, sắp xếp, phân trang số), Trang chi tiết sản phẩm (gallery ảnh, chọn màu/cỡ đổi giá trực tiếp, mô tả HTML, sản phẩm liên quan) và tích hợp thanh điều hướng tài khoản sau khi đồng bộ với `develop`.

## Cách người duyệt tự kiểm

1. Kéo nhánh về, chạy `npm run check` và `npm run test:http` để xác nhận 100% kiểm thử xanh.
2. Chạy `npm run dev:api` và `npm run dev:web`, mở trình duyệt tại `http://localhost:5174/` để xem Trang chủ với hình ảnh sản phẩm YODY thật.
3. Nhấp vào danh mục "Áo thun", "Áo sơ mi", hoặc "Quần dài" trên menu để kiểm tra phân trang, sắp xếp và lọc.
4. Nhấp vào một sản phẩm bất kỳ để vào trang chi tiết `/san-pham/:slug`, chọn thử các nút màu sắc và kích cỡ để thấy ảnh và giá cập nhật động theo từng biến thể.

## Danh sách kiểm điều kiện hoàn thành

- [x] `npm run check` xanh trên máy trước khi mở
- [x] Có migration nếu phân hệ này đụng bảng dữ liệu, và có dữ liệu giả kèm theo
- [x] Đường dẫn API khớp đặc tả tại `/api/docs`, đã cập nhật chú thích Swagger
- [x] Có giao diện chạy được, không chỉ có API
- [x] Ba trạng thái đang tải, lỗi, không có dữ liệu đều có mặt
- [x] Có bài kiểm thử cho phần lõi, tên bài ghi mã tiêu chí chấp nhận dạng `UC-NN.m/ACk`
- [x] Đã cập nhật `docs/features/<module>/` (README, use-cases nếu nghiệp vụ đổi); có quyết định thì có mục `ADR` trong `LOG.md`; `npm run docs:lint` sạch (chỉ còn ngoại lệ uc-ph01/uc-ph13 của phân hệ khác)
- [x] Chạy được trên máy người khác sau khi kéo về, không cần sửa tay
- [x] Tích hợp liên tục báo xanh cả sáu chặng

## Sử dụng AI

- [x] Pull request này không có phần nào do AI sinh

## Có chạm vào phần của ai khác không

- [x] Không chạm (đã đồng bộ và giải quyết xung đột sạch sẽ với các route tài khoản của Tài từ nhánh `develop`)

## Phần biết là còn thiếu

- Chưa tích hợp khối "Đã xem gần đây" lưu tại local storage (sẽ bổ sung ở sprint tiếp theo sau khi chốt giỏ hàng với Duy).
