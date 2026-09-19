# Đặc tả công việc Sprint 1

Thứ Hai 14/09/2026 đến Thứ Bảy 19/09/2026 · Họp giảng viên Chủ Nhật 20/09/2026, 19h

Bản ngày 16/09/2026, trích từ bảng chia việc và cập nhật theo trạng thái kho mã. Chi tiết tổng thể xem `ChiaViecTheoSprint_TLCN.docx` ở thư mục đề tài.

**Cách dùng.** Mỗi người đọc khối của mình ở mục 3 và bảng điểm chạm ở mục 4. Mỗi khối trả lời năm câu: làm để đạt gì, làm những gì, xong thì mở cái gì ra thấy, bắt đầu từ tệp nào trong kho mã, ngày nào xong phần nào. Dòng Tiêu chí chấp nhận là danh sách để người duyệt pull request tick. Dòng Có thể cắt cho biết cắt gì trước khi thiếu giờ.

## 1. Bốn dòng việc của tuần

| Mã | Tên công việc | Ngày | Bắt đầu | Kết thúc | Người thực hiện |
|---|---|---|---|---|---|
| HT-01 | Nền tảng hệ thống dùng chung (Cấu trúc thư mục, Docker, Github CI, Notion,...) | 6 | 14/09/2026 | 19/09/2026 | Nguyễn Ngọc Thái Bảo |
| HT-04 | Use case diagram + đặc tả use case | 6 | 14/09/2026 | 19/09/2026 | Phan Ngọc Duy |
| HT-02 | Lược đồ cơ sở dữ liệu | 4 | 14/09/2026 | 19/09/2026 | Huỳnh Ngọc Tài |
| HT-03 | Dữ liệu sản phẩm — thu thập | 2 | 14/09/2026 | 19/09/2026 | Huỳnh Ngọc Tài |

Tổng mỗi người đúng sáu ngày. Tài có hai dòng, bốn ngày cho lược đồ và hai ngày cho thu thập dữ liệu; gợi ý xếp lược đồ vào Thứ Hai, Thứ Ba, Thứ Tư và Thứ Bảy, thu thập vào Thứ Năm và Thứ Sáu, vì thư mục lược đồ Prisma tách theo chủ sở hữu chỉ có từ tối Thứ Sáu.

## 2. Luật chung của tuần

| Luật | Nội dung |
|---|---|
| Nhịp tuần | Thứ Hai tới Thứ Sáu mỗi tối khoảng hai giờ; Thứ Bảy là khối dài; Chủ Nhật sáng chiều ghép và duyệt chéo; 19h họp giảng viên; sau đó 15 phút rút kinh nghiệm và 30 phút lập kế hoạch tuần 2. |
| Buổi chốt chung | Thứ Tư 21h30, 30 tới 45 phút, chỉ bàn việc chạm từ hai người trở lên. Tuần này có ba việc chạm: tác nhân và use case, sơ đồ quan hệ thực thể, cây thư mục. |
| Báo tiến độ | Trước 22h mỗi ngày, ba dòng trong nhóm chat: đã xong gì, mai làm gì, đang vướng gì. Ghi vào sổ tiến độ trên Notion mỗi cuối tuần. |
| Giới hạn việc song song | Mỗi người tối đa hai việc đang mở. Tài có hai dòng việc tuần này là đúng luật, tổng vẫn sáu ngày. |
| Điều kiện bắt đầu | Có khuôn hoặc hợp đồng và có dữ liệu giả là bắt đầu được, không đợi việc trước hoàn tất. Tuần này khuôn đã có từ 13/09. |
| Thế nào là xong | Có tệp trong kho mã hoặc Notion, mở ra thấy đúng đầu ra kiểm chứng được ghi trong đặc tả, pull request được người khác duyệt và CI xanh. Với việc tài liệu, CI chỉ kiểm định dạng. |
| Không kịp | Không kéo dài sprint. Giữ phần Phải có, cắt phần Nên có theo thứ tự ghi ở dòng Có thể cắt. Báo ở buổi Thứ Tư, không đợi tới Chủ Nhật. |

## 3. Đặc tả từng dòng việc

### HT-01 — Nền tảng hệ thống dùng chung (Cấu trúc thư mục, Docker, Github CI, Notion,...) — 6 ngày — Nguyễn Ngọc Thái Bảo

**Mục tiêu.** Xong toàn bộ cấu hình trong tuần 1 để từ Thứ Hai 21/09 cả ba người mở máy là viết được mã tính năng. Mọi thứ hai bạn sẽ chép theo, nên phần nào thiếu ở đây sẽ bị nhân ba.

**Phạm vi**

