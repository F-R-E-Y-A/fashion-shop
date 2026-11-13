---
title: Danh mục use case
updated: 2026-11-12
status: khuôn, chờ chuẩn hoá từ pull request #26
owner: Duy
---
# Danh mục use case

**Chức năng:** Mỗi use case của hệ thống một dòng: mã, tác nhân, mức ưu tiên, đang thuộc dòng việc nào, đặc tả đã viết chưa.

> **Duy điền tệp này trong HT-04.** Bản chuẩn hoá 49 use case ở [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26) (`46a238c`) được Duy đóng, chưa gộp, ngày 05/11. Các dòng dưới là use case **đã có đặc tả trong kho**, dùng đúng bộ số của PR #26; dòng còn lại Duy thêm khi chốt danh mục.
>
> Mỗi use case một dòng. Ba use case khởi động là giỏ hàng, tài khoản và danh mục sản phẩm
> thì viết đặc tả đầy đủ ngay trong tuần 1, vì tuần 2 đã bắt đầu code tới.
> Các use case còn lại do người sở hữu phân hệ tự viết sâu khi tới lượt.

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| UC-03.1 | Duyệt danh mục sản phẩm | Khách vãng lai | Mục tiêu người dùng | Phải có | Vừa | PH-01 | Duy, Bảo | [Đã viết](../features/products/use-cases.md) |
| UC-03.2 | Tìm kiếm sản phẩm | Khách vãng lai | Mục tiêu người dùng | Phải có | Vừa | PH-01 | Bảo | [Đã viết](../features/products/use-cases.md) |
| UC-03.3 | Lọc và sắp xếp sản phẩm | Khách vãng lai | Mục tiêu con | Phải có | Vừa | PH-01 | Duy, Bảo | [Đã viết](../features/products/use-cases.md) |
| UC-03.4 | Xem chi tiết sản phẩm | Khách vãng lai | Mục tiêu người dùng | Phải có | Cao | PH-01 | Duy, Bảo | [Đã viết](../features/products/use-cases.md) |
| UC-03.5 | Xem hướng dẫn chọn cỡ | Khách vãng lai | Mục tiêu con | Có thì tốt | Thấp | — | Bảo | [Đã viết](../features/products/use-cases.md) |
| UC-07.1 | Tạo đơn đặt hàng | Khách hàng | Mục tiêu người dùng | Phải có | Cao | PH-11 | Bảo | [Đã viết](../features/checkout/use-cases.md) |
| UC-07.3 | Theo dõi trạng thái đơn hàng | Khách hàng | Mục tiêu người dùng | Phải có | Vừa | PH-11 | Bảo | [Đã viết](../features/checkout/use-cases.md) |
| UC-07.4 | Hủy đơn hàng trước giao | Khách hàng | Mục tiêu người dùng | Nên có | Vừa | PH-11 | Bảo | [Đã viết](../features/checkout/use-cases.md) |
| UC-08.1 | Thanh toán đơn hàng trực tuyến | Khách hàng | Mục tiêu người dùng | Phải có | Cao | PH-11 | Bảo | [Đã viết](../features/payments/use-cases.md) |
| UC-08.2 | Xác nhận thanh toán qua thông báo của cổng | Cổng thanh toán | Mục tiêu con | Phải có | Cao | PH-11 | Bảo | [Đã viết](../features/payments/use-cases.md) |
| UC-11.1 | Đánh giá và nhận xét sản phẩm | Khách hàng | Mục tiêu người dùng | Nên có | Vừa | PH-01 | Bảo | [Đã viết, đề xuất](../features/reviews/use-cases.md) |
| UC-11.2 | Duyệt và phản hồi đánh giá | Quản trị viên | Mục tiêu người dùng | Nên có | Thấp | PH-01 | Bảo | [Đã viết, đề xuất](../features/reviews/use-cases.md) |
| UC-11.3 | Xem, bình chọn và báo cáo đánh giá | Khách vãng lai | Mục tiêu con | Nên có | Vừa | PH-01 | Bảo | [Mã mới, đề xuất](../features/reviews/use-cases.md) |
| UC-12.1 | Tiếp nhận và xác nhận đơn | Quản trị viên | Mục tiêu người dùng | Phải có | Vừa | PH-11, PH-03 | Bảo (nghiệp vụ), Tài (điều hướng) | [Nghiệp vụ](../features/checkout/use-cases.md), [điều hướng](../features/orders/use-cases.md) |
| UC-12.2 | Đóng gói và giao vận chuyển | Quản trị viên | Mục tiêu con | Phải có | Thấp | PH-11 | Bảo | [Đã viết](../features/checkout/use-cases.md) |
| UC-14.3 | Thực hiện hoàn tiền đơn hàng | Quản trị viên | Mục tiêu con | Nên có | Cao | PH-11 | Bảo | [Đã viết](../features/payments/use-cases.md) |

## Ghi chú cách dùng

- **Mức**: Mục tiêu người dùng nếu khách làm xong một việc trọn vẹn. Mục tiêu con nếu chỉ là một bước bên trong.
- **Độ ưu tiên**: Phải có, Nên có, Có thì tốt. Phần Nên có là chỗ cắt đầu tiên khi thiếu thời gian.
- **Mã** `UC-NN.m`: nhóm `NN`, số thứ tự `m` ([AGENTS.md](../../AGENTS.md) bảng hệ mã).
- **Dòng việc**: Issue `PH-NN` đang làm use case đó, `—` là chưa giao. Một dòng việc có thể chứa nhiều use case.
