---
title: Báo cáo bán hàng quản trị (Reporting Read Model) — bản đồ
updated: 2026-11-13
status: đã triển khai và kiểm thử Issue108, chờ review
owner: Tài
---
# Báo cáo bán hàng quản trị (Issue #108)

**Chức năng:** Mô hình báo cáo bán hàng phân tích chỉ đọc (read model) phục vụ quản trị viên tại `/admin/reports` và API `GET /api/admin/reports/summary`.

| | |
|---|---|
| **Người sở hữu** | Tài · `apps/api/src/modules/reporting`, `apps/web/src/features/reporting` |
| **Dòng việc** | Issue #108 (Báo cáo bán hàng MVP — Read Model) |
| **Use case** | [use-cases.md](use-cases.md) đặc tả UC-108.1 Báo cáo tổng hợp bán hàng định kỳ |
| **Nhật ký quyết định** | [LOG.md](LOG.md) ghi nhận quyết định kiến trúc và nhật ký thay đổi |

## 1. Mục tiêu và phạm vi

Mô hình báo cáo bán hàng quản trị MVP giải quyết bài toán theo dõi doanh thu và phân tích đơn hàng định kỳ:
- **Nguyên tắc phân lập**: Schema `reporting` hoàn toàn độc lập với schema giao dịch `public`. Mọi truy vấn phân tích chỉ đọc trên các bảng tổng hợp sẵn (`daily_revenue`, `orders_by_status`, `top_selling_products`, `report_snapshot_metadata`), không thực hiện `GROUP BY` hay `JOIN` nặng trên bảng nghiệp vụ thời gian thực khi phục vụ request từ client.
- **Tiền đã thu**: Ghi nhận từ các giao dịch thanh toán thành công (`status = 'PROCESSED'`). Với COD: chỉ tính khi đơn được giao thành công với mã biên lai định dạng `COD:*`. Với VNPAY/MOMO/MOMO_ATM: chỉ tính các mã giao dịch số từ cổng thanh toán; loại trừ các giao dịch khởi tạo (`INIT:*`), thất bại (`FAIL:*`), hoặc yêu cầu hoàn tiền (`REFUND-INTENT:*`).
- **Tiền đã hoàn**: Ghi nhận từ các giao dịch hoàn tiền thành công (`externalTransactionId` bắt đầu bằng `REFUND:`).
- **Thu ròng**: Được tính động `Tiền đã thu - Tiền đã hoàn`. Cho phép thu ròng âm (hiển thị rõ dấu trừ) khi khoản hoàn tiền trong ngày vượt quá tiền thu.
- **Phân bổ đơn theo trạng thái**: Phân loại các đơn hàng tạo trong kỳ theo trạng thái hiện tại tại thời điểm snapshot (`asOf`).
- **Top sản phẩm đã giao**: Thống kê số lượng và doanh thu các sản phẩm đã đến tay khách hàng (sự kiện `DELIVERED` đầu tiên rơi vào kỳ báo cáo).
- **Động cơ tổng hợp snapshot**: Dịch vụ `ReportingAggregatorService` gom toàn bộ tính toán vào transaction duy nhất, bảo vệ bởi PostgreSQL advisory lock `10896001n`. Khóa tự động giải phóng khi transaction kết thúc (thành công hoặc rollback).
- **CLI Runner**: Script `npm run reports:refresh -w apps/api` dùng cho tác vụ định kỳ (cron/scheduler).

## 2. Giao diện và trải nghiệm người dùng

Trang quản trị `/admin/reports` được tích hợp vào thanh điều hướng quản trị `AdminNavigation`:
- **Thanh lọc**: Hỗ trợ chọn khoảng ngày (`from`, `to`), số lượng top sản phẩm (5, 10, 20). Đồng bộ 2 chiều với URL Search Params.
- **Chỉ báo snapshot**: Hiển thị phiên bản snapshot, thời điểm tổng hợp và cảnh báo nếu dữ liệu cũ (>10 phút) hoặc chưa tổng hợp (`NOT_READY`).
- **3 thẻ KPI**: Tiền đã thu, Tiền đã hoàn, Thu ròng.
- **3 bảng dữ liệu**: Doanh thu theo ngày, Đơn theo trạng thái hiện tại, Top sản phẩm đã giao.
- **Thiết kế thích ứng (Responsive)**: Chuẩn F.R.E.Y.A, hỗ trợ máy tính 1280px và di động 360px (dạng bảng thẻ, không tràn cuộn ngang).
