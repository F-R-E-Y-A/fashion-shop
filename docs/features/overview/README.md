---
title: Tổng quan quản trị chỉ đọc — bản đồ
updated: 2026-11-11
status: đã triển khai và kiểm thử mục tiêu Issue92, chờ review
owner: Tài
---
# Tổng quan quản trị chỉ đọc

**Chức năng:** Cửa vào của feature Tổng quan admin tại `/admin`: KPI, danh sách cần xử lý, cảnh báo tồn thấp và kiến trúc cache actor.

| | |
|---|---|
| **Người sở hữu** | Tài · `apps/web/src/features/overview` · API tái dùng users, products, orders, inventory |
| **Dòng việc** | Issue #92 (Quản trị tổng quan vận hành chỉ đọc) |
| **Use case** | [use-cases.md](use-cases.md) đặc tả Tổng quan quản trị chỉ đọc (đề xuất theo Issue #92, chờ Duy/Bảo duyệt mã UC chuẩn) |

## 1. Mục tiêu và phạm vi

Trang `/admin` đóng vai trò trung tâm điều hành vận hành hàng ngày của quản trị viên:
- 4 thẻ KPI: Tổng người dùng (`/admin/users`), Tổng sản phẩm (`/admin/products`), Tổng đơn hàng (`/admin/orders?tab=all`), Đơn cần xử lý (`/admin/orders?tab=attention`).
- Khối đơn cần đối soát/xử lý: Tối đa 5 đơn hàng thuộc diện `attention=true`. Dùng chung một truy vấn duy nhất với thẻ KPI "Cần xử lý", không phát sinh N+1 request.
- Khối tồn kho thấp: Tối đa 5 biến thể có tồn khả dụng từ 0 đến 5 (kể cả biến thể ngừng bán), lấy từ `GET /api/admin/inventory/low-stock?threshold=5&limit=5`.
- Nút "Làm mới": Kích hoạt refetch toàn bộ 5 khối truy vấn, có chỉ báo `aria-busy` và vô hiệu hóa click lặp khi đang chạy.

## 2. Kiến trúc cache và an toàn phiên

- Khóa cache: `['session', 'admin', 'overview', actorId, metric]`. Đảm bảo khớp `isAdminQueryForActor` (`key[0] === 'session' && key[1] === 'admin' && key[3] === actorId`).
- Bảo vệ quyền 403: Mọi query bọc qua `guardQuery` từ `useAdminForbidden`. Khi bất kỳ khối nào nhận 403, toàn bộ cache admin của actor bị xóa sạch, chuyển ngay sang màn hình `AdminForbidden`. Sibling query về muộn không thể phục hồi dữ liệu.
- Phân lập lỗi: Lỗi mạng hoặc 5xx của một khối hiển thị cảnh báo cục bộ kèm nút "Thử lại", không làm hỏng cả trang. KPI lỗi hiển thị "— Không tải được", không hiển thị số 0.
- Khớp giao diện: CSS Modules bám sát token AdminKit (`--espresso`, `--bg`, `--paper`, `--accent`), phông chữ H1 Playfair Display, số liệu tabular-nums, responsive 1280px máy tính và 360px di động.

Ngưỡng cảnh báo5 và mã UC vẫn là đề xuất, chờ Duy review; Bảo review app/UI.
Không coi số liệu tồn thấp là quy tắc giữ/nhả hoặc cho phép sửa tồn.