- Kho mã gộp, Docker Compose có cơ sở dữ liệu; các dịch vụ khác (bộ đệm, máy tìm kiếm, kho ảnh, máy chủ thư) được định nghĩa sẵn dưới dạng profile, bật khi phân hệ sở hữu tới lượt. Môi trường thử tự triển khai khi gộp vào nhánh develop.
- Khung máy chủ NestJS với một module mẫu đủ tầng (DTO, controller, service, Prisma), khuôn lỗi thống nhất, kiểm tra dữ liệu vào, lược đồ khởi tạo. Phần xác thực tạm, dịch vụ tải ảnh và nhật ký có cấu trúc làm ở bản 0.5 đầu tuần 2, vì người cần đầu tiên là Tài ở cuối tuần 2.
- Đặc tả giao diện lập trình gốc tự sinh tại /api/docs; quy ước đường dẫn, phân trang, mã lỗi; script xuất openapi.json và sinh kiểu cho giao diện.
- Khung giao diện React: bộ định tuyến, khung trang cửa hàng, khung trang quản trị tối giản, một trang mẫu gọi module mẫu, cấu trúc features theo phân hệ khớp với tệp gán chủ sở hữu.
- Bộ dữ liệu giả dùng chung với mã định danh cố định; luật kèm theo là ai thêm bảng thì thêm dữ liệu giả cho bảng đó trong cùng pull request.
- Cơ chế quản lý mã nguồn: quy ước nhánh, tệp gán chủ sở hữu thư mục, mẫu pull request có danh sách kiểm, mẫu phiếu công việc, tích hợp liên tục chặn gộp khi đỏ gồm lint, kiểm kiểu, kiểm thử, dựng, migration và dựng image.
- Cây tài liệu trong kho mã: khuôn đặc tả use case, bản ghi quyết định kiến trúc, luật làm việc chung, quy ước git. Không gian Notion cho tài liệu quản lý: sổ theo dõi tiến độ theo sprint, nhật ký công cụ hỗ trợ theo yêu cầu rubric, biên bản họp Chủ Nhật, biểu mẫu cam kết nhóm. Kho mã giữ tài liệu kỹ thuật, Notion giữ tài liệu quản lý.

**Đầu ra kiểm chứng được**

- Người mới tải kho mã về, chạy hai lệnh, mở trình duyệt thấy trang mẫu hiện 10 sản phẩm giả.
- Mở một pull request thật thấy đủ các bước kiểm chạy và báo xanh; mở mẫu pull request thấy danh sách kiểm.
- Có địa chỉ môi trường thử mở được từ điện thoại, trả 200 ở /api/healthz và hiện dữ liệu.
- Module mẫu có ít nhất hai bài kiểm thử chạy được bằng một lệnh.
- Notion có bốn trang mẫu và đã điền tuần 1.

**Bắt đầu từ đâu**

- fashion-shop/README.md: cách chạy, cây thư mục, cách thêm phân hệ.
- fashion-shop/docs/PLATFORM_ROADMAP.md: đánh giá bản 0.1 và việc còn lại theo từng bản 0.2, 0.3, 0.4.
- fashion-shop/docs/CONTRIBUTING.md và docs/GIT_FLOW.md: ba luật không được phá, tám bước thêm phân hệ, quy ước nhánh.

**Mốc trong tuần**

| Ngày | Việc |
|---|---|
| Thứ Ba 15/09 | Đã xong sớm từ 13/09: kho mã, Compose, Prisma, module mẫu, khung web, tệp gán chủ sở hữu, cây tài liệu. Hai bạn dùng được từ hôm nay. |
| Thứ Tư 16/09 và Thứ Năm 17/09 | Bản 0.2: sửa hai lỗi trong CI, lint và format, hook trước commit, bật strict, hai bài kiểm thử mẫu cho module products. Buổi 21h30 Thứ Tư chốt chung với hai bạn. |
| Thứ Sáu 18/09 | Bản 0.3 phần bắt buộc: tách lược đồ Prisma thành thư mục prisma/schema theo chủ sở hữu, đổi cây web sang features, sửa tệp gán chủ sở hữu cho khớp. Tài cần thư mục schema này vào Thứ Bảy. |
| Thứ Bảy 19/09 | Bản 0.4: Dockerfile hai ứng dụng, compose cho môi trường thật, triển khai staging khi gộp develop, công bố địa chỉ. Điền tài khoản GitHub thật vào tệp gán chủ sở hữu, bật khóa nhánh. |
| Chủ Nhật 20/09 | Dự phòng. Sáng ghép với hai bạn, chiều soạn trình bày, 19h họp giảng viên. |

**Phụ thuộc và điểm chạm**

