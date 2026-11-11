---
title: Tổng quan quản trị — nhật ký quyết định
updated: 2026-11-11
status: đang dùng
owner: Tài
---
# Tổng quan quản trị — nhật ký (chỉ thêm vào cuối)

Quyết định và thay đổi đáng nhớ của feature này, mới nhất ở cuối. Khuôn một mục: [LOG-entry.md](../../shared/templates/LOG-entry.md). Quyết định chạm cả nhóm ghi ở [docs/LOG.md](../../LOG.md).

---

## 2026-11-11 — Thiết kế Tổng quan quản trị chỉ đọc (Issue #92)

- **Bối cảnh:** Tuyến `/admin` ban đầu tạm trỏ tới `AdminProductsPage` để phục vụ demo danh mục. Cần trang tổng quan vận hành hoàn chỉnh, chỉ đọc, phản ánh tình hình người dùng, sản phẩm, đơn hàng và cảnh báo hàng tồn thấp.
- **Quyết định:**
  1. Dựng `AdminOverviewPage` tại `apps/web/src/features/overview/` và trỏ route index `/admin` sang trang này. Giữ nguyên tệp và export `AdminProductsPage` của Bảo.
  2. Không dựng endpoint tổng hợp phía API; tái dùng các API hiện có thông qua `pageSize=1` để lấy `total`.
  3. Dùng chung truy vấn `GET /api/admin/orders?attention=true&page=1&pageSize=5` cho cả thẻ KPI "Cần xử lý" và bảng chi tiết để tránh N+1 request.
  4. Bổ sung endpoint `GET /api/admin/inventory/low-stock?threshold=5&limit=5` trong `AdminInventoryController` với tính toán `RepeatableRead` toàn cục.
  5. Cấu trúc khóa cache `['session', 'admin', 'overview', actorId, metric]` để tương thích hoàn toàn với cơ chế dọn sạch cache khi nhận lỗi 403.
- **Hệ quả:** Hoàn thành giao diện dashboard trung tâm độc lập, an toàn phiên, không làm thay đổi hay hồi quy các trang quản trị hiện hữu.

**Trạng thái mục Issue #92:** đề xuất, chờ Duy review nghiệp vụ và Bảo review app/UI; agent không tự chốt.
