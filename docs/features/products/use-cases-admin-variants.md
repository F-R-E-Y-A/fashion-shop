---
title: UC-04.3 — quản trị biến thể sản phẩm, SKU và giá
updated: 2026-11-14
status: triển khai Issue #127, quyết định còn đề xuất
owner: Tài
---
# UC-04.3 · Quản trị biến thể sản phẩm, SKU và giá (Đợt 2)

**Chức năng:** Giữ AC29–AC40 của quản trị biến thể/SKU/giá, tiếp nối lát đọc [AC1–10](use-cases.md), trạng thái bán [AC11–18](use-cases-admin-status.md) và sửa nội dung [AC19–28](use-cases-admin-content.md).
Tách tài liệu để giữ giới hạn ≤300 dòng; không đổi số hoặc ý nghĩa tiêu chí đã có.

### Mở rộng biến thể và giá — Issue #127, đề xuất
Mở rộng chức năng cho phép ADMIN thêm biến thể từ màu/cỡ có sẵn, sửa giá niêm yết/giá bán, bật/ngừng bán biến thể; tính lại `priceFrom` tức thời; bảo vệ dữ liệu admin trước crawler `importProducts`; đồng thời bảo vệ toàn vẹn: chặn tắt biến thể cuối cùng khi sản phẩm đang mở bán, và chặn mở bán sản phẩm khi có 0 biến thể hoạt động.

- [ ] **AC29** (thuận) GET `/api/admin/products/variant-options` trả về danh sách màu và cỡ có sẵn, sắp xếp đúng thứ tự.
- [ ] **AC30** (thuận) POST `/api/admin/products/:id/variants` tạo biến thể mới với UUID v4 do client sinh; gán `isCustom: true`, `adminManagedFields: ['listPrice', 'salePrice', 'isActive']`; tự động tính lại `priceFrom` của sản phẩm cha.
- [ ] **AC31** (âm) POST từ chối khi `salePrice >= listPrice` hoặc `<= 0` (400), mã màu/cỡ không tồn tại (400), trùng SKU toàn cục (409 `SKU_EXISTS`), trùng tổ hợp `(productId, colorId, sizeId)` (409 `COMBINATION_EXISTS`).
- [ ] **AC32** (thuận/biên) Idempotency: gửi lại POST cùng `id` và cùng `payload` trả về kết quả thành công replay (200/201); cùng `id` nhưng khác `payload` trả 409 `IDEMPOTENCY_PAYLOAD_MISMATCH`.
- [ ] **AC33** (thuận) PATCH `/api/admin/products/:id/variants/:variantId` cập nhật giá và trạng thái hoạt động với CAS token `expectedUpdatedAt`; tính lại `priceFrom` trong cùng transaction; ghi nhận trường thay đổi vào `adminManagedFields`.
- [ ] **AC34** (biên) No-op: PATCH dữ liệu trùng hiện tại trả 200, không bump `updatedAt` và không tăng version.
- [ ] **AC35** (âm) CAS conflict: PATCH với `expectedUpdatedAt` không khớp DB trả 409 `CONCURRENT_MODIFICATION`.
- [ ] **AC36** (âm) Bảo vệ biến thể cuối: Chặn tắt biến thể cuối cùng (`isActive: false`) khi sản phẩm đang mở bán (`product.isActive: true`) bằng 422 `LAST_ACTIVE_VARIANT_BLOCKED`. Cho phép tắt nếu sản phẩm đã ngừng bán thủ công.
- [ ] **AC37** (âm) Bảo vệ mở bán: Chặn mở bán sản phẩm (`adminDisabled: false`) tại PATCH status khi có 0 biến thể hoạt động bằng 422 `NO_ACTIVE_VARIANTS_FOR_ACTIVE_PRODUCT`.
- [ ] **AC38** (biên) Bảo vệ import: `importProducts` bảo toàn `isCustom` và các trường trong `adminManagedFields`. Khi cặp giá hợp nhất xung đột (`effectiveSalePrice > effectiveListPrice`), giữ nguyên cả cặp giá hiện có trong DB và ghi cảnh báo. Biến thể vắng mặt chỉ bị vô hiệu hóa nếu `isCustom: false` và `isActive` chưa được admin quản lý. Tự động tắt sản phẩm nếu sau import không còn biến thể active nào.
- [ ] **AC39** (biên) Giao thức khóa phân cấp: Luôn khóa Product cha (`lockProductStatus`) trước khi khóa/thao tác Variant trong cả Admin API và `importProducts`, triệt tiêu hoàn toàn deadlock 40P01.
- [ ] **AC40** (thuận/biên) Frontend an toàn: Giữ uncertain marker qua điều hướng route trong cùng phiên (`actorId`, `sessionEpoch`, `productId`, `variantId`); khóa tạo mới theo tài nguyên `new`; giải phóng marker chỉ bằng chứng thực máy chủ; guard chống late response / 403; hỗ trợ đầy đủ desktop 1280px và mobile 360px.