- Không chờ ai. Đây là điều kiện của cả nhóm.
- Đưa cho Tài: thư mục prisma/schema có tệp identity.prisma trống, trước hết Thứ Sáu 18/09.
- Đưa cho Duy: khuôn docs/ba/uc-template.md và docs/ba/uc-index.md, đã có sẵn từ 13/09.
- Đưa cho cả nhóm: địa chỉ staging và cách xem log, trước Chủ Nhật.
- Hợp đồng "Tải ảnh lên kho lưu trữ" trong bảng hợp đồng ghi chốt tuần 1; theo lộ trình đã dời sang đầu tuần 2 vì Tài chỉ cần khi nạp ảnh ở cuối tuần 2. Tuần này Tài chỉ lưu đường dẫn ảnh gốc.

**Nhánh** `feature/platform` · **Gợi ý chia task** `task/platform-quality-ci`, `task/platform-structure-contracts`, `task/platform-docker-staging`, `task/platform-notion-workspace`

**Tiêu chí chấp nhận**

- [ ] Máy trống tải về, chạy hai lệnh, thấy 10 sản phẩm. Đã đạt, kiểm lại sau mỗi bản.
- [ ] CI xanh trên một pull request thật với đủ bước lint, kiểm kiểu, kiểm thử, dựng, migration.
- [ ] Địa chỉ staging trả 200 và hiện dữ liệu giả.
- [ ] Module products có ít nhất một bài kiểm thử đơn vị và một bài kiểm thử qua HTTP.
- [ ] Tệp gán chủ sở hữu không còn dòng trỏ vào thư mục chưa tồn tại, đã điền tài khoản thật.
- [ ] Notion có sổ tiến độ, nhật ký công cụ hỗ trợ, biên bản họp, biểu mẫu cam kết.

**Có thể cắt.** Không cắt. Nếu thiếu giờ thì thứ tự nhường: sinh kiểu từ OpenAPI và kiểm biến môi trường lúc khởi động dời sang tối tuần 2; staging dùng nền tảng nhanh trước rồi chuyển sang máy chủ riêng ở tuần 3. Không nhường lint, kiểm thử mẫu, đổi cây thư mục, Dockerfile.

**Trạng thái tới 16/09/2026**

Đã xong:

- Kho mã npm workspaces, hai ứng dụng api và web, commit đầu 060abea.
- Docker Compose chạy PostgreSQL 17; Prisma 7 với prisma.config.ts và adapter; migration đầu; dữ liệu giả 3 danh mục và 10 sản phẩm, chạy lại không sinh trùng.
- Module mẫu products đủ tầng; khuôn lỗi thống nhất; kiểm tra dữ liệu vào từ chối trường lạ; Swagger tại /api/docs; điểm báo còn sống /api/healthz.
- Khung web: khung cửa hàng, khung quản trị, trang danh sách, trang chi tiết, trang tổng quan quản trị.
- Tệp gán chủ sở hữu, mẫu pull request, mẫu phiếu công việc, CI ba bước.
- Cây tài liệu: ba bản ghi quyết định kiến trúc, luật làm việc chung, quy ước git, khuôn use case, khuôn từ điển dữ liệu, khuôn chiến lược kiểm thử, lộ trình nền tảng.
- Đã kiểm: dựng lại từ số không ra đúng dữ liệu; năm đường dẫn thuận và năm trường hợp lỗi trả đúng; lệnh dev chạy được.

Còn lại:

- Sửa hai lỗi CI đã tái hiện: job build thiếu DATABASE_URL khi sinh client; job migration thiếu bước sinh client trước seed.
- Lint, format, hook, strict, hai bài kiểm thử mẫu.
- Tách lược đồ Prisma theo chủ sở hữu; cây web features; kiểm biến môi trường; xuất openapi.json và sinh kiểu.
- Dockerfile, compose môi trường thật, staging, dựng image trong CI.
- Không gian Notion bốn trang.
- Đầu tuần 2: dịch vụ tải ảnh lên MinIO, xác thực tạm cho môi trường phát triển, nhật ký JSON có mã yêu cầu.

### HT-04 — Use case diagram + đặc tả use case — 6 ngày — Phan Ngọc Duy

**Mục tiêu.** Sơ đồ use case chốt được với giảng viên, danh mục use case đầy đủ, và đặc tả đủ sâu cho các use case bắt đầu ở tuần 2 và 3 để người làm viết mã mà không phải hỏi lại.

**Phạm vi**

