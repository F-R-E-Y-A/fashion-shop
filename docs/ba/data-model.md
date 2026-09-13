# Mô hình dữ liệu và từ điển dữ liệu

> **Tài điền tệp này trong tuần 1 (HT-02).** Bảo dựng sẵn khuôn, không điền nội dung.
>
> Lược đồ hiện tại trong `apps/api/prisma/schema.prisma` mới chỉ có hai bảng mẫu là
> danh mục và sản phẩm, dựng để module mẫu chạy được. Đó không phải mô hình thật.
> Mô hình đầy đủ là việc của tệp này.

## Sơ đồ quan hệ thực thể

<Chèn PlantUML hoặc ảnh xuất ra. Nguồn để ở `docs/ba/erd.puml` để sửa được bằng git.>

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
