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

---

<a id="adr-060"></a>
## 2026-11-13 · ADR-060 — Thêm API và giao diện nhập/điều chỉnh tồn kho kèm lý do

**Loại:** quyết định · **Phạm vi:** Admin và phân hệ Inventory · **Trạng thái:** đề xuất · **Người quyết:** Duy · **Commit:** (điền khi thi hành)

### Hiện trạng
Phân hệ Inventory trước đây mới chỉ hỗ trợ xem tồn kho chỉ đọc và xem lịch sử (UC-13.1, Issue #81). Việc nhập kho hoặc kiểm kê thực tế chỉ có thể thực hiện thông qua script CSV `npm run stock:import` ([README.md:21](README.md#L21), [ADR-034](../../LOG.md#adr-034)). Quản trị viên chưa có giao diện trên web để nhập thêm hàng hoặc điều chỉnh tồn kho khi phát hiện chênh lệch kiểm kê thực tế, đồng thời bảng `stock_movements` chưa lưu lý do biến động.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Cập nhật trực tiếp tồn mà không lưu lịch sử | Đơn giản, không cần migration | Mất khả năng đối soát K3 ([reconcile-inventory.sql:47](../../../tools/db/reconcile-inventory.sql#L47)), không giải trình được lý do chênh lệch | Khó |
| **B. Thêm cột reason, actor_user_id và request_key (unique) vào stock_movements, thêm API điều chỉnh và ConfirmDialog trên UI (chọn)** | Giữ nguyên bất biến đối soát số cái, bắt buộc nhập lý do, ghi nhận quản trị viên thao tác, chống nhập trùng khi mất mạng bằng `requestKey` (UUID), chống race condition bằng lockStock + ReadCommitted, chặn giảm dưới lượng đang giữ | Cần thêm migration cho orders.prisma | Dễ |
| Không làm gì | Quản trị viên không thể nhập hàng hay điều chỉnh tồn trên web | Không đáp ứng yêu cầu vận hành kho | Dễ |

**Chọn B** vì bảo đảm trọn vẹn bất biến "tồn vật lý = tổng biến động kho" và bảo vệ an toàn cho các đơn hàng đang giữ chỗ của khách.

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| Câu hỏi phản biện | Có nguy cơ xung đột khóa hoặc đọc snapshot cũ khi khách đang giữ hàng cùng lúc quản trị viên điều chỉnh tồn không? | Sử dụng hàm lockStock dùng chung cơ chế khóa advisory lock theo thứ tự biến thể trong giao dịch ReadCommitted (để sau khi chờ lock sẽ thấy ngay các reservation vừa commit), còn list/detail chỉ đọc thì giữ RepeatableRead. |
| Người phản biện | Nếu quản trị viên kiểm kê giảm tồn xuống dưới số lượng đang giữ cho các đơn chờ xử lý thì sao? | Chặn với BadRequestException: không cho phép tồn mới nhỏ hơn reservedQuantity. |

**Kết luận:** Cung cấp chức năng nhập kho (RECEIPT) và điều chỉnh kiểm kê (ADJUSTMENT) an toàn, minh bạch lý do và bảo vệ luồng thanh toán.
**Bằng chứng:** `npm run check` xanh toàn bộ; 37 tests unit inventory qua.

### Điều kiện xem lại
Khi có nghiệp vụ chuyển kho giữa các chi nhánh hoặc tích hợp phần mềm WMS ngoài.