- Chốt sơ đồ use case từ bản nháp đã có: rà 27 use case con thuộc 14 nhóm so với 16 phân hệ PH trong bảng chia việc và các màn quản trị ở cột Quản trị; bổ sung chỗ thiếu, gộp chỗ trùng. Tác nhân thống nhất: Khách vãng lai, Khách hàng, Nhân viên vận hành, Quản trị viên, Cổng thanh toán, Dịch vụ thư. Quan hệ include và extend ghi rõ. Xuất PlantUML thành ảnh cho báo cáo, giữ Mermaid để xem nhanh trong kho mã.
- Đồng bộ mã: bản nháp còn dùng mã nhóm cũ UC-01 tới UC-14; cột Phân hệ đổi sang mã PH-01 tới PH-16 và cột Sprint kiểm lại theo bảng chia việc hiện hành. Mã use case con UC-NN.M giữ nguyên để trích dẫn trong báo cáo.
- Danh mục use case docs/ba/uc-index.md: mỗi use case một dòng, đủ cột mã, tên, tác nhân chính, mức, độ ưu tiên theo MoSCoW, độ phức tạp, thuộc dòng việc PH nào, người viết đặc tả, trạng thái.
- Đặc tả đầy đủ theo khuôn cho ba phân hệ bắt đầu tuần 2: PH-03 Khám phá sản phẩm (Bảo làm), PH-13 Tồn kho và nhập hàng (Duy làm), PH-01 Tài khoản và xác thực (Tài làm). Mỗi đặc tả có luồng chính, luồng phụ và ngoại lệ, quy tắc nghiệp vụ, hợp đồng API sơ bộ, bảng dữ liệu đụng tới, tiêu chí chấp nhận, thông điệp lỗi.
- Lược đồ hoạt động cho luồng mua hàng đầu cuối và lược đồ tuần tự cho đặt hàng rồi thanh toán, ở mức khái quát. Chi tiết tinh khi PH-07 và PH-08 tới lượt.
- Nên có: đặc tả PH-05 Giỏ hàng cho tuần 3; chiến lược kiểm thử một trang vào khuôn docs/test-strategy.md; phiếu khảo sát người mua hàng thời trang để phát hành từ tuần 2 theo kế hoạch gốc.

**Đầu ra kiểm chứng được**

- Mở docs/ba/uc-index.md thấy đủ mọi use case, cột Phân hệ toàn mã PH.
- Mở docs/ba/ thấy ba tệp uc-NN-ten-ngan.md điền đủ mục theo khuôn, không còn phần chỉ dẫn trong ngoặc nhọn.
- Có ảnh sơ đồ use case, sơ đồ hoạt động, sơ đồ tuần tự trong docs/ba/diagrams/ kèm tệp nguồn PlantUML để sửa được bằng git.
- Cả nhóm duyệt sơ đồ và ba đặc tả ở buổi Chủ Nhật; Bảo và Tài xác nhận đọc đặc tả của phân hệ mình xong là viết mã được.

**Bắt đầu từ đâu**

- UseCaseDiagram.md ở thư mục đề tài: bản nháp có sáu mục gồm sơ đồ Mermaid, bảng ánh xạ 27 use case con, quan hệ giữa các use case, ghi chú phạm vi, bản PlantUML, và phần khác gì so với nháp trước. Đây là điểm xuất phát, không viết lại từ đầu.
- ChiaViecTheoSprint_TLCN.docx: bảng chia việc có cột Quản trị và 37 khối đặc tả, dùng để rà xem mỗi phân hệ cần use case nào.
- fashion-shop/docs/ba/uc-template.md: khuôn đặc tả, chép ra rồi điền. fashion-shop/docs/README.md: quy tắc đặt tên tệp uc-NN-ten-ngan.md và lưu ý mã use case khác mã dòng việc.
- fashion-shop/docs/ba/uc-index.md: khuôn danh mục đang trống chờ điền.

**Mốc trong tuần**

| Ngày | Việc |
|---|---|
| Thứ Tư 16/09 | Rà sơ đồ, đồng bộ mã PH, gửi bản sơ đồ cho hai bạn xem trước buổi chốt 21h30. Tại buổi chốt: thống nhất tác nhân và danh sách use case với ERD của Tài. |
| Thứ Năm 17/09 và Thứ Sáu 18/09 | Điền uc-index. Viết đặc tả PH-03 và PH-13. Gửi PH-03 cho Bảo đọc. |
| Thứ Bảy 19/09 | Viết đặc tả PH-01, gửi Tài đọc. Vẽ lược đồ hoạt động và tuần tự khái quát. Xuất ảnh. |
| Chủ Nhật 20/09 | Sáng sửa theo góp ý, mở pull request vào develop. Chiều soạn phần trình bày. 19h trình giảng viên. |

**Phụ thuộc và điểm chạm**

