---
title: Nhật ký quyết định kiến trúc Báo cáo bán hàng — LOG
updated: 2026-11-13
status: ghi nhận các quyết định Issue108
owner: Tài
---
# Nhật ký quyết định kiến trúc Báo cáo bán hàng (Issue #108)

Tài liệu ghi lại các quyết định thiết kế kiến trúc và mô hình dữ liệu cho tính năng Báo cáo bán hàng MVP (Read Model).

## <a id="adr-108-01"></a>ADR-108-01: Phân lập schema `reporting` riêng biệt cho mô hình phân tích chỉ đọc

- **Bối cảnh**: Hệ thống thương mại điện tử cần cung cấp báo cáo doanh thu và phân tích đơn hàng cho quản trị viên. Nếu thực hiện truy vấn trực tiếp trên các bảng nghiệp vụ (`orders`, `payments`, `payment_transactions`) thời gian thực, các truy vấn aggregate nặng (`GROUP BY`, `SUM`, phân tích lịch sử trạng thái) sẽ khóa tài nguyên và ảnh hưởng đến hiệu năng đặt hàng/thanh toán của khách.
- **Quyết định**: Sử dụng schema PostgreSQL riêng biệt `reporting` chứa các bảng read model:
  - `reporting.daily_revenue`: Doanh thu và hoàn tiền theo ngày.
  - `reporting.orders_by_status`: Phân loại đơn hàng theo trạng thái ghi nhận tại thời điểm snapshot.
  - `reporting.top_selling_products`: Xếp hạng sản phẩm đã giao thành công.
  - `reporting.report_snapshot_metadata`: Bảng đơn dòng lưu trữ phiên bản snapshot, mốc thời gian tổng hợp và trạng thái chất lượng dữ liệu.
- **Hệ quả**: Toàn bộ thao tác nghiệp vụ đặt hàng và thanh toán không bị ảnh hưởng. Truy vấn báo cáo từ admin chỉ đọc trên các bảng tổng hợp sẵn trong schema `reporting` với thời gian phản hồi < 50ms.

## <a id="adr-108-02"></a>ADR-108-02: Bổ sung `refunded_amount` vào `daily_revenue` và tính thu ròng động

- **Bối cảnh**: Bảng `daily_revenue` có ràng buộc kiểm tra toàn vẹn mức cơ sở dữ liệu `daily_revenue_revenue_amount_non_negative_check` yêu cầu `revenue_amount >= 0`. Nếu ghi trực tiếp doanh thu thuần (sau khi trừ hoàn tiền) vào `revenue_amount`, các ngày có khoản hoàn vượt quá tiền thu (thu ròng âm) sẽ gây lỗi vi phạm ràng buộc check constraint.
- **Quyết định**: Bổ sung cột `refunded_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00` với ràng buộc `refunded_amount >= 0`. Cột `revenue_amount` lưu trữ tổng tiền thực thu trong ngày (`>= 0`), `refunded_amount` lưu trữ tổng tiền hoàn trong ngày (`>= 0`). Thu ròng (`netRevenue`) được tính toán động tại tầng API: `collected - refunded`.
- **Hệ quả**: Cơ sở dữ liệu luôn duy trì tính toàn vẹn của các đại lượng dương, đồng thời báo cáo phản ánh trung thực trường hợp thu ròng âm (hiển thị rõ số âm kèm dấu trừ).

## <a id="adr-108-03"></a>ADR-108-03: Khóa advisory lock cấp transaction cho tiến trình tổng hợp báo cáo

- **Bối cảnh**: Quá trình tổng hợp báo cáo đọc từ các bảng nguồn và ghi vào schema `reporting`. Nếu có nhiều tiến trình chạy đồng thời (cron định kỳ trùng với lệnh chạy thủ công từ CLI), có nguy cơ xung đột dữ liệu hoặc tạo ra các snapshot không nhất quán.
- **Quyết định**: Sử dụng hàm `pg_try_advisory_xact_lock(10896001n)` của PostgreSQL ngay đầu transaction tổng hợp trong `ReportingAggregatorService`.
- **Hệ quả**: Khóa tự động giải phóng khi transaction kết thúc (commit hoặc rollback). Nếu khóa đang bị chiếm giữ, tiến trình mới sẽ lập tức bỏ qua một cách an toàn mà không bị treo hay xung đột tài nguyên.

## <a id="adr-108-04"></a>ADR-108-04: Quy tắc nhận diện giao dịch thu tiền và hoàn tiền dựa trên receipt

- **Bối cảnh**: Bảng `payment_transactions` chứa nhiều loại bản ghi của các cổng khác nhau (COD, VNPAY, MOMO), bao gồm các giao dịch khởi tạo (`INIT:*`), thất bại (`FAIL:*`), hoàn tiền (`REFUND:*`) và thanh toán thành công.
- **Quyết định**:
  - Tiền thu: Chỉ tính các giao dịch có `status = 'PROCESSED'`. Đối với COD, chỉ tính khi mã giao dịch bắt đầu bằng `COD:` và đơn hàng đã đạt `DELIVERED`. Đối với VNPAY/MOMO, chỉ tính mã giao dịch số từ cổng thanh toán. Loại trừ triệt để `INIT:*`, `FAIL:*`, `REFUND-INTENT:*`.
  - Hoàn tiền: Chỉ tính các giao dịch có `status = 'PROCESSED'` và mã bắt đầu bằng `REFUND:`. Số tiền hoàn được trích xuất từ `payload.refundedAmount` (hoặc `vnp_Amount / 100` đối với VNPAY).
- **Hệ quả**: Số liệu tiền thu và hoàn tiền phản ánh chính xác 100% dòng tiền thực tế, ngăn ngừa việc ghi nhận khống các giao dịch treo hoặc giao dịch thất bại.

## <a id="adr-108-05"></a>ADR-108-05: Lưu trữ `product_name` tại `top_selling_products`

- **Bối cảnh**: Khi hiển thị danh sách top sản phẩm bán chạy, quản trị viên cần thấy tên sản phẩm trực tiếp mà không phải thực hiện thêm truy vấn lookup ngược về bảng catalog.
- **Quyết định**: Thêm cột `product_name VARCHAR(255)` vào bảng `reporting.top_selling_products`. Quá trình tổng hợp sẽ sao chép tên sản phẩm từ snapshot đơn hàng (`product_snapshot.name`) hoặc bảng sản phẩm.
- **Hệ quả**: Báo cáo hiển thị tức thì tên sản phẩm, độc lập hoàn toàn với việc sản phẩm gốc có bị thay đổi tên hoặc xóa sau này hay không.
