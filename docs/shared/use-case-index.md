---
title: Danh mục use case
updated: 2026-10-04
status: khuôn, chờ chuẩn hoá từ pull request #26
owner: Duy
---
# Danh mục use case

**Chức năng:** Mỗi use case của hệ thống một dòng: mã, tác nhân, mức ưu tiên, đang thuộc dòng việc nào, đặc tả đã viết chưa.

> **Duy điền tệp này trong HT-04.** PR #9 đã gộp ngày 26/09 nhưng danh mục local vẫn là khuôn. Bản chuẩn hoá đang ở [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26), còn mở khi đối chiếu GitHub ngày 04/10; chưa coi nội dung của PR là bản đã tích hợp.
>
> Mỗi use case một dòng. Ba use case khởi động là giỏ hàng, tài khoản và danh mục sản phẩm
> thì viết đặc tả đầy đủ ngay trong tuần 1, vì tuần 2 đã bắt đầu code tới.
> Các use case còn lại do người sở hữu phân hệ tự viết sâu khi tới lượt.

| Mã | Tên use case | Tác nhân chính | Mức | Độ ưu tiên | Độ phức tạp | Dòng việc | Người viết đặc tả | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| UC-01.1 | | | | | | PH-.. | | Chưa viết |
| UC-01.2 | | | | | | | | Chưa viết |

## Ghi chú cách dùng

- **Mức**: Mục tiêu người dùng nếu khách làm xong một việc trọn vẹn. Mục tiêu con nếu chỉ là một bước bên trong.
- **Độ ưu tiên**: Phải có, Nên có, Có thì tốt. Phần Nên có là chỗ cắt đầu tiên khi thiếu thời gian.
- **Mã** `UC-NN.m`: nhóm `NN`, số thứ tự `m` ([AGENTS.md](../../AGENTS.md) bảng hệ mã).
- **Dòng việc**: Issue `PH-NN` đang làm use case đó, `—` là chưa giao. Một dòng việc có thể chứa nhiều use case.