- Khuôn và cây tài liệu có sẵn, không chờ ai.
- Cần Bảo và Tài mỗi người dành 30 phút đọc đặc tả của phân hệ mình trước Chủ Nhật, vì họ là người viết mã theo nó.
- Cần Tài đối chiếu bảng Dữ liệu trong mỗi đặc tả với ERD ở buổi Thứ Tư 21h30. Lệch thì sửa ở buổi đó hoặc Chủ Nhật, không tự sửa một bên.
- Sau tuần này: các use case còn lại do người sở hữu phân hệ tự viết sâu khi tới lượt, theo luật tài liệu đi cùng mã trong cùng pull request.

**Nhánh** `docs/uc-index` · **Gợi ý chia task** `task/docs-uc-diagram-sync`, `task/docs-uc-index`, `task/docs-uc-ph03-catalog`, `task/docs-uc-ph13-inventory`, `task/docs-uc-ph01-auth`, `task/docs-activity-sequence`

**Tiêu chí chấp nhận**

- [ ] Danh mục có đủ mọi use case con của bản nháp, thêm các use case quản trị còn thiếu, không dòng nào trống cột Phân hệ hay Người.
- [ ] Ba đặc tả PH-03, PH-13, PH-01 điền đủ mọi mục của khuôn; tiêu chí chấp nhận viết sao cho người khác tự kiểm được.
- [ ] Sơ đồ có tệp nguồn PlantUML và ảnh xuất; tác nhân và tên use case trùng khớp giữa sơ đồ, danh mục và đặc tả.
- [ ] Bảo và Tài xác nhận bằng bình luận trên pull request rằng đọc xong là làm được.
- [ ] Pull request vào develop được một người khác duyệt.

**Có thể cắt.** Nên có mới được cắt, theo thứ tự: phiếu khảo sát, chiến lược kiểm thử, đặc tả PH-05, lược đồ tuần tự cho luồng phụ. Không cắt sơ đồ, danh mục và ba đặc tả tuần 2.

### HT-02 — Lược đồ cơ sở dữ liệu — 4 ngày — Huỳnh Ngọc Tài

**Mục tiêu.** Một lược đồ quan hệ trọn hệ thống mà cả ba người viết mã theo. Hội đồng chấm rất kỹ sơ đồ quan hệ thực thể, nên đây là sản phẩm được soi nhiều nhất của đề tài.

**Phạm vi**

- Sơ đồ quan hệ thực thể tổng: hơn 40 bảng theo ba nhóm sở hữu, vẽ bằng PlantUML trong docs/ba/erd.puml, xuất ảnh vào docs/ba/diagrams/. Mỗi bảng ghi khóa chính UUID, khóa ngoại, ràng buộc duy nhất, ràng buộc kiểm tra dự kiến, chỉ mục dự kiến. Ghi rõ chỗ dùng JSONB cho thuộc tính sản phẩm linh hoạt, vùng staging cho dữ liệu thu thập và vùng reporting cho bảng tổng hợp chỉ đọc.
- Danh sách bảng làm điểm xuất phát, lấy từ bảng quyền sở hữu trong kế hoạch. Nhóm Bảo: products, product_variants, categories, product_images, wishlists, recently_viewed, vouchers, promotions, voucher_usages, payments, payment_transactions, outbox_events, jobs. Nhóm Duy: carts, cart_items, inventory, stock_movements, inventory_reservations, orders, order_items, order_status_history, shipments, notifications, notification_preferences. Nhóm Tài: users, roles, user_roles, otp_codes, refresh_tokens, addresses, shipping_rates, reviews, review_media, returns, return_items, refunds, audit_logs, cùng vùng staging và reporting. Đối chiếu với 37 khối đặc tả để thêm bảng còn thiếu.
- Từ điển dữ liệu docs/ba/data-model.md theo khuôn có sẵn: mỗi bảng một mục, ý nghĩa cột, quy ước đặt tên, tiền dùng Decimal(12,2), thời điểm ISO, các trạng thái đơn hàng, thanh toán, đổi trả ghi thành bảng giá trị có ý nghĩa từng giá trị, quyết định có xóa mềm hay không.
- Lược đồ Prisma và bản di trú cho các bảng Tài sở hữu: sau khi Bảo tách thư mục prisma/schema vào Thứ Sáu, Tài viết identity.prisma cho users, roles, user_roles, otp_codes, refresh_tokens, addresses, shipping_rates và phần staging cho HT-03, tạo migration, chạy sạch trên cơ sở dữ liệu trống. Bảng của Bảo và Duy do chính họ đổ vào tệp prisma của mình khi phân hệ tới lượt ở tuần 2, theo đúng sơ đồ này; Tài duyệt các pull request đó.
- Dữ liệu khởi tạo cho bảng của Tài: ba vai admin, staff, customer; ba người dùng mẫu có mã cố định, một người mỗi vai; bảng phí vận chuyển mẫu theo khu vực. Đặt trong prisma/seed theo luật dữ liệu giả đi cùng bảng.
- Rà chéo tại buổi Thứ Tư 21h30: sơ đồ với bảng Dữ liệu trong đặc tả của Duy và với khung mã của Bảo.

