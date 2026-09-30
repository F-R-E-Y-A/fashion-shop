---
title: Sổ nợ kỹ thuật
updated: 2026-09-30
status: đang dùng
owner: Bảo
---
# Sổ nợ kỹ thuật

**Chức năng:** Những thứ biết mà cố ý chưa làm: vì sao chấp nhận, xử lý khi nào, trạng thái. Một sổ cho cả kho.

Rubric TC2.4 Mức 5 đòi "danh mục nợ kỹ thuật kèm kế hoạch xử lý". Sổ này ghi thứ **biết mà cố ý chưa làm**, kèm lý do và thời điểm xử lý. Thứ chưa biết thì không phải nợ, mà là lỗi.

Thêm mục: cấp mã tăng dần, đừng xoá mục đã xong mà đổi trạng thái, vì lịch sử là thứ hội đồng hỏi.

| Mã | Nợ gì | Vì sao chấp nhận | Xử lý khi nào | Trạng thái |
|---|---|---|---|---|
| ND-01 | 7 lỗ hổng mức cao từ thư viện cấp dưới: `multer` theo `@nestjs/platform-express`, `deepmerge-ts` và `mysql2` theo `prisma` | Không phải mã của nhóm, phải đợi bản vá của thư viện trên. `mysql2` chỉ là trình điều khiển MySQL mà dự án không dùng. CI chặn ở mức nghiêm trọng, mức cao thì ghi báo cáo | Kiểm lại mỗi sprint bằng `npm audit`; nâng bản khi có | Chấp nhận |
| ND-02 | Kiểu dữ liệu ở giao diện gõ tay trong `features/*/api/*.api.ts`, sẽ lệch với máy chủ khi API đổi | Sinh kiểu từ OpenAPI chỉ đáng làm khi đặc tả đã ổn định; giờ đổi từng ngày | S3, khi 3 phân hệ đầu đã chốt hợp đồng | Mở |
| ND-03 | Authentication đã triển khai (đăng nhập, `AuthGuard`, `CurrentUser`; PH3.1 đến PH3.4 đã gộp). Authorization theo vai trò (RBAC) chưa có: không có `RolesGuard` hay `@Roles`, `roles` chỉ nằm trong `CurrentUser`. Route web `/quan-tri` chưa kiểm tra vai trò (cũng chưa yêu cầu đăng nhập) | Backend hiện chỉ có API đọc công khai (`products` chỉ có `GET`), chưa có endpoint ghi dành cho quản trị cần áp vai trò. Chưa có yêu cầu cụ thể cho các thao tác quản trị ghi dữ liệu, nên RBAC được trì hoãn để không thiết kế quyền khi chưa đủ yêu cầu | Bắt buộc trước khi merge hoặc phát hành endpoint ghi quản trị đầu tiên. Kế hoạch ban đầu: S3, trong phần phân quyền của PH-03 | Mở |
| ND-04 | Chưa có nhật ký có cấu trúc và mã yêu cầu; hiện dùng logger mặc định của Nest | Chỉ cần khi có nhiều phân hệ gọi chéo nhau để lần vết | HT-05, S5 | Mở |
| ND-05 | `AllExceptionsFilter` đọc `body.error` để đặt mã lỗi, nên mã lỗi phụ thuộc chuỗi tiếng Anh của Nest | Đủ dùng cho ba người; đổi sang lớp lỗi nghiệp vụ riêng khi có phân hệ cần mã lỗi ổn định cho giao diện | S3, khi giỏ hàng và đặt hàng cần phân biệt lỗi nghiệp vụ | Mở |
| ND-06 | Chưa đặt ngưỡng độ phủ kiểm thử, mới chỉ xuất báo cáo | Đặt ngưỡng khi chưa có mã nghiệp vụ thì chỉ là con số vô nghĩa. Ngưỡng do Duy chốt trong `test-strategy.md` | S2, cùng HT-04 | Mở |
| ND-07 | Môi trường thử chạy Render gói miễn phí: máy chủ ngủ khi không ai dùng nên lần gọi đầu chậm; cơ sở dữ liệu miễn phí có hạn dùng | Đổi lấy tốc độ dựng trong tuần đầu; chuyển Azure đã nằm trong kế hoạch | S2 hoặc S3, chuyển sang Azure | Chấp nhận tạm |
| ND-08 | Không khoá được nhánh trên kho riêng tư của tổ chức, nên luật "phải qua pull request" chỉ được ép bằng hook `pre-push` ở máy. Bảo đã có Pro qua Education, nhưng gói cá nhân chỉ áp cho kho cá nhân; kho của tổ chức theo gói tổ chức, hiện là Free. Đo: `orgs/F-R-E-Y-A` trả `plan.name=free`, bật protection và ruleset đều 403 | Hook chặn được đường thường ngày. Quan trọng hơn: rubric TC2.4 đo **tỷ lệ thay đổi qua pull request có review**, đọc từ lịch sử pull request chứ không từ cấu hình khoá nhánh. Kỷ luật cộng hook là đủ đạt con số đó | Chọn một trong bốn phương án ở [github-setup.md](features/platform/github-setup.md) mục 6. Rẻ nhất là chuyển kho mã về tài khoản cá nhân | Chấp nhận tạm |
| ND-09 | `@scarf/scarf` bị chặn không cho chạy kịch bản cài đặt | Gói này chỉ gửi số liệu thống kê về nhà cung cấp, không ảnh hưởng chức năng | Không xử lý | Chấp nhận |
| ND-10 | Tham số trên đường dẫn khai kiểu nguyên thuỷ (`@Param('slug') slug: string`) nên **không đi qua `ValidationPipe`**. Đo được: slug dài 500 ký tự trả 404 chứ không phải 400 | Prisma tham số hoá câu lệnh nên không có nguy cơ chèn lệnh SQL, và đây là đường dẫn chỉ đọc. Nhưng module mẫu được chép cho mọi phân hệ nên thiếu sót này sẽ được nhân lên | Đã khai bằng `ProductSlugParam` và kiểm thử HTTP slug dài ở `bee54a0` | Đã xử lý |
| ND-11 | Không có gì chặn người mở pull request tự gộp bài của chính mình. Không có khoá nhánh thì GitHub cũng không chặn gộp khi kiểm tự động đang đỏ | Cùng nguyên nhân ND-08: kho của tổ chức ở gói Free. Luật một người khác duyệt hiện là thoả thuận, và mỗi lần gộp đều để lại dấu vết công khai nên phá luật là thấy ngay | Giải quyết cùng ND-08. Nếu chưa, cân nhắc thêm một chặng kiểm báo đỏ khi pull request chưa có ai ngoài tác giả duyệt: không chặn được nhưng làm cho vi phạm hiện rõ trong hồ sơ | Mở |
| ND-12 | Tìm kiếm và lọc chạy **trong bộ nhớ của API** trên mọi sản phẩm hiển thị ([catalog-search.service.ts](../apps/api/src/modules/products/search/catalog-search.service.ts)), không đẩy xuống SQL. Đo 30/09 trên 87 sản phẩm: p95 80–90 ms cho `search=&facets=true`. Đường `ILIKE` cũ còn nằm ở [products.service.ts:231](../apps/api/src/modules/products/products.service.ts#L231) nhưng controller không còn dùng khi có `search` | Với vài trăm sản phẩm thì đơn giản và giải thích được hơn; đẩy xuống SQL khi chưa cần là làm sớm ([ADR-019](features/products/LOG.md#adr-019)) | Khi Catalog vượt vài nghìn sản phẩm hoặc p95 vượt 150 ms: `pg_trgm`, đẩy lọc xuống SQL, xoá nhánh `ILIKE` cũ | Mở |
| ND-13 | Lọc cỡ (`sizes`) theo biến thể đang bán, **chưa xét tồn kho**; UC-03.3/AC3 đòi "còn hàng theo hàm tồn kho của Duy" | Chưa có hàm đọc tồn kho theo `variantId` | Khi Duy công bố hàm đọc tồn kho | Mở |
| ND-14 | Tên phân hệ lệch giữa API, web và tài liệu: `auth` / `account` / `docs/features/auth`, `cart` / `inventory`. `AGENTS.md` luật 1 ghi "tên thư mục feature trùng tên module trong mã" | Đổi tên là chuyển thư mục của Tài và Duy; đổi giữa lúc PR của họ đang mở sinh xung đột. Bảng đối chiếu đã ghi ở [docs/README.md](README.md) mục 2 | Tái cấu trúc thư mục 01/10, chủ là Tài và Duy | Mở |
