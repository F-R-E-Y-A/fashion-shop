---
title: Giỏ hàng — nhật ký đối chiếu
updated: 2026-10-04
status: đang dùng
owner: Duy
---
# Giỏ hàng — nhật ký

**Chức năng:** Ghi mốc tích hợp PH-02 và bằng chứng hiện trạng khi bổ sung bản đồ tài liệu.

## 2026-10-04 · Đối chiếu báo cáo tuần 3

`gh pr list -R F-R-E-Y-A/fashion-shop --state all --json number,state,mergedAt,mergeCommit` xác nhận PR #15 đã gộp ngày 02/10. Lịch sử local `git log develop` ghi `262ac81`; GitHub PR ghi `ff22f9e` của lịch sử trước khi sửa. Không dùng SHA cũ đó làm mốc code hiện tại.

Controller đã dùng `CurrentUser` và `OptionalAuthGuard` (`apps/api/src/modules/cart/cart.controller.ts:14`, `:27`); route `/gio-hang` đã có (`apps/web/src/app/routes.tsx:48`). Thêm README để tránh gọi tài liệu tồn kho là tài liệu giỏ. Mục này ghi hiện trạng, không tạo quyết định kiến trúc hoặc tự chốt ADR.

## 2026-10-12 · P0 ownership, pha CRUD được phê duyệt

Baseline `34339262c1928d1c2e1b1aa6aed691696c87e114`: helper tạo giỏ lưu đồng thời principal và token khách, còn lookup khách chỉ theo token. Token guest giữ ở frontend cả khi gửi Bearer (`apps/web/src/features/cart/api/cart.api.ts:23`), nên request đầu của tài khoản có thể tạo mixed row hoặc va unique với giỏ guest đã có.

Pha này ưu tiên principal, giỏ account mới không lưu guest token, lookup guest chỉ lấy giỏ vô chủ. Token nằm trên mixed row bị từ chối 409, không repair hay thay đổi dữ liệu legacy; kiểm tra lại ownership khi gặp P2002 tránh trả lỗi unique thô. Header Authorization rỗng cũng phải xác thực để không downgrade sang guest. Mã và bài regression nằm ở các đường dẫn ghi trong [README](README.md#p0-ownership--phạm-vi-crud).

Merge giữ nguyên theo phạm vi phê duyệt. Lọc nguồn ownership, transaction, concurrency, idempotency và luật số lượng cần thiết kế riêng trước khi triển khai; rủi ro frontend tự gọi merge và đề xuất repair legacy được ghi trong README. Mục này ghi lý do thay đổi trong pha đã duyệt, không tự chốt quyết định cho pha merge hoặc repair.


## 2026-10-17 · Hoàn tất bản sửa ownership và atomic merge, chờ review

Người dùng yêu cầu hoàn tất bugfix trên nhánh hiện tại sau khi kiểm tra. Baseline vẫn là `34339262c1928d1c2e1b1aa6aed691696c87e114`; phần CRUD chưa commit của pha trước được giữ và nối tiếp. Không tự repair dữ liệu legacy hoặc thay schema.

Merge cũ tìm nguồn chỉ theo token, ghi từng dòng rồi xoá nguồn ngoài transaction: có thể lấy giỏ legacy của tài khoản khác, tự xoá giỏ mình, gộp dở dang hoặc cộng hai lần. Chỉ bọc merge trong transaction chưa đủ khi guest CRUD chạy đồng thời. Bản sửa dùng khoá advisory theo owner cho toàn bộ đường Cart; merge lấy khoá nguồn và đích theo thứ tự cố định, rồi đọc/ghi/xoá và tạo snapshot cùng transaction ReadCommitted. Retry unique/deadlock bắt đầu transaction mới, tránh truy vấn vào transaction PostgreSQL đã abort. Token legacy bị từ chối 409 trước ghi; tổng số lượng vượt PostgreSQL Int cũng rollback thay vì cắt bớt (`apps/api/src/modules/cart/cart-transaction.ts:20`, `cart.service.ts:202`).

Kiểm thử PostgreSQL mới tách Cart/JWT khỏi Redis/SMTP để kiểm chứng trực tiếp các race, rollback và ownership mà không cần chạy toàn bộ Auth. Môi trường kiểm thử cục bộ là một cluster PostgreSQL 18.4 tạm trong `/tmp`, cổng riêng, database mới `cart_merge_bugfix_test`, áp 8 migration hiện có; dừng và dọn cluster sau kiểm thử. Database phát triển/test có sẵn không được sử dụng. Kết quả cụ thể ghi sau khi chạy vòng kiểm cuối.

Giới hạn idempotency theo nguồn và request guest đến sau merge được ghi rõ trong [README](README.md#gộp-giỏ-nguyên-tử--bản-sửa-chờ-review). Không có schema/tombstone để đánh dấu token đã tiêu thụ vĩnh viễn; chưa nghiệm thu browser Auth–Cart, Redis/SMTP hoặc suite HTTP toàn ứng dụng. Đây là nhật ký implementation theo phạm vi được yêu cầu, không tự chốt ADR.


Kiểm cuối ngày 17/10, trên working tree chưa commit từ baseline trên: `npm run check` PASS (API 311, web 253, crawler 50 pass và 1 skip có sẵn; lint 0 lỗi, 6 warning cũ). `npm run test:http -w apps/api -- cart-merge.http.spec.ts` với URL trỏ tới cluster tạm vừa tạo PASS 12/12, không skip; đây là suite Cart/JWT/PostgreSQL, không phải AuthService/Redis/SMTP tích hợp. `node tools/docs/lint.mjs docs/features/cart` và `git diff --check` PASS. Không stage, commit, push hoặc thay dữ liệu đang sử dụng. Nguồn chuẩn UC/AC Cart chưa có trong local (index vẫn là khuôn), nên tên bài regression dùng dòng việc PH-02, chưa tự gán mã AC.
