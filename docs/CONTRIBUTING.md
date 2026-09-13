# Luật làm việc chung

## Ba luật không được phá

**1. Một phân hệ do một người làm trọn.** Từ bảng dữ liệu, API, giao diện, kiểm thử tới tài liệu, tất cả trên một nhánh `feature/`. Không tách API cho người này và giao diện cho người kia.

**2. Không ai ghi vào bảng của người khác.** Khóa ngoại trỏ sang bảng người khác thì được. Ghi vào thì không. Cần thay đổi dữ liệu của họ thì gọi service họ đã công bố.

**3. Controller không gọi thẳng Prisma.** Phải đi qua tầng service. Lý do: khi phân hệ khác cần dữ liệu, họ tiêm service đó, và luật số hai tự nhiên được giữ.

## Quyền sở hữu bảng dữ liệu

Tài dựng và giữ sơ đồ quan hệ thực thể tổng. Quyền ghi lược đồ chia theo bảng.

| Người | Bảng được ghi |
|---|---|
| Bảo | sản phẩm, biến thể, danh mục, ảnh sản phẩm, yêu thích, đã xem, thanh toán, giao dịch thanh toán, khuyến mãi, mã giảm giá, bảng ghi sự kiện, tác vụ nền |
| Duy | giỏ hàng, dòng giỏ hàng, tồn kho, biến động kho, giữ hàng, đơn hàng, dòng đơn hàng, lịch sử trạng thái đơn, vận đơn, thông báo |
| Tài | người dùng, vai, mã một lần, token làm mới, địa chỉ, bảng phí vận chuyển, đánh giá, ảnh đánh giá, đổi trả, hoàn tiền, nhật ký thao tác, schema `staging`, schema `reporting` |

Muốn thêm chỉ mục trên bảng người khác thì đề xuất kèm số đo, chủ bảng tự áp dụng.

## Tám bước thêm một phân hệ

1. Mở phiếu công việc theo mẫu, điền câu chuyện người dùng và tiêu chí chấp nhận.
2. Tạo nhánh `feature/ph-NN-ten-ngan` từ `develop`.
3. Thêm bảng vào `prisma/schema.prisma`, chạy `npm run db:migrate`, đặt tên migration theo việc.
4. Chép thư mục `modules/products`, đổi tên, sửa nội dung.
5. Đăng ký module vào `app.module.ts`.
6. Làm giao diện trong `apps/web/src`, thêm `Route`.
7. Viết đặc tả use case vào `docs/ba/` theo mẫu.
8. Mở pull request vào `develop`, điền danh sách kiểm, đợi CI xanh và người khác duyệt.

## Điều kiện hoàn thành

Một dòng việc chỉ được coi là xong khi đủ hết, không cắt bớt cái nào:

- Có migration nếu có đụng bảng.
- API khớp đặc tả tại `/api/docs`.
- Có giao diện chạy được, không chỉ có API.
- Có kiểm thử cho phần lõi.
- Tài liệu use case của phân hệ đã cập nhật.
- Chạy được trên máy người khác sau khi kéo về.
- Pull request được người khác duyệt và CI xanh.

## Nhịp làm việc

| Lúc | Việc |
|---|---|
| Thứ Hai tới Thứ Sáu, buổi tối | Khoảng hai giờ mỗi người |
| Thứ Tư 21h30 | Chốt chung ba mươi phút, chỉ bàn việc chạm từ hai người trở lên |
| Thứ Bảy | Khối làm việc dài |
| Chủ Nhật sáng chiều | Ghép, tắt dữ liệu giả, duyệt chéo, soạn demo |
| **Chủ Nhật 19h** | **Họp giảng viên, trình bày sản phẩm chạy được của tuần** |
| Sau buổi họp | Nhìn lại mười lăm phút, lập kế hoạch tuần sau ba mươi phút |
| Trước 22h mỗi ngày | Ba dòng báo tiến độ trong nhóm chat |

## Khi kẹt

| Tình huống | Làm gì |
|---|---|
| Xong sớm | Lấy phần Nên có trong đặc tả, hoặc kéo dòng kế tiếp của mình lên |
| Không kịp | Không kéo dài sprint. Giữ phần Phải có, cắt phần Nên có. Phần dở xếp lại vào Chủ Nhật |
| Hụt giờ giữa tuần | Báo ở buổi chốt Thứ Tư, đừng đợi tới Chủ Nhật |
| Chờ hợp đồng của người khác | Chạy trên dữ liệu giả, đổi sang thật khi họ xong. Không ngồi đợi |
| Quyết định chạm từ hai người | Đưa ra buổi chốt Thứ Tư |
| Quyết định về kiến trúc hoặc phạm vi | Hỏi giảng viên tối Chủ Nhật |