**Đầu ra kiểm chứng được**

- Ảnh sơ đồ quan hệ thực thể đủ hơn 40 bảng, mỗi bảng có chủ sở hữu, kèm tệp nguồn PlantUML.
- docs/ba/data-model.md không còn phần chỉ dẫn trong ngoặc nhọn; đủ mọi bảng của Tài; bảng của người khác có ít nhất tên, mục đích và các cột chính.
- Lệnh db:migrate chạy sạch trên cơ sở dữ liệu trống và tạo được các bảng của Tài; job migration trong CI xanh.
- Lệnh db:seed tạo ba vai, ba người dùng, bảng phí vận chuyển; chạy lại không sinh trùng.
- Sơ đồ và từ điển được cả nhóm và giảng viên duyệt ở buổi Chủ Nhật.

**Bắt đầu từ đâu**

- fashion-shop/apps/api/prisma/schema.prisma: hai bảng mẫu categories và products. Đây là mẫu quy ước cách viết Prisma, không phải sơ đồ thật; đọc để chép cách dùng map, Decimal, chỉ mục.
- fashion-shop/docs/ba/data-model.md: khuôn từ điển và bảng quy ước đặt tên đã ghi sẵn.
- fashion-shop/docs/adr/adr-002-postgresql-duy-nhat.md: vì sao chỉ có PostgreSQL và vì sao staging là một vùng riêng.
- fashion-shop/docs/CONTRIBUTING.md: bảng quyền sở hữu bảng và luật không ghi bảng người khác.
- ChiaViecTheoSprint_TLCN.docx: đọc phần Phạm vi của 37 khối đặc tả để biết mỗi phân hệ cần bảng và cột gì.

**Mốc trong tuần**

| Ngày | Việc |
|---|---|
| Thứ Hai 14/09 và Thứ Ba 15/09 | Kiểm kê bảng theo 37 đặc tả, phác sơ đồ trên giấy hoặc PlantUML bản thô. |
| Thứ Tư 16/09 | Sơ đồ bản 1 đủ hơn 40 bảng, mang ra buổi chốt 21h30 đối chiếu với đặc tả của Duy và khung của Bảo. |
| Thứ Năm 17/09 và Thứ Sáu 18/09 | Hai ngày này dành cho HT-03 thu thập dữ liệu, xem khối kế tiếp. |
| Thứ Bảy 19/09 | Viết identity.prisma vào thư mục prisma/schema Bảo đã tách, tạo migration, viết seed, hoàn thiện từ điển. Mở pull request. |
| Chủ Nhật 20/09 | Sáng sửa theo góp ý và ghép. 19h trình giảng viên. |

**Phụ thuộc và điểm chạm**

- Khuôn từ điển và mẫu Prisma có sẵn từ 13/09. Thiết kế sơ đồ không chờ ai.
- Cần Bảo tách thư mục prisma/schema trước hết Thứ Sáu 18/09 để Thứ Bảy viết identity.prisma. Nếu trễ, vẫn viết được vào schema.prisma hiện tại rồi Bảo chuyển sang tệp riêng.
- Cần Duy đưa bảng Dữ liệu của ba đặc tả ở buổi Thứ Tư để đối chiếu.
- Nền cho hợp đồng "Phần chặn quyền theo đăng nhập và theo vai" chốt tuần 2: bảng users, roles, user_roles phải xong tuần này.

**Nhánh** `feature/ht-02-db-schema` · **Gợi ý chia task** `task/erd-inventory`, `task/erd-plantuml`, `task/data-dictionary`, `task/identity-prisma-migration`, `task/seed-roles-users-shipping`

**Tiêu chí chấp nhận**

- [ ] Hơn 40 bảng, mỗi bảng có đúng một chủ sở hữu ghi trên sơ đồ.
- [ ] Mọi bảng có id UUID, created_at, updated_at; mọi khóa ngoại có chỉ mục; tiền là Decimal, không dùng số thực dấu phẩy động.
- [ ] Mọi trạng thái là bảng giá trị có ý nghĩa từng giá trị và có ràng buộc kiểm tra hoặc kiểu liệt kê.
- [ ] Migration của Tài chạy sạch trên cơ sở dữ liệu trống ở máy khác và trong CI.
- [ ] Seed tạo đúng ba vai, ba người dùng, phí vận chuyển; chạy hai lần vẫn cùng kết quả.
- [ ] Từ điển đủ mọi bảng của Tài; pull request được người khác duyệt.

