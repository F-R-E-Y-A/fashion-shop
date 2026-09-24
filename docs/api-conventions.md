# Quy ước giao diện lập trình

Mọi phân hệ theo đúng các quy ước dưới đây, để giao diện web chỉ phải học một lần. Đặc tả đầy đủ và luôn đúng nằm ở `/api/docs`, sinh tự động từ chú thích trong mã.

## Đường dẫn

| Việc | Cách viết |
|---|---|
| Liệt kê | `GET /api/<phân-hệ>` |
| Một bản ghi | `GET /api/<phân-hệ>/:định-danh` |
| Tạo | `POST /api/<phân-hệ>` |
| Sửa một phần | `PATCH /api/<phân-hệ>/:id` |
| Xoá | `DELETE /api/<phân-hệ>/:id` |

Tên phân hệ viết số nhiều, chữ thường, nối bằng gạch ngang. Mọi đường dẫn bắt đầu bằng `/api`.

Việc không phải thao tác dữ liệu thuần thì đặt tên theo động từ nghiệp vụ, không cố nhét vào bốn động từ trên: `POST /api/orders/:id/cancel` chứ không phải `PATCH /api/orders/:id` với một trường trạng thái.

## Phân trang

DTO liệt kê `extends PageQuery` (`common/pagination/page.query.ts`), nhận `page` từ 1 và `pageSize` tối đa 60.

Trả về luôn đúng hình dạng này, dựng bằng `toPage()`:

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 12, "totalPages": 1 }
```

`totalPages` tối thiểu là 1, kể cả khi không có dữ liệu.

## Khuôn lỗi

Mọi lỗi đi qua `AllExceptionsFilter` và ra đúng một hình dạng, nên giao diện chỉ phải xử lý một chỗ:

```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST",
  "message": ["page nho nhat la 1"],
  "path": "/api/products",
  "timestamp": "2026-09-19T12:00:00.000Z"
}
```

`message` là chuỗi hoặc mảng chuỗi. Lỗi kiểm tra dữ liệu vào luôn trả mảng.

| Mã | Dùng khi |
|---|---|
| 400 | Dữ liệu vào sai, thiếu, hoặc có trường lạ |
| 401 | Chưa đăng nhập |
| 403 | Đã đăng nhập nhưng không đủ quyền |
| 404 | Không tìm thấy |
| 409 | Xung đột trạng thái, ví dụ hết hàng, đơn đã huỷ |
| 422 | Đúng hình dạng nhưng phạm luật nghiệp vụ |

Đừng trả 200 kèm một trường báo lỗi bên trong. Lỗi là mã lỗi.

## Kiểu dữ liệu

| Loại | Trả về dạng | Vì sao |
|---|---|---|
| Tiền | Chuỗi, ví dụ `"199000"` | `Decimal` chuyển thẳng sang JSON ra đối tượng lạ; số thực làm tròn sai |
| Thời điểm | Chuỗi ISO 8601 có múi giờ | Một cách đọc duy nhất ở mọi máy |
| Định danh | Chuỗi UUID | |
| Không có giá trị | `null` | Đừng bỏ hẳn trường đi, giao diện sẽ phải đoán |

## Ba luật khi thêm đường dẫn

**1. Tham số vào phải khai trong DTO.** `ValidationPipe` loại bỏ mọi trường không khai và trả 400 nếu ai gửi trường lạ. Không đọc thẳng `req.query`.

**2. Trả về DTO riêng, không trả thẳng đối tượng của Prisma.** Trả thẳng là lộ cột nội bộ và vỡ ngay khi đổi bảng.

**3. Mỗi đường dẫn có `@ApiOperation` và `@ApiOkResponse`.** Đặc tả tại `/api/docs` là thứ hai người kia đọc để gọi API của bạn; thiếu chú thích thì họ phải mở mã của bạn ra đọc.
