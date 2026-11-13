---
title: Tồn kho — nhật ký quyết định và thay đổi
updated: 2026-09-24
status: đang dùng
owner: Duy
---
# Tồn kho — nhật ký (chỉ thêm vào cuối)

Quyết định và thay đổi đáng nhớ của feature này, mới nhất ở cuối. Khuôn một mục: [LOG-entry.md](../../shared/templates/LOG-entry.md). Quyết định chạm cả nhóm ghi ở [docs/LOG.md](../../LOG.md).

---

## 2026-11-11 — Thêm endpoint cảnh báo tồn thấp (Issue #92)

- **Bối cảnh:** Màn hình Tổng quan admin cần hiển thị danh sách cảnh báo các biến thể có tồn khả dụng thấp (ngưỡng 5).
- **Quyết định:** Thêm route `@Get('low-stock')` đặt trước route `@Get(':id')` trong `AdminInventoryController` để tránh xung đột UUID parameter. Tính toán khả dụng trực tiếp trong SQL bằng `$queryRaw` với `RepeatableRead` transaction và `COUNT(*)` toàn cục trước khi áp dụng `LIMIT`.
- **Hệ quả:** Cho phép truy vấn cảnh báo tồn kho an toàn, không tải toàn bộ bản ghi vào bộ nhớ Node.js, không ảnh hưởng đến các API tồn kho hiện có.

**Trạng thái mục Issue #92:** đề xuất, chờ Duy review nghiệp vụ và Bảo review app/UI; agent không tự chốt.