**Có thể cắt.** Không cắt sơ đồ và migration bảng của Tài. Có thể để lại: chỉ mục dự kiến chi tiết chuyển sang HT-08 tuần 9 khi có số đo; từ điển đầy đủ cho bảng của Bảo và Duy do chính họ bổ sung khi tới lượt.

### HT-03 — Dữ liệu sản phẩm — thu thập — 2 ngày — Huỳnh Ngọc Tài

**Mục tiêu.** Có sẵn dữ liệu thô của 300 đến 500 sản phẩm thời trang thật trước khi hệ thống cần. Tuần 2 chuẩn hóa và nạp vào danh mục, để trang sản phẩm của Bảo có hàng thật ngay và tìm kiếm ở tuần 4 có dữ liệu để thử.

**Phạm vi**

- Chọn hai tới ba nguồn cho phép thu thập. Ưu tiên website Việt trong danh sách đã khảo sát như Routine, CANIFA, YODY, UNIQLO Việt Nam vì có tiếng Việt, kích cỡ và giá theo thị trường mình; website quốc tế thường chặn bot và giá ngoại tệ. Kiểm robots.txt và điều khoản. Chỉ lấy dữ liệu công khai về sản phẩm gồm tên, mô tả, giá, danh mục, thuộc tính kích cỡ và màu, đường dẫn ảnh; không lấy dữ liệu cá nhân nào. Ghi docs/data/sources.md: nguồn, mục đích học tập, ngày, nhịp gọi.
- Mã thu thập độc lập với ứng dụng, đặt ở tools/crawler, chạy bằng tsx. Giới hạn nhịp khoảng một yêu cầu mỗi giây cho mỗi nguồn, thử lại có giãn cách khi lỗi, User-Agent nêu rõ dự án học tập. Chạy lại được mà không nhân đôi, khóa theo nguồn cộng mã sản phẩm gốc. Gợi ý kiểm trước với từng nguồn: nhiều website bán hàng Việt dựng trên nền Haravan hoặc Sapo có điểm truy cập JSON công khai kiểu /products.json, lấy được sạch hơn phân tích HTML; điều này phải kiểm thử từng nguồn, không mặc định.
- Vùng dữ liệu thô tuần này là tệp JSONL trong tools/crawler/output theo nguồn và ngày, mỗi dòng gồm nguồn, mã gốc, đường dẫn, thời điểm lấy, dữ liệu gốc, danh sách đường dẫn ảnh. Không phụ thuộc cơ sở dữ liệu nên chạy song song với HT-02. Tuần 2 nạp vào vùng staging trong PostgreSQL khi có lược đồ. Thư mục output không đưa lên git, chỉ commit một mẫu 20 dòng để kiểm thử.
- Tiêu chí đa dạng: từ năm danh mục như áo, quần, váy đầm, áo khoác, phụ kiện; từ mười thương hiệu hoặc nguồn nếu chọn được website đa thương hiệu, còn không thì tối thiểu ba nguồn; có kích cỡ và màu; ảnh nhiều góc.
- Báo cáo tools/crawler/output/report.md: số dòng theo nguồn, theo danh mục, tỷ lệ có ảnh, có kích cỡ, có màu, số bản trùng đã loại.

**Đầu ra kiểm chứng được**

- Tệp JSONL có từ 300 dòng, nên có 500, mỗi dòng kèm đường dẫn ảnh gốc và đường dẫn trang nguồn.
- Báo cáo số lượng theo nguồn và theo danh mục.
- docs/data/sources.md ghi rõ nguồn và mục đích.
- Chạy lại script lần hai không làm tăng số dòng.

**Bắt đầu từ đâu**

- Danh sách 11 website đã khảo sát trong kế hoạch: ASOS, SSENSE, FARFETCH, Mytheresa, NET-A-PORTER, MR PORTER, UNIQLO, ZARA, Routine, CANIFA, YODY.
- fashion-shop/apps/api/prisma/seed.ts: xem cách đặt mã cố định và upsert để tuần 2 nạp theo cùng tinh thần.
- Thư mục tools/crawler chưa có, Tài tạo mới với package.json riêng; Bảo thêm tools vào workspaces gốc khi duyệt.

**Mốc trong tuần**

| Ngày | Việc |
|---|---|
| Thứ Năm 17/09 | Chọn nguồn, kiểm robots và điều khoản, viết sources.md. Chạy thử một nguồn lấy 50 sản phẩm, xem dữ liệu có đủ trường không. |
| Thứ Sáu 18/09 | Chạy đủ các nguồn tới 300 đến 500 dòng, loại trùng, viết report.md, commit mẫu 20 dòng, mở pull request. |

