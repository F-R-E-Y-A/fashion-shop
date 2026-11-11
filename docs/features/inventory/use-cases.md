---
title: Quản trị tồn kho chỉ đọc — đặc tả UC-13.1
updated: 2026-11-10
status: đề xuất, đang triển khai Issue81
owner: Tài; Duy review nghiệp vụ
---
# UC-13.1 — Xem tồn kho theo biến thể

**Chức năng:** Quy định lát quản trị chỉ đọc phù hợp mô hình M2 và tiêu chí kiểm thử của Issue81.

## Phạm vi và nguồn

Giữ mã UC-13.1 được dẫn tại [README](README.md), thích nghi từ [đặc tả cũ](../../shared/uc-ph13-ton-kho.md).
Tài chốt chỉ xem tồn và lịch sử. Chưa thay thế các mục nghiệp vụ ngoài lát này của đặc tả cũ;
Duy cần review việc chuẩn hóa. Không thêm STAFF, ngưỡng sắp hết, vị trí kho, điều chỉnh/nhập kho,
search/filter/export/bulk hoặc dữ liệu không có trong schema. Không thêm migration hay seed tồn giả.

## Luồng

ADMIN mở `/admin/inventory?page=N`, đọc SKU/tên sản phẩm/màu/cỡ/tồn vật lý/đang giữ/khả dụng.
Danh sách gồm cả biến thể ngừng bán. Bấm biến thể mở `/admin/inventory/:id?returnPage=N&page=M`;
M là trang lịch sử, N là trang danh sách khi quay lại. Các giá trị trang chỉ nhận số nguyên1..100000.
Mỗi trang mặc định12, API hỗ trợ pageSize1..60. Danh sách theo sku/id tăng;
lịch sử theo createdAt/id giảm. Trang vượt phạm vi hiện rỗng và đường về trang trước.

Dữ liệu là snapshot tại asOf, tải lại bằng nút và mỗi30giây khi không lỗi.
Lịch sử chỉ có loại/chênh lệch/thời điểm, không suy ngược số dư hoặc người thao tác.
StockMovement ghi thay đổi tồn vật lý; giữ/nhả reservation không tự sinh StockMovement.

## Tiêu chí chấp nhận đề xuất

- **AC1** (âm) ADMIN guard ngoài layout và API ADMIN; guest401, CUSTOMER403, UUID/query sai400,
  biến thể thiếu404. Auth trước validation. API no-store và DTO allowlist, không PII/reservation chi tiết.
- **AC2** (biên) Tồn vật lý lấy Inventory; thiếu bản ghi trả null, khác0.
  Đang giữ là tổng reservation releasedAt=null và expiresAt>asOf.
  Khả dụng=max(0,tồn vật lý-đang giữ), null nếu thiếu tồn. Các số trong cùng snapshot RepeatableRead;
  đọc không ghi DB hoặc nhả hold, không tự loại biến thể ẩn.
- **AC3** (thuận/biên) Lịch sử chỉ của variant được chọn, phân trang ổn định kể cả cùng timestamp;
  tổng và dòng cùng snapshot. Không có biến động hiện rỗng, không tạo lịch sử giả.
- **AC4** (thuận/âm) URL/back giữ trang, tải/lỗi/rỗng và cập nhật rõ ràng; tiếng Việt,
  Espresso/Ivory/Copper, font/token hiện có, desktop bảng/mobile360 có nhãn và thao tác bàn phím.
  Không có nút ghi dữ liệu; trạng thái null ghi “Chưa có dữ liệu”.
- **AC5** (âm) Query thuộc actor và cache phiên, authenticatedRequest + AbortSignal + guardQuery;
  logout/đổi epoch/403 hủy hoặc vô hiệu hóa response cũ, không phục hồi dữ liệu. Không tự retry4xx;
  polling dừng khi có lỗi, nút Thử lại là hành động chủ động.

API thật do Swagger `/api/docs` sinh từ controller/DTO; không chép hợp đồng đã cài sang tài liệu.

## Kiểm thử và giới hạn

Unit: AdminInventoryService tính null/giữ/khả dụng, snapshot và thứ tự.
HTTP: auth/validation/no-store/allowlist, giữ hết hạn/đã nhả, tồn0/null, biến thể ẩn, lịch sử/phân trang.
Web: URL, trạng thái, signal/bearer, logout/403 với GET muộn.
E2E: đăng nhập admin, danh sách/chi tiết/back tại1280/360, reduced-motion và hình học cột mobile.
Zoom200%, screen reader và rollout môi trường cần kiểm riêng; test tự động không thay nghiệm thu tay.
