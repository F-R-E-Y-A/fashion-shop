## Thuộc công việc nào

Mã: HT-01 Nền tảng hệ thống dùng chung
Sprint: S1, 14/09 – 19/09/2026

## Làm được gì

Xong toàn bộ nền tảng và cấu hình để từ tuần 2 cả ba người viết mã tính năng song song mà không giẫm chân nhau. Người mới tải kho về, chạy hai lệnh là thấy trang sản phẩm chạy với dữ liệu giả. Mọi thay đổi từ nay đi qua sáu chặng kiểm tự động trước khi gộp được.

Ba luật làm việc của nhóm nay được ép bằng máy thay vì bằng lời nhắc: một phân hệ do một người làm trọn, không ai ghi vào bảng của người khác, controller không gọi thẳng tầng dữ liệu.

## Cách người duyệt tự kiểm

1. `npm run setup` rồi `npm run dev:api` và `npm run dev:web`, mở http://localhost:5174 thấy 10 sản phẩm.
2. `npm run check` phải xanh: lint, 8/8 luật ranh giới, định dạng, kiểm kiểu, kiểm thử đơn vị.
3. `npm run test:http` phải xanh 9/9.
4. Thử phá luật ranh giới: thêm `import { listProducts } from '@/features/products';` vào `apps/web/src/core/http.ts` rồi chạy `npm run lint`, phải thấy lỗi tiếng Việt chỉ thẳng luật bị phạm. Xoá dòng đó đi.
5. `npm run prod:up`, mở http://localhost:8080, rồi `npm run prod:down`.
6. Đọc `docs/CODE_TOUR.md` để hiểu toàn bộ đường đi của một yêu cầu.

## Danh sách kiểm điều kiện hoàn thành

- [x] `npm run check` xanh trên máy trước khi mở
- [x] Có migration nếu phân hệ này đụng bảng dữ liệu, và có dữ liệu giả kèm theo
- [x] Đường dẫn API khớp đặc tả tại `/api/docs`, đã cập nhật chú thích Swagger
- [x] Có giao diện chạy được, không chỉ có API
- [x] Ba trạng thái đang tải, lỗi, không có dữ liệu đều có mặt
- [x] Có bài kiểm thử cho phần lõi, tên bài ghi mã tiêu chí chấp nhận
- [ ] Đã cập nhật tài liệu use case của phân hệ trong `docs/ba/` — HT-01 là hạng mục nền tảng, không có use case riêng; khuôn đã dựng sẵn cho Duy
- [x] Chạy được trên máy người khác sau khi kéo về, không cần sửa tay
- [ ] Tích hợp liên tục báo xanh cả sáu chặng — lượt chạy đầu tiên chính là pull request này

## Sử dụng AI

- [ ] Pull request này không có phần nào do AI sinh

Nếu có:

- Công cụ và phạm vi: Claude Code, model Claude Fable 5.1 và Claude Opus 5. Phạm vi gồm khung mã ban đầu, luật lint ranh giới, cấu hình kiểm thử, tệp đóng gói Docker, sáu chặng tích hợp liên tục, và khuôn tài liệu.
- Phần AI sinh, phần tôi tự sửa: quyết định công nghệ, thứ tự làm việc, tổ chức kho và mọi quyết định kiến trúc là của tôi. Tôi bác bỏ các đề xuất phình to kiến trúc vì sai quy mô nhóm ba người, yêu cầu luật ranh giới phải có bộ kiểm của riêng nó, và tự kiểm chứng lại các phiên bản thư viện. Chi tiết trong nhật ký AI ở kho docs.
- [x] Commit có dòng `AI-Assisted:`
- [x] Đã ghi vào nhật ký tuần trong `ai-log/` của kho docs
- [x] Bắt được lỗi hoặc ảo giác của AI thì đã ghi vào `ai-log/hallucinations.md` — 9 lỗi, mỗi lỗi có phân tích nguyên nhân và mã commit sửa
- [x] Tôi giải thích được mọi dòng trong pull request này nếu bị hỏi ba phút

## Có chạm vào phần của ai khác không

- [x] Không chạm

Có dựng sẵn khuôn cho hai bạn: `prisma/schema/orders.prisma` cho Duy và `prisma/schema/identity.prisma` cho Tài, cả hai đang trống và có chú thích hướng dẫn.

## Phần biết là còn thiếu

- Kho riêng tư trên gói GitHub miễn phí không khoá được nhánh, nên luật "mọi thay đổi qua pull request" mới chỉ ép được bằng hook ở máy. Ghi ở `docs/TECH_DEBT.md` mục ND-08.
- Tham số trên đường dẫn khai kiểu chuỗi thô nên không đi qua bộ kiểm tra dữ liệu vào. Ghi ở mục ND-10, xếp lịch sửa ở S2 cùng PH-03.
- Chưa sinh kiểu dữ liệu cho giao diện từ đặc tả OpenAPI. Ghi ở mục ND-02, làm ở S3 khi hợp đồng API đã ổn định.

Closes #1
