## Thuộc công việc nào

<!-- Ghi mã trong bảng chia việc, ví dụ PH-03 hoặc HT-01 -->
Mã:
Sprint:

## Làm được gì

<!-- Hai tới bốn dòng. Viết theo góc nhìn người dùng, không liệt kê tên tệp. -->

## Cách người duyệt tự kiểm

<!-- Các bước bấm hoặc lệnh gọi cụ thể để thấy nó chạy -->
1.
2.

## Danh sách kiểm điều kiện hoàn thành

- [ ] `npm run check` xanh trên máy trước khi mở
- [ ] Có migration nếu phân hệ này đụng bảng dữ liệu, và có dữ liệu giả kèm theo
- [ ] Đường dẫn API khớp đặc tả tại `/api/docs`, đã cập nhật chú thích Swagger
- [ ] Có giao diện chạy được, không chỉ có API
- [ ] Ba trạng thái đang tải, lỗi, không có dữ liệu đều có mặt
- [ ] Có bài kiểm thử cho phần lõi, tên bài ghi mã tiêu chí chấp nhận
- [ ] Đã cập nhật tài liệu use case của phân hệ trong `docs/ba/`
- [ ] Chạy được trên máy người khác sau khi kéo về, không cần sửa tay
- [ ] Tích hợp liên tục báo xanh cả sáu chặng

## Sử dụng AI

<!-- Rubric TC2.3. Không dùng AI trong pull request này thì tick ô đầu rồi bỏ qua phần còn lại. -->

- [ ] Pull request này không có phần nào do AI sinh

Nếu có:

- Công cụ và phạm vi:
- Phần AI sinh, phần tôi tự sửa:
- [ ] Commit có dòng `AI-Assisted:`
- [ ] Đã ghi vào nhật ký tuần trong [`ai-log/`](https://github.com/F-R-E-Y-A/docs/tree/main/ai-log) trong kho docs
- [ ] Bắt được lỗi hoặc ảo giác của AI thì đã ghi vào [`ai-log/hallucinations.md`](https://github.com/F-R-E-Y-A/docs/blob/main/ai-log/hallucinations.md) trong kho docs
- [ ] Tôi giải thích được mọi dòng trong pull request này nếu bị hỏi ba phút

## Có chạm vào phần của ai khác không

- [ ] Không chạm
- [ ] Có, chỉ **gọi** API hoặc service người khác đã công bố qua `index.ts`, không ghi thẳng vào bảng của họ
- [ ] Có, đụng vào thư mục người khác sở hữu, đã xin họ duyệt

## Phần biết là còn thiếu

<!-- Thà ghi ra còn hơn để người duyệt tự phát hiện. Nợ dài hạn thì thêm một dòng vào docs/TECH_DEBT.md -->
