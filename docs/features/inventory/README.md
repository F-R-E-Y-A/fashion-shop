---
title: Tồn kho — bản đồ
updated: 2026-11-13
status: đã triển khai quản trị tồn kho, cảnh báo tồn thấp và nhập/điều chỉnh tồn
owner: Duy
---
# Tồn kho và nhập hàng

**Chức năng:** Cửa vào feature tồn kho: đặc tả ở đâu, phụ thuộc biến thể của danh mục, trạng thái hôm nay, cách đối soát K3.

| | |
|---|---|
| **Người sở hữu** | Duy · `apps/api/src/modules/inventory` · bảng trong `prisma/schema/orders.prisma` |
| **Dòng việc** | Chưa giao; PH-02 giỏ hàng (Issue #7) làm trước |
| **Use case** | UC-13.1 tới UC-13.4. Đặc tả từ PR #9 đã gộp, còn mã cũ tại [uc-ph13-ton-kho.md](../../shared/uc-ph13-ton-kho.md); chuẩn hoá đang ở PR #26, chưa gộp ngày 04/10 |

## Phụ thuộc

Tồn kho tính theo **biến thể** (một màu, một cỡ) của mô hình M2 đã chốt ([ADR-007](../products/LOG.md#adr-007), [erd.md](../products/erd.md)). Đặc tả cũ còn dùng `SKUS`; cần đối chiếu với M2 khi chuẩn hoá HT-04. Giỏ hàng PH-02 đã gộp qua [PR #15](https://github.com/F-R-E-Y-A/fashion-shop/pull/15), xem [cart/README.md](../cart/README.md); giỏ hàng không phải module tồn kho.

## Trạng thái hôm nay (19/10/2026)

PH-11 đã thêm cửa đọc tại [README module](../../../apps/api/src/modules/inventory/README.md). Tồn khả dụng bằng tồn thực trừ reservation chưa release và chưa hết hạn; không trả âm. Biến thể thiếu Inventory trả chưa biết, không gán tồn giả ([inventory.service.ts:55](../../../apps/api/src/modules/inventory/inventory.service.ts#L55)).

Catalog và Cart chỉ gọi đọc qua `inventory/index.ts`. Checkout giữ hàng khi xác nhận sang payment; IPN/query chốt kho nếu hold còn hạn, hủy/hết hạn thì nhả. Khoá variant có thứ tự, SALE gắn order/variant duy nhất ([inventory.service.ts:16](../../../apps/api/src/modules/inventory/inventory.service.ts#L16), [inventory-operations.ts:14](../../../apps/api/src/modules/inventory/inventory-operations.ts#L14)). Chưa có UI/API nhập kho; chủ kho đặt tồn bằng `npm run stock:import -w apps/api -- --file=<csv>` theo file kiểm kê `sku,quantity`, ghi `ADJUSTMENT` cho từng chênh lệch ([stock-count.ts:54](../../../apps/api/src/modules/inventory/stock-count.ts#L54), [ADR-034](../../LOG.md#adr-034)). Không tự tạo số liệu tồn thật. Quyết định ở [ADR-031](../../LOG.md#adr-031), [ADR-032](../../LOG.md#adr-032); kiểm ở [cart-live.http.spec.ts](../../../apps/api/test/cart-live.http.spec.ts) và [checkout-payment.http.spec.ts](../../../apps/api/test/checkout-payment.http.spec.ts).


## Quản trị chỉ đọc — Issue #81

Tài triển khai [Issue #81](https://github.com/F-R-E-Y-A/fashion-shop/issues/81), Duy review nghiệp vụ.
Lát [UC-13.1](use-cases.md) chỉ danh sách biến thể, chi tiết tồn và lịch sử StockMovement phân trang;
không thêm điều chỉnh, nhập kho, cảnh báo ngưỡng hoặc migration. Không coi dữ liệu tồn thiếu là0.
API tại module inventory, frontend feature inventory; guard ADMIN ngoài khung và backend.
Các số là snapshot cùng thời điểm, UI ghi asOf và tải lại định kỳ30giây; lỗi dừng polling.
Giữ nguyên reserve/release/commit/restock và script kiểm kê; không ghi bảng của phân hệ khác.
Kiểm thử tại admin-inventory.service.spec.ts, admin-inventory.http.spec.ts, inventory.test.tsx và
admin-inventory.spec.ts. Trạng thái kiểm thực tế/ảnh và giới hạn lưu ở kho docs, không coi là đã merge.

## Cảnh báo tồn thấp — Issue #92

Endpoint `GET /api/admin/inventory/low-stock?threshold=5&limit=5` hỗ trợ Tổng quan admin:
- Tính `availableQuantity = max(0, quantityOnHand - reserved)` với hold còn hiệu lực (`releasedAt IS NULL AND expiresAt > asOf`).
- Lọc `availableQuantity <= threshold` trên toàn bộ cơ sở dữ liệu trước khi `LIMIT`, không tải toàn bộ vào RAM.
- `threshold` 1..100 (mặc định 5), `limit` 1..10 (mặc định 5).
- Đếm toàn tập `total` khớp danh sách items trong giao dịch `RepeatableRead` cùng mốc `asOf`. Loại bỏ biến thể chưa có bản ghi tồn kho; bao gồm cả biến thể ngừng bán và biến thể có khả dụng = 0.

## Nhập và điều chỉnh tồn kho — PH-13 (UC-13.2, UC-13.3, ADR-060)

Endpoint `POST /api/admin/inventory/:id/adjust` và hộp thoại **Nhập / Điều chỉnh tồn** (`ConfirmDialog`) trên trang chi tiết tồn kho (`/admin/inventory/:id`):
- Hỗ trợ hai chế độ: `RECEIPT` (nhập thêm hàng dương vào tồn vật lý) và `ADJUSTMENT` (đặt lại tồn vật lý theo kiểm kê thực tế).
- Bắt buộc nhập lý do (`reason`, tối đa 255 ký tự) và lưu kèm `actor_user_id` vào bảng `stock_movements`, hiển thị trực tiếp lý do trên bảng lịch sử biến động.
- Khoá biến thể bằng `lockStock` trong giao dịch `ReadCommitted` (lấy `asOf` sau khi giữ khoá để thấy các lượt giữ hàng vừa commit); chặn điều chỉnh tồn vật lý thấp hơn lượng đang giữ (`reservedQuantity`) còn hiệu lực.
- Trên giao diện, hộp thoại dùng `ConfirmDialog` chuẩn (giữ vòng Tab, phím Escape, trả focus về nút mở) và xử lý `403` bằng `markForbidden` (đóng hộp thoại, xóa cache quản trị theo phiên).

## Đối soát tồn kho (K3)

[reconcile-inventory.sql](../../../tools/db/reconcile-inventory.sql) đối soát KPI K3 "không bán vượt tồn" trên một CSDL có dữ liệu, **chỉ đọc**: một transaction `REPEATABLE READ READ ONLY`, không có câu lệnh ghi. Mỗi kiểm tra là một bất biến mà mã đang bảo đảm; chú thích SQL trỏ tới `tệp:dòng` giữ bất biến đó.

| Kiểm tra | Vi phạm khi |
|---|---|
| `a_ton_am` | `quantity_on_hand < 0` |
| `b_giu_vuot_ton` | tổng hold chưa release, chưa hết hạn của một biến thể lớn hơn tồn, hoặc biến thể không có dòng tồn |
| `c1_sale_lech_dong_don` | SALE thiếu order, không khớp dòng đơn, sai lượng hoặc trùng |
| `c2_don_da_chot_thieu_sale` | đơn đã qua commit (trạng thái hay lịch sử có `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`) hoặc đã có SALE mà thiếu SALE ở một dòng |
| `c3_don_chua_chot_co_sale` | đơn chưa từng qua commit mà có SALE |
| `d1_return_lech_sale` | RETURN thiếu order, không có SALE cùng đơn và biến thể, sai lượng hoặc trùng |
| `d2_huy_sau_chot_thieu_return` | đơn có SALE và từng `CANCELLED` mà thiếu RETURN |
| `e_hold_chua_nha` | đơn đã rời `PENDING_PAYMENT`, `PENDING_CONFIRMATION` mà còn hold chưa release |
| `f_so_cai_lech_ton` | tồn khác tổng StockMovement (`tuyet_doi`), hoặc nhỏ hơn (`tuong_doi`) |

Chế độ sổ cái `-v so_cai=`: `tuyet_doi` (mặc định) đúng khi mọi tồn vào qua `stock:import`. `tuong_doi` chấp nhận số dư đầu kỳ nạp thẳng vào bảng `inventory`; khi đó chỉ bắt được tồn giảm mà không ghi sổ, còn tồn tăng ngoài sổ thì lẫn với số dư đầu kỳ.

Đầu ra: một dòng bối cảnh (CSDL, mốc snapshot, chế độ, số biến thể và đơn vị tồn nằm ngoài sổ), bảng `kiem_tra | so_vi_pham` có dòng `TONG`, rồi tối đa 20 dòng chi tiết cho mỗi kiểm tra có vi phạm. Mã thoát `0` là không vi phạm; `3` là có vi phạm (khối `DO` cuối) hoặc lỗi SQL.

Chạy từ gốc kho bằng Git Bash. PowerShell không có toán tử `<`, nên đưa tệp qua ống: `Get-Content tools/db/reconcile-inventory.sql -Raw | docker exec -i fashion-shop-postgres psql -X -U fashion -d fashion_shop -v ON_ERROR_STOP=1`.

- **DB dev:** `docker exec -i fashion-shop-postgres psql -X -U fashion -d fashion_shop -v ON_ERROR_STOP=1 < tools/db/reconcile-inventory.sql`
- **DB test, ngay sau `npm run test:load -w apps/api`:** cùng lệnh, đổi thành `-d fashion_shop_test` (tên theo `DATABASE_URL_TEST`) và thêm `-v so_cai=tuong_doi`, vì bộ tải tạo dòng tồn thẳng ([checkout-hot-sku.load.ts:59](../../../apps/api/test/load/checkout-hot-sku.load.ts#L59)). Sau `test:http` thì không dùng kết quả: fixture sửa trạng thái đơn và tồn trực tiếp nên có thể báo vi phạm giả ([checkout-refund.http.spec.ts:75](../../../apps/api/test/checkout-refund.http.spec.ts#L75), [cart-live.http.spec.ts:14](../../../apps/api/test/cart-live.http.spec.ts#L14)).
- **Staging:** để sau, khi script sao lưu ở nhánh `task/staging-db-backup` được gộp.
