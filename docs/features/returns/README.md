---
title: Trả hàng
updated: 2026-11-14
status: API có trên nhánh `task/returns-api`, chưa vào develop; web chưa làm
owner: Bảo
---
# Trả hàng

**Chức năng:** Bản đồ phân hệ trả hàng và hoàn tiền sau giao: phạm vi, luồng, API đề xuất, dữ liệu, phụ thuộc và trạng thái hôm nay.

| Mục | Hiện trạng |
|---|---|
| Người sở hữu | Bảo; mã ở [`apps/api/src/modules/returns`](../../../apps/api/src/modules/returns/README.md); web sẽ ở `apps/web/src/features/returns` |
| Dòng việc | PH-11, nhánh `feature/ph-11-payment` |
| Ca sử dụng | [UC-14.1, UC-14.2](use-cases.md). UC-14.3 hoàn tiền ở [payments](../payments/use-cases.md). UC-14.4 đổi hàng: làm sau, xem mục cuối |
| Quyết định | [ADR-067](LOG.md#adr-067) luật trả hàng, [ADR-068](LOG.md#adr-068) nối với checkout (cả hai `đề xuất`) |
| Cam kết | F10 "Yêu cầu đổi trả", F15 "Duyệt đổi trả" trong phiếu đăng ký |
| Dữ liệu | Bảng `returns`, `return_items`, `return_media`, `refunds`, `refund_items` trong `identity.prisma`; migration `20261114084345_ph11_returns_flow` thêm lý do, người duyệt, các mốc, tài khoản nhận và khoá ảnh |

## Phạm vi bản này

Chỉ **trả hàng và hoàn tiền** (mọi `return_items.resolution` = `REFUND`). Đổi sang cỡ hoặc màu khác (UC-14.4) cần giao món thay thế qua phân hệ vận chuyển, nên làm sau khi [PR #111](https://github.com/F-R-E-Y-A/fashion-shop/pull/111) vào `develop`.

## Luồng

| Trạng thái `returns.status` | Ai chuyển | Điều kiện |
|---|---|---|
| `REQUESTED` | Khách gửi | Đơn `DELIVERED` của chính khách, trong 15 ngày kể từ lúc giao, đơn chưa có yêu cầu nào khác `REJECTED`/`CANCELLED` |
| `CANCELLED` | Khách | Chỉ khi còn `REQUESTED` |
| `APPROVED` / `REJECTED` | `ADMIN` | Từ `REQUESTED`; từ chối phải có lý do |
| `RECEIVED` | `ADMIN` | Từ `APPROVED`; cộng kho từng món bằng `stock_movements` loại `RETURN` |
| `COMPLETED` | `ADMIN` | Từ `RECEIVED`; hoàn tiền xong, đơn sang `PARTIALLY_REFUNDED` hoặc `REFUNDED` |

Hoàn tiền:
- Đơn trả online: gọi `refundPayment` có sẵn. Sổ của cổng vẫn là `payment_transactions` ([ADR-036](../payments/LOG.md#adr-036)); bảng `refunds` nối yêu cầu trả với lần hoàn.
- Đơn COD: khách nhập tài khoản nhận tiền khi gửi yêu cầu; `ADMIN` chuyển khoản tay rồi nhập mã giao dịch. Ba trường tài khoản bị xoá khi yêu cầu sang `COMPLETED`.

## API

Đã cài đặt; hình dạng ở Swagger `/api/docs`, thẻ `returns` (khách: `GET /api/orders/:id/returns/eligibility`, `POST /api/orders/:id/returns`, `/api/returns…`) và `admin-returns` (`/api/admin/returns…`: duyệt, từ chối, nhận hàng, hoàn tiền). Cách mỗi bước chạy dưới khoá: [README của module](../../../apps/api/src/modules/returns/README.md).

## Phụ thuộc và thứ tự

- [PR #74](https://github.com/F-R-E-Y-A/fashion-shop/pull/74) đổi cách `OrdersService.transition` gửi thông báo sau commit; [PR #111](https://github.com/F-R-E-Y-A/fashion-shop/pull/111) và [PR #113](https://github.com/F-R-E-Y-A/fashion-shop/pull/113) sửa `orders.service.ts`, `checkout.service.ts`, `orders.prisma`. API trả hàng làm trước trên mã develop ngày 14/11; mọi chuyển trạng thái đơn đi qua `checkout.withOrder` nên khi ba PR vào chỉ cần gộp và sửa xung đột ở `checkout.service.ts`.
- Bảng chọn phân loại `ui/VariantPicker` ([PR #130](https://github.com/F-R-E-Y-A/fashion-shop/pull/130)) dùng lại cho UC-14.4.

## Đổi hàng (UC-14.4): việc sau

Thêm, không sửa bản này: `resolution` = `EXCHANGE` kèm `replacement_variant_id` (cột đã có). Khi duyệt thì giữ kho biến thể thay thế; khi nhận hàng về thì tạo vận đơn giao món thay thế. Chênh giá giữa hai biến thể: [TBD — Bảo chốt khi làm UC-14.4].
