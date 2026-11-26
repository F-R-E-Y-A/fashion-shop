---
title: Danh mục use case toàn hệ thống
updated: 2026-11-25
status: đang dùng
owner: Duy
---
# Danh mục use case toàn hệ thống

**Chức năng:** Đối chiếu toàn bộ 55 use case từ UC-01 đến UC-16 theo bộ số PR #26 cộng UC-11.3: tác nhân, phân hệ và trạng thái cài đặt thực tế.

> Tổng hợp 54 use case chuẩn hoá từ [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26) (`HT-04`) cộng `UC-11.3` của phân hệ đánh giá: tổng **55 use case** (**47/55 đã cài đặt E2E** qua API & Web, 8/55 phạm vi mở rộng). Sơ đồ quan hệ xem tại [uc-tong-quan.md](diagrams/uc-tong-quan.md).

| Mã | Tên use case | Tác nhân chính | Phân hệ / Mã | Trạng thái cài đặt | Đặc tả |
|---|---|---|---|---|---|
| UC-01.1 | Đăng ký tài khoản | Khách vãng lai | `auth` (Tài) | Đã cài E2E | [uc-ph01](uc-ph01-tai-khoan-xac-thuc.md) |
| UC-01.2 | Xác thực email qua mã OTP | Khách vãng lai | `auth` (Tài) | Đã cài E2E | [auth/README.md](../features/auth/README.md) |
| UC-01.3 | Đăng nhập hệ thống | Khách hàng | `auth` (Tài) | Đã cài E2E | [uc-ph01](uc-ph01-tai-khoan-xac-thuc.md) |
| UC-01.4 | Làm mới phiên và đăng xuất | Khách hàng | `auth` (Tài) | Đã cài E2E | [auth/use-cases.md](../features/auth/use-cases.md) |
| UC-01.5 | Quên và đặt lại mật khẩu | Khách vãng lai | `auth` (Tài) | Đã cài E2E | [uc-ph01](uc-ph01-tai-khoan-xac-thuc.md) |
| UC-01.6 | Đổi mật khẩu tài khoản | Khách hàng | `auth` (Tài) | Đã cài E2E | [auth/README.md](../features/auth/README.md) |
| UC-01.7 | Cập nhật thông tin cá nhân | Khách hàng | `users` (Tài) | Đã cài E2E | [uc-ph01-ho-so](uc-ph01-ho-so-dia-chi.md) |
| UC-01.8 | Quản lý địa chỉ giao hàng | Khách hàng | `users` (Tài) | Đã cài E2E | [uc-ph01-ho-so](uc-ph01-ho-so-dia-chi.md) |
| UC-01.9 | Cập nhật hồ sơ vóc dáng | Khách hàng | `users` (Duy) | Chưa cài | [uc-ph01-ho-so](uc-ph01-ho-so-dia-chi.md) |
| UC-02.1 | Quản trị tài khoản và khóa người dùng | Quản trị viên | `users` (Tài) | Đã cài E2E | [users/use-cases.md](../features/users/use-cases.md) |
| UC-02.2 | Quản lý nhân viên và phân quyền | Quản trị viên | `users` (Tài) | Chưa cài (`ND-03`) | [users/README.md](../features/users/README.md) |
| UC-03.1 | Duyệt danh mục sản phẩm | Khách vãng lai | `products` (Bảo) | Đã cài E2E | [products/use-cases.md](../features/products/use-cases.md) |
| UC-03.2 | Tìm kiếm sản phẩm | Khách vãng lai | `products` (Bảo) | Đã cài E2E | [products/use-cases.md](../features/products/use-cases.md) |
| UC-03.3 | Lọc và sắp xếp sản phẩm | Khách vãng lai | `products` (Bảo) | Đã cài E2E (`ND-14`) | [products/use-cases.md](../features/products/use-cases.md) |
| UC-03.4 | Xem chi tiết sản phẩm | Khách vãng lai | `products` (Bảo) | Đã cài E2E | [products/use-cases.md](../features/products/use-cases.md) |
| UC-03.5 | Xem hướng dẫn chọn cỡ | Khách vãng lai | `products` (Bảo) | Đã cài bảng tĩnh PDP | [products/use-cases.md](../features/products/use-cases.md) |
| UC-04.1 | Quản lý danh mục sản phẩm | Quản trị viên | `products` (Tài) | Đã cài E2E | [admin-categories](../features/products/use-cases-admin-categories.md) |
| UC-04.2 | Quản lý thông tin & trạng thái sản phẩm | Quản trị viên | `products` (Tài) | Đã cài E2E | [create](../features/products/use-cases-admin-create.md) · [status](../features/products/use-cases-admin-status.md) · [content](../features/products/use-cases-admin-content.md) |
| UC-04.3 | Quản lý biến thể và mã SKU | Quản trị viên | `products` (Tài) | Đã cài E2E | [admin-variants](../features/products/use-cases-admin-variants.md) |
| UC-04.4 | Quản lý thư viện ảnh sản phẩm | Quản trị viên | `products` (Tài) | Đã cài E2E | [admin-media](../features/products/use-cases-admin-media.md) |
| UC-04.5 | Quản lý bảng quy đổi kích cỡ | Quản trị viên | — | Chưa cài | — |
| UC-05.1 | Xem giỏ hàng | Khách vãng lai | `cart` (Duy) | Đã cài E2E | [cart/README.md](../features/cart/README.md) |
| UC-05.2 | Thêm biến thể vào giỏ hàng | Khách vãng lai | `cart` (Duy) | Đã cài E2E | [cart/README.md](../features/cart/README.md) |
| UC-05.3 | Cập nhật số lượng, chọn & xóa món | Khách vãng lai | `cart` (Duy) | Đã cài E2E | [cart/README.md](../features/cart/README.md) |
| UC-05.4 | Xóa toàn bộ giỏ hàng | Khách vãng lai | `cart` (Duy) | Đã cài E2E | [cart/README.md](../features/cart/README.md) |
| UC-05.5 | Hợp nhất giỏ hàng khi đăng nhập | Khách hàng | `cart` (Duy) | Đã cài E2E | [cart/README.md](../features/cart/README.md) |
| UC-06.1 | Quản lý sản phẩm yêu thích | Khách hàng | `catalog.prisma` | Chưa cài (mới có bảng) | — |
| UC-07.1 | Tạo đơn đặt hàng | Khách hàng | `checkout` (Bảo) | Đã cài E2E | [checkout/use-cases.md](../features/checkout/use-cases.md) |
| UC-07.2 | Áp dụng mã giảm giá & khuyến mãi | Khách hàng | `promotions` (Duy) | Đã cài E2E | [promotions/use-cases.md](../features/promotions/use-cases.md) |
| UC-07.3 | Theo dõi trạng thái đơn hàng | Khách hàng | `checkout` (Bảo) | Đã cài E2E | [checkout/use-cases.md](../features/checkout/use-cases.md) |
| UC-07.4 | Hủy đơn hàng trước giao | Khách hàng | `checkout` (Bảo) | Đã cài E2E | [checkout/use-cases.md](../features/checkout/use-cases.md) |
| UC-08.1 | Thanh toán đơn hàng trực tuyến | Khách hàng | `payments` (Bảo) | Đã cài E2E | [payments/use-cases.md](../features/payments/use-cases.md) |
| UC-08.2 | Xác nhận thanh toán qua Webhook | Cổng thanh toán | `payments` (Bảo) | Đã cài E2E | [payments/use-cases.md](../features/payments/use-cases.md) |
| UC-09.1 | Tạo vận đơn giao hàng GHN | Quản trị viên | `shipping` (Duy) | Đã cài E2E | [shipping/README.md](../features/shipping/README.md) |
| UC-09.2 | Cập nhật trạng thái giao hàng | Shipper / GHN | `shipping` (Duy) | Đã cài E2E | [shipping/README.md](../features/shipping/README.md) |
| UC-09.3 | Xác nhận giao hàng thành công | Shipper / QTV | `checkout` / `shipping` | Đã cài E2E | [checkout/use-cases.md](../features/checkout/use-cases.md) |
| UC-10.1 | Quản lý chương trình khuyến mãi | Quản trị viên | `promotions` (Duy) | Đã cài E2E | [promotions/use-cases.md](../features/promotions/use-cases.md) |
| UC-10.2 | Quản lý mã giảm giá coupon | Quản trị viên | `promotions` (Duy) | Đã cài E2E | [promotions/use-cases.md](../features/promotions/use-cases.md) |
| UC-10.3 | Thống kê hiệu quả mã giảm giá | Quản trị viên | `promotions` | Chưa cài UI/API riêng | [promotions/README.md](../features/promotions/README.md) |
| UC-11.1 | Đánh giá và nhận xét sản phẩm | Khách hàng | `reviews` (Bảo) | Đã cài E2E | [reviews/use-cases.md](../features/reviews/use-cases.md) |
| UC-11.2 | Duyệt và phản hồi đánh giá | Quản trị viên | `reviews` (Bảo) | Đã cài E2E | [reviews/use-cases.md](../features/reviews/use-cases.md) |
| UC-11.3 | Xem, bình chọn và báo cáo đánh giá | Khách vãng lai | `reviews` (Bảo) | Đã cài E2E | [reviews/use-cases.md](../features/reviews/use-cases.md) |
| UC-12.1 | Tiếp nhận và xác nhận đơn | Quản trị viên | `checkout` / `orders` | Đã cài E2E | [checkout](../features/checkout/use-cases.md) · [orders](../features/orders/use-cases.md) |
| UC-12.2 | Đóng gói và giao vận chuyển | Quản trị viên | `checkout` / `shipping` | Đã cài E2E | [checkout/use-cases.md](../features/checkout/use-cases.md) |
| UC-13.1 | Xem tồn kho biến thể theo SKU | Quản trị viên | `inventory` (Duy/Tài) | Đã cài E2E | [inventory/use-cases.md](../features/inventory/use-cases.md) |
| UC-13.2 | Nhập hàng và điều chỉnh tồn kho | Quản trị viên | `inventory` (Duy/Tài) | Đã cài E2E | [inventory/use-cases.md](../features/inventory/use-cases.md) |
| UC-13.3 | Tra cứu lịch sử biến động kho | Quản trị viên | `inventory` (Duy/Tài) | Đã cài E2E | [inventory/use-cases.md](../features/inventory/use-cases.md) |
| UC-13.4 | Đăng ký thông báo khi có hàng lại | Khách hàng | — | Chưa cài | [uc-ph13](uc-ph13-ton-kho.md) |
| UC-14.1 | Yêu cầu trả hàng | Khách hàng | `returns` (Bảo) | Đã cài E2E | [returns/use-cases.md](../features/returns/use-cases.md) |
| UC-14.2 | Thẩm định và xử lý yêu cầu trả | Quản trị viên | `returns` (Bảo) | Đã cài E2E | [returns/use-cases.md](../features/returns/use-cases.md) |
| UC-14.3 | Thực hiện hoàn tiền đơn hàng | Quản trị viên | `payments` / `checkout` | Đã cài E2E | [payments/use-cases.md](../features/payments/use-cases.md) |
| UC-14.4 | Đổi biến thể hoặc sản phẩm khác | Nhân viên | — | Chưa cài | — |
| UC-15.1 | Nhận và quản lý thông báo | Khách hàng / QTV | `notifications` (Duy) | Đã cài E2E | [notifications/README.md](../features/notifications/README.md) |
| UC-16.1 | Báo cáo doanh thu, bán hàng & tổng quan | Quản trị viên | `reporting` / `overview` | Đã cài E2E | [reporting](../features/reporting/use-cases.md) · [overview](../features/overview/use-cases.md) |
| UC-16.2 | Thiết lập thông số hệ thống | Quản trị viên | `SearchConfiguration` | Chưa cài UI quản trị | — |

## Ghi chú quy ước

- **Mã `UC-NN.m`**: nhóm `NN` (01–16), số thứ tự `m` theo [AGENTS.md](../../AGENTS.md). Lưu ý một số tài liệu cũ của `users` từng gọi `PH-01.5`/`PH-01.6` là `UC-01.5`/`UC-01.6`; theo bảng chuẩn hoá PR #26 là `UC-01.7` và `UC-01.8`.
- **Phạm vi mở rộng chưa cài (8 UC)**: `UC-01.9`, `UC-02.2`, `UC-04.5`, `UC-06.1`, `UC-10.3`, `UC-13.4`, `UC-14.4`, `UC-16.2`.
