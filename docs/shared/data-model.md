---
title: Mô hình dữ liệu và từ điển dữ liệu
updated: 2026-09-24
status: khuôn, chờ HT-02
owner: Tài
---
# Mô hình dữ liệu và từ điển dữ liệu

**Chức năng:** Bức tranh dữ liệu toàn hệ thống: sơ đồ quan hệ thực thể, quy ước đặt tên, từ điển từng bảng, ràng buộc và chỉ mục.

> **Tài điền tệp này trong HT-02 (Issue #4).** Bảo dựng sẵn khuôn, không điền nội dung.
>
> Lược đồ thật nằm trong `apps/api/prisma/schema/*.prisma`, mỗi người một tệp; bảng nào của ai ghi ở [CONTRIBUTING.md](../CONTRIBUTING.md) mục quyền sở hữu bảng. Hiện mới có hai bảng mẫu `categories`, `products` để module mẫu chạy được. Mô hình của từng feature đề xuất trong LOG của feature đó, ví dụ `features/products/erd.md` của PH-01; tệp này ghép lại thành bức tranh chung.

## Sơ đồ quan hệ thực thể

<Nhúng `diagrams/erd-tong-the.drawio.png`, quy ước vẽ ở [diagrams/README.md](diagrams/README.md).>

## Quy ước đặt tên

| Đối tượng | Quy ước | Ví dụ |
|---|---|---|
| Tên bảng | số nhiều, chữ thường, nối bằng gạch dưới | `product_variants` |
| Tên cột trong cơ sở dữ liệu | chữ thường, nối bằng gạch dưới | `created_at` |
| Tên trường trong mã nguồn | kiểu lưng lạc đà | `createdAt` |
| Khóa chính | `id`, kiểu UUID | |
| Khóa ngoại | `<tên bảng số ít>_id` | `category_id` |
| Tiền | `Decimal(12, 2)`, không bao giờ dùng số thực dấu phẩy động | |
| Thời điểm | `created_at`, `updated_at` trên mọi bảng | |

Prisma nối hai quy ước bằng `@map` và `@@map`, xem bảng `Product` làm mẫu.

## Từ điển dữ liệu

### Bảng `<tên bảng>`

<Mục đích của bảng, một hai câu.>

| Cột | Kiểu | Bắt buộc | Mặc định | Ý nghĩa | Ràng buộc |
|---|---|---|---|---|---|
| | | | | | |

## Ràng buộc toàn cục

<Các ràng buộc kiểm tra và ràng buộc duy nhất bảo vệ nghiệp vụ, ví dụ số lượng tồn không được âm.>

## Ghi chú về chỉ mục

<Chỉ mục nào thêm vì truy vấn nào. Thêm số đo trước sau khi tới HT-08 tuần 9.>
