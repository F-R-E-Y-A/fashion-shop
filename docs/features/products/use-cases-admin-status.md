---
title: UC-04.2 — trạng thái sản phẩm quản trị
updated: 2026-11-10
status: triển khai PR71, quyết định còn đề xuất
owner: Tài
---
# UC-04.2 · Quản lý thông tin sản phẩm — trạng thái bán

**Chức năng:** Giữ AC11–18 của ngừng bán thủ công, tiếp nối lát đọc và tách khỏi sửa nội dung.

Tiếp nối [AC1–10](use-cases.md); [AC19–28](use-cases-admin-content.md) mở rộng sửa nội dung.
Tách tài liệu để giữ giới hạn300dòng; không đổi số hoặc ý nghĩa tiêu chí đã có.

### Mở rộng trạng thái sản phẩm — Issue #65, đề xuất
Giữ AC1–10 của lát đọc. Tài chốt giữ ngừng bán thủ công qua mọi lần import; chỉ ADMIN chủ động gỡ. Không xóa dữ liệu, không tự bật danh mục/biến thể, chọn lại giỏ hoặc sửa đơn/payment/inventory. Bật lại tính cờ hiệu lực theo ảnh nguồn hiện có; gỡ hold không đồng nghĩa mua được.
- [ ] **AC11** (âm) PATCH trạng thái kiểm ADMIN trước validation; UUID/body/type/trường lạ/version sai400,
  guest401/CUSTOMER403, thiếu404, version cũ409; response allowlist, no-store, không toggle.
- [ ] **AC12** (thuận) Ngừng bán đặt manual hold và tắt cờ; bật lại gỡ hold/tính điều kiện nguồn. Version chỉ tăng
  khi hold/cờ đổi, phát hiện ABA; no-op giữ version. Migration false/0 giữ isActive cũ.
- [ ] **AC13** (biên) Import và admin khóa cùng hàng, giữ hold kể cả có/không ảnh; lặp không tăng version vô cớ,
  cạnh tranh cả hai thứ tự không mất cập nhật. Không đổi hợp đồng importProducts hoặc ghi bảng ngoài products.
- [ ] **AC14** (âm) Sau ngừng bán public list/search/suggest/detail ẩn; lần đọc giỏ sau báo INACTIVE/bỏ chọn,
  thêm mới bị chặn; bật lại không tự chọn giỏ. Đơn/payment/stock/reservation cũ giữ nguyên.
  Checkout chỉ bảo đảm theo thời điểm đọc catalog trong giao dịch hiện có, không hủy checkout đã đọc trước.
- [ ] **AC15** (thuận) List/detail dùng chung mutation, xác nhận tên/tác động đúng; chống gửi lặp, focus khi pending,
  đóng không hứa hủy server, trả focus về opener hoặc vùng kết quả khi dòng biến mất; mobile360px dùng được.
- [ ] **AC16** (biên) Cache theo actor/epoch/thế hệ quyền; hủy GET cũ trước cập nhật, không đè GET version mới hơn.
  Logout/A→B/A→A/403 chặn response mutation muộn, notice và invalidate phiên mới; kiểm cả hai hướng.
- [ ] **AC17** (biên) Sau mutation bỏ tập danh sách cũ, refetch query đang active, total/trang từ API; không N+1,
  giữ URL và link quay lại. Dòng rời filter/trang cuối có đường phục hồi, không tự trừ total.
- [ ] **AC18** (âm) 400/401/403/404/409/422 có thông báo đúng, không retry4xx/mutation. 409 tải lại rồi xem và
  xác nhận lại; 5xx/network/timeout chỉ GET đối chiếu, không cho gửi thao tác mới khi chưa xác minh được.
  Check/build/HTTP riêng/docs lint và minh chứng phải định danh bản; CI/review người trước merge.