**Phụ thuộc và điểm chạm**

- Không phụ thuộc ứng dụng, chạy song song với HT-02.
- Tuần 2 cần hai thứ của Bảo: hợp đồng nhập sản phẩm hàng loạt chốt tuần 2, và dịch vụ tải ảnh lên MinIO ở bản 0.5 đầu tuần 2. Vì vậy tuần này chỉ lưu đường dẫn ảnh, không tải ảnh về.

**Nhánh** `feature/ht-03-product-data` · **Gợi ý chia task** `task/pipeline-source-select`, `task/pipeline-crawl-raw`, `task/pipeline-report`

**Tiêu chí chấp nhận**

- [ ] Từ 300 dòng; mỗi dòng có tên, giá, danh mục, ít nhất một đường dẫn ảnh, đường dẫn trang nguồn.
- [ ] Không trùng theo nguồn cộng mã gốc; chạy lại không nhân đôi.
- [ ] Có sources.md và report.md; không có dữ liệu cá nhân.
- [ ] Nhịp gọi có giới hạn và có thử lại; nhìn mã là thấy.
- [ ] Pull request được người khác duyệt.

**Có thể cắt.** Nên có: đủ 500 dòng và nguồn thứ ba. Mức tối thiểu giữ ở 300 dòng từ hai nguồn.

## 4. Điểm chạm giữa ba người trong tuần

| Khi | Ai đưa cho ai | Đưa cái gì, để làm gì |
|---|---|---|
| Thứ Tư 16/09, 21h30 | Duy → Tài | Sơ đồ use case đã đồng bộ mã PH và bảng Dữ liệu của ba đặc tả, để đối chiếu với sơ đồ quan hệ thực thể. |
| Thứ Tư 16/09, 21h30 | Tài → Bảo, Duy | Sơ đồ quan hệ thực thể bản 1 để rà tên bảng, quan hệ, chỗ nào phân hệ cần mà sơ đồ chưa có. |
| Thứ Tư 16/09, 21h30 | Bảo → cả nhóm | Trạng thái nền và việc còn lại; chốt cây thư mục features, lịch tách lược đồ, cổng chạy, quy ước tên bảng. |
| Thứ Sáu 18/09 | Bảo → Tài | Thư mục prisma/schema có base.prisma, catalog.prisma và identity.prisma trống, để Tài viết Thứ Bảy. |
| Thứ Sáu 18/09 | Duy → Bảo | Đặc tả PH-03 để Bảo đọc trước và góp ý. |
| Thứ Bảy 19/09 | Duy → Tài | Đặc tả PH-01 để Tài đọc trước và góp ý. |
| Thứ Bảy 19/09 | Tài → Bảo | Pull request identity.prisma, migration và seed để duyệt và chạy trên CI. |
| Thứ Bảy 19/09 | Bảo → cả nhóm | Địa chỉ staging và cách xem log. |
| Chủ Nhật 20/09, sáng | Cả ba | Ghép, duyệt chéo, sửa theo góp ý, soạn trình bày và biên bản mười dòng. |

## 5. Chủ Nhật 19h trình giảng viên

| Người | Trình gì |
|---|---|
| Nguyễn Ngọc Thái Bảo | Mở địa chỉ staging từ điện thoại thấy trang sản phẩm; mở một pull request thấy CI xanh và danh sách kiểm; mở cây tài liệu và Notion. |
| Phan Ngọc Duy | Sơ đồ use case đã chốt; danh mục use case; ba đặc tả tuần 2; lược đồ hoạt động và tuần tự khái quát. |
| Huỳnh Ngọc Tài | Sơ đồ quan hệ thực thể hơn 40 bảng; từ điển dữ liệu; migration chạy trên staging; báo cáo dữ liệu thu thập 300 tới 500 dòng. |

Sau buổi họp: biên bản mười dòng ghi vào Notion, 15 phút rút kinh nghiệm, 30 phút lập kế hoạch sprint 2 gồm PH-03 của Bảo, PH-13 của Duy, PH-01 và HT-03 chuẩn hóa nạp của Tài.

## 6. Câu hỏi mang tới giảng viên

1. Sơ đồ quan hệ thực thể tuần 1 cần đủ hơn 40 bảng, hay chốt phần lõi trước rồi bổ sung theo tuần?
2. Dữ liệu sản phẩm thu thập từ website công khai cho mục đích học tập: cô có yêu cầu gì về ghi nguồn hoặc xin phép?
3. Phiếu khảo sát người mua hàng có bắt buộc trong tiểu luận này không, hay để sang khóa luận?
