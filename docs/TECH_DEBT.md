# Sổ nợ kỹ thuật

Rubric TC2.4 Mức 5 đòi "danh mục nợ kỹ thuật kèm kế hoạch xử lý". Sổ này ghi thứ **biết mà cố ý chưa làm**, kèm lý do và thời điểm xử lý. Thứ chưa biết thì không phải nợ, mà là lỗi.

Thêm mục: cấp mã tăng dần, đừng xoá mục đã xong mà đổi trạng thái, vì lịch sử là thứ hội đồng hỏi.

| Mã | Nợ gì | Vì sao chấp nhận | Xử lý khi nào | Trạng thái |
|---|---|---|---|---|
| ND-01 | 7 lỗ hổng mức cao từ thư viện cấp dưới: `multer` theo `@nestjs/platform-express`, `deepmerge-ts` và `mysql2` theo `prisma` | Không phải mã của nhóm, phải đợi bản vá của thư viện trên. `mysql2` chỉ là trình điều khiển MySQL mà dự án không dùng. CI chặn ở mức nghiêm trọng, mức cao thì ghi báo cáo | Kiểm lại mỗi sprint bằng `npm audit`; nâng bản khi có | Chấp nhận |
| ND-02 | Kiểu dữ liệu ở giao diện gõ tay trong `features/*/api/*.api.ts`, sẽ lệch với máy chủ khi API đổi | Sinh kiểu từ OpenAPI chỉ đáng làm khi đặc tả đã ổn định; giờ đổi từng ngày | S3, khi 3 phân hệ đầu đã chốt hợp đồng | Mở |
| ND-03 | Chưa có xác thực thật, nên màn quản trị chưa chặn quyền | Phân hệ tài khoản là PH-01 của Tài, S2 và S3. Làm tạm rồi vứt là lãng phí | S3, khi PH-01 phần phân quyền xong | Mở |
| ND-04 | Chưa có nhật ký có cấu trúc và mã yêu cầu; hiện dùng logger mặc định của Nest | Chỉ cần khi có nhiều phân hệ gọi chéo nhau để lần vết | HT-05, S5 | Mở |
| ND-05 | `AllExceptionsFilter` đọc `body.error` để đặt mã lỗi, nên mã lỗi phụ thuộc chuỗi tiếng Anh của Nest | Đủ dùng cho ba người; đổi sang lớp lỗi nghiệp vụ riêng khi có phân hệ cần mã lỗi ổn định cho giao diện | S3, khi giỏ hàng và đặt hàng cần phân biệt lỗi nghiệp vụ | Mở |
| ND-06 | Chưa đặt ngưỡng độ phủ kiểm thử, mới chỉ xuất báo cáo | Đặt ngưỡng khi chưa có mã nghiệp vụ thì chỉ là con số vô nghĩa. Ngưỡng do Duy chốt trong `test-strategy.md` | S2, cùng HT-04 | Mở |
| ND-07 | Môi trường thử chạy Render gói miễn phí: máy chủ ngủ khi không ai dùng nên lần gọi đầu chậm; cơ sở dữ liệu miễn phí có hạn dùng | Đổi lấy tốc độ dựng trong tuần đầu; chuyển Azure đã nằm trong kế hoạch | S2 hoặc S3, chuyển sang Azure | Chấp nhận tạm |
| ND-08 | Kho riêng tư trên gói GitHub Free không khoá được nhánh, nên luật "phải qua pull request" chỉ được ép bằng hook `pre-push` ở máy | Hook chặn được đường thường ngày. Khoá nhánh thật cần gói trả phí hoặc kho công khai | Khi xin được gói sinh viên GitHub Pro | Chấp nhận tạm |
| ND-09 | `@scarf/scarf` bị chặn không cho chạy kịch bản cài đặt | Gói này chỉ gửi số liệu thống kê về nhà cung cấp, không ảnh hưởng chức năng | Không xử lý | Chấp nhận |
| ND-10 | Tham số trên đường dẫn khai kiểu nguyên thuỷ (`@Param('slug') slug: string`) nên **không đi qua `ValidationPipe`**. Đo được: slug dài 500 ký tự trả 404 chứ không phải 400 | Prisma tham số hoá câu lệnh nên không có nguy cơ chèn lệnh SQL, và đây là đường dẫn chỉ đọc. Nhưng module mẫu được chép cho mọi phân hệ nên thiếu sót này sẽ được nhân lên | S2, khi làm PH-03: khai tham số đường dẫn bằng lớp DTO, sửa luôn trong module mẫu để hai bạn chép đúng | Mở |
