---
title: Danh mục use case
updated: 2026-10-01
status: đang dùng
owner: Duy
---
# Danh mục use case

**Chức năng:** Danh mục toàn bộ 49 use case của hệ thống: mã, tác nhân, độ ưu tiên, phân hệ và trạng thái đặc tả.

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| **UC-01** | **Tài khoản & Xác thực** | | | | | **PH-03** | | |
| UC-01.1 | Đăng ký tài khoản | Khách vãng lai | Người dùng | Phải có | Vừa | PH-03 | Duy · Tài | Đã viết |
| UC-01.2 | Xác thực email qua mã OTP | Khách vãng lai | Mục tiêu con | Phải có | Vừa | PH-03 | Tài | Đã viết |
| UC-01.3 | Đăng nhập hệ thống | Khách hàng | Người dùng | Phải có | Vừa | PH-03 | Duy · Tài | Đã viết |
| UC-01.4 | Làm mới phiên và Đăng xuất | Khách hàng | Mục tiêu con | Phải có | Thấp | PH-03 | Tài | Đã viết |
| UC-01.5 | Quên và đặt lại mật khẩu | Khách vãng lai | Người dùng | Phải có | Vừa | PH-03 | Duy · Tài | Đã viết |
| UC-01.6 | Đổi mật khẩu tài khoản | Khách hàng | Người dùng | Phải có | Thấp | PH-03 | Tài | Đã viết |
| UC-01.7 | Cập nhật thông tin cá nhân | Khách hàng | Người dùng | Nên có | Thấp | — | Duy | Đã viết |
| UC-01.8 | Quản lý địa chỉ giao hàng | Khách hàng | Người dùng | Nên có | Vừa | — | Duy | Đã viết |
| UC-01.9 | Cập nhật hồ sơ vóc dáng | Khách hàng | Người dùng | Có thì tốt | Thấp | — | Duy | Đã viết |
| **UC-02** | **Quản trị tài khoản & Phân quyền** | | | | | **PH-03** | | |
| UC-02.1 | Quản trị tài khoản và Khóa người dùng | Quản trị viên | Người dùng | Phải có | Vừa | PH-03 | Tài | Đã viết |
| UC-02.2 | Quản lý nhân viên và Phân quyền | Quản trị viên | Người dùng | Nên có | Cao | — | — | Chưa viết |
| **UC-03** | **Khám phá sản phẩm** | | | | | **PH-01** | | |
| UC-03.1 | Duyệt danh mục sản phẩm | Khách vãng lai | Người dùng | Phải có | Vừa | PH-01 | Duy · Bảo | Đã viết |
| UC-03.2 | Tìm kiếm sản phẩm | Khách vãng lai | Người dùng | Phải có | Vừa | — | Bảo | Đã viết |
| UC-03.3 | Lọc và sắp xếp sản phẩm | Khách vãng lai | Mục tiêu con | Phải có | Vừa | PH-01 | Duy · Bảo | Đã viết |
| UC-03.4 | Xem chi tiết sản phẩm | Khách vãng lai | Người dùng | Phải có | Cao | PH-01 | Duy · Bảo | Đã viết |
| UC-03.5 | Xem hướng dẫn chọn cỡ | Khách vãng lai | Mục tiêu con | Có thì tốt | Thấp | — | Bảo | Đã viết |
| **UC-04** | **Quản lý danh mục & Sản phẩm** | | | | | — | | |
| UC-04.1 | Quản lý danh mục sản phẩm | Nhân viên | Người dùng | Phải có | Vừa | — | — | Chưa viết |
| UC-04.2 | Quản lý thông tin sản phẩm | Nhân viên | Người dùng | Phải có | Cao | — | — | Chưa viết |
| UC-04.3 | Quản lý biến thể và mã SKU | Nhân viên | Mục tiêu con | Phải có | Cao | — | — | Chưa viết |
| UC-04.4 | Quản lý thư viện ảnh sản phẩm | Nhân viên | Mục tiêu con | Phải có | Vừa | — | — | Chưa viết |
| UC-04.5 | Quản lý bảng quy đổi kích cỡ | Nhân viên | Mục tiêu con | Có thì tốt | Thấp | — | — | Chưa viết |
| **UC-05** | **Giỏ hàng** | | | | | **PH-02** | | |
| UC-05.1 | Xem giỏ hàng | Khách vãng lai | Người dùng | Phải có | Thấp | PH-02 | Duy | Đã viết |
| UC-05.2 | Thêm biến thể vào giỏ hàng | Khách vãng lai | Người dùng | Phải có | Vừa | PH-02 | Duy | Đã viết |
| UC-05.3 | Cập nhật số lượng và xóa món | Khách vãng lai | Người dùng | Phải có | Thấp | PH-02 | Duy | Đã viết |
| UC-05.4 | Xóa toàn bộ giỏ hàng | Khách vãng lai | Người dùng | Phải có | Thấp | PH-02 | Duy | Đã viết |
| UC-05.5 | Hợp nhất giỏ hàng khi đăng nhập | Khách hàng | Mục tiêu con | Phải có | Vừa | PH-02 | Duy | Đã viết |
| **UC-06** | **Danh sách yêu thích** | | | | | — | | |
| UC-06.1 | Quản lý sản phẩm yêu thích | Khách hàng | Người dùng | Nên có | Thấp | — | — | Chưa viết |
| **UC-07** | **Đặt hàng** | | | | | — | | |
| UC-07.1 | Tạo đơn đặt hàng | Khách hàng | Người dùng | Phải có | Cao | — | — | Chưa viết |
| UC-07.2 | Áp dụng mã giảm giá | Khách hàng | Mục tiêu con | Phải có | Vừa | — | — | Chưa viết |
| UC-07.3 | Theo dõi trạng thái đơn hàng | Khách hàng | Người dùng | Phải có | Vừa | — | — | Chưa viết |
| UC-07.4 | Hủy đơn hàng trước giao | Khách hàng | Người dùng | Nên có | Vừa | — | — | Chưa viết |
| **UC-08** | **Thanh toán** | | | | | — | | |
| UC-08.1 | Thanh toán đơn hàng trực tuyến | Khách hàng | Người dùng | Phải có | Cao | — | — | Chưa viết |
| UC-08.2 | Xác nhận thanh toán qua Webhook | Cổng thanh toán | Mục tiêu con | Phải có | Cao | — | — | Chưa viết |
| **UC-09** | **Giao nhận vận chuyển** | | | | | — | | |
| UC-09.1 | Tạo vận đơn giao hàng | Nhân viên | Người dùng | Phải có | Vừa | — | — | Chưa viết |
| UC-09.2 | Cập nhật trạng thái giao hàng | Shipper | Người dùng | Phải có | Vừa | — | — | Chưa viết |
| UC-09.3 | Xác nhận giao hàng thành công | Shipper | Mục tiêu con | Phải có | Thấp | — | — | Chưa viết |
| **UC-10** | **Khuyến mãi & Giảm giá** | | | | | — | | |
| UC-10.1 | Quản lý chương trình khuyến mãi | Nhân viên | Người dùng | Nên có | Cao | — | — | Chưa viết |
| UC-10.2 | Quản lý mã giảm giá coupon | Nhân viên | Người dùng | Phải có | Vừa | — | — | Chưa viết |
| UC-10.3 | Thống kê hiệu quả mã giảm giá | Nhân viên | Mục tiêu con | Có thì tốt | Thấp | — | — | Chưa viết |
| **UC-11** | **Đánh giá sản phẩm** | | | | | — | | |
| UC-11.1 | Đánh giá và nhận xét sản phẩm | Khách hàng | Người dùng | Nên có | Vừa | — | — | Chưa viết |
| UC-11.2 | Duyệt và phản hồi đánh giá | Nhân viên | Người dùng | Nên có | Thấp | — | — | Chưa viết |
| **UC-12** | **Xử lý đơn hàng vận hành** | | | | | — | | |
| UC-12.1 | Tiếp nhận và xác nhận đơn | Nhân viên | Người dùng | Phải có | Vừa | — | — | Chưa viết |
| UC-12.2 | Đóng gói và giao vận chuyển | Nhân viên | Mục tiêu con | Phải có | Thấp | — | — | Chưa viết |
| **UC-13** | **Tồn kho & Nhập hàng** | | | | | — | | |
| UC-13.1 | Xem tồn kho biến thể theo SKU | Nhân viên | Người dùng | Phải có | Vừa | — | Duy | Đã viết |
| UC-13.2 | Nhập hàng và điều chỉnh tồn kho | Nhân viên | Người dùng | Phải có | Cao | — | Duy | Đã viết |
| UC-13.3 | Tra cứu lịch sử biến động kho | Nhân viên | Mục tiêu con | Nên có | Vừa | — | Duy | Đã viết |
| UC-13.4 | Đăng ký thông báo khi có hàng lại | Khách hàng | Người dùng | Có thì tốt | Thấp | — | Duy | Đã viết |
| **UC-14** | **Đổi trả & Hoàn tiền** | | | | | — | | |
| UC-14.1 | Yêu cầu đổi trả sản phẩm | Khách hàng | Người dùng | Nên có | Vừa | — | — | Chưa viết |
| UC-14.2 | Thẩm định và xử lý yêu cầu | Nhân viên | Người dùng | Nên có | Cao | — | — | Chưa viết |
| UC-14.3 | Thực hiện hoàn tiền đơn hàng | Nhân viên | Mục tiêu con | Nên có | Cao | — | — | Chưa viết |
| UC-14.4 | Đổi biến thể hoặc sản phẩm khác | Nhân viên | Mục tiêu con | Có thì tốt | Vừa | — | — | Chưa viết |
| **UC-15** | **Thông báo** | | | | | — | | |
| UC-15.1 | Nhận và quản lý thông báo | Khách hàng | Người dùng | Nên có | Thấp | — | — | Chưa viết |
| **UC-16** | **Báo cáo & Cấu hình** | | | | | — | | |
| UC-16.1 | Báo cáo doanh thu và bán hàng | Quản trị viên | Người dùng | Phải có | Cao | — | — | Chưa viết |
| UC-16.2 | Thiết lập thông số hệ thống | Quản trị viên | Người dùng | Nên có | Vừa | — | — | Chưa viết |

## Quy ước các cột

- **Mức**: Mục tiêu người dùng (hoàn thành một nhu cầu trọn vẹn) hoặc Mục tiêu con (bước phụ hoặc phân rã bên trong).
- **Độ ưu tiên**: Phải có, Nên có, Có thì tốt theo phân loại MoSCoW.
- **Mã use case**: `UC-NN.m` với `NN` là nhóm chức năng (01 đến 16), `m` là số thứ tự use case trong nhóm ([AGENTS.md](../../AGENTS.md)).
- **Dòng việc**: Mã Issue `PH-NN` tương ứng trong kế hoạch sprint.
