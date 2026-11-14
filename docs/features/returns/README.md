---
title: Trả hàng
updated: 2026-11-14
status: đề xuất; chưa có mã
owner: Bảo
---
# Trả hàng

**Chức năng:** Bản đồ phân hệ trả hàng và hoàn tiền sau giao: phạm vi, luồng, API đề xuất, dữ liệu, phụ thuộc và trạng thái hôm nay.

| Mục | Hiện trạng |
|---|---|
| Người sở hữu | Bảo; sẽ ở `apps/api/src/modules/returns`, `apps/web/src/features/returns` |
| Dòng việc | PH-11, nhánh `feature/ph-11-payment` |
| Ca sử dụng | [UC-14.1, UC-14.2](use-cases.md). UC-14.3 hoàn tiền ở [payments](../payments/use-cases.md). UC-14.4 đổi hàng: làm sau, xem mục cuối |
| Quyết định | [ADR-067](LOG.md#adr-067) luật trả hàng (`đề xuất`) |
| Cam kết | F10 "Yêu cầu đổi trả", F15 "Duyệt đổi trả" trong phiếu đăng ký |
| Dữ liệu có sẵn | Bảng `returns`, `return_items`, `return_media`, `refunds`, `refund_items` trong `identity.prisma`, chưa có mã nào dùng |

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

## API đề xuất

Chưa cài đặt; khi có mã thì hình dạng thật ở Swagger `/api/docs`.

| Ai | Endpoint | Việc |
|---|---|---|
| Khách | `POST /api/orders/:id/returns` | Gửi yêu cầu: các món và số lượng, mã lý do, mô tả, ảnh, tài khoản nhận (đơn COD) |
| Khách | `GET /api/returns`, `GET /api/returns/:id` | Danh sách và chi tiết yêu cầu của mình; không trả số tài khoản |
| Khách | `POST /api/returns/:id/cancel` | Huỷ khi còn `REQUESTED` |
| `ADMIN` | `GET /api/admin/returns`, `GET /api/admin/returns/:id` | Hàng chờ theo trạng thái; chi tiết kèm ảnh, tài khoản nhận |
| `ADMIN` | `POST /api/admin/returns/:id/approve`, `…/reject` | Duyệt; từ chối kèm lý do |
| `ADMIN` | `POST /api/admin/returns/:id/receive` | Ghi nhận hàng về, cộng kho |
| `ADMIN` | `POST /api/admin/returns/:id/refund` | Hoàn tiền; đơn COD gửi kèm mã chuyển khoản |

## Dữ liệu cần thêm

`returns`: `reason_code` (enum 5 lý do), `decision_note`, `decided_by_id`, `decided_at`, `received_at`, `completed_at`, `refund_bank_name`, `refund_account_number`, `refund_account_holder` (ba trường cuối nullable, xoá khi `COMPLETED`). Mục đích tải ảnh mới `return` ở module uploads.

## Phụ thuộc và thứ tự

- [PR #74](https://github.com/F-R-E-Y-A/fashion-shop/pull/74) đổi cách `OrdersService.transition` gửi thông báo sau commit; [PR #111](https://github.com/F-R-E-Y-A/fashion-shop/pull/111) và [PR #113](https://github.com/F-R-E-Y-A/fashion-shop/pull/113) sửa `orders.service.ts`, `checkout.service.ts`, `orders.prisma`. Schema và API trả hàng làm sau khi ba PR này vào `develop`.
- Bảng chọn phân loại `ui/VariantPicker` ([PR #130](https://github.com/F-R-E-Y-A/fashion-shop/pull/130)) dùng lại cho UC-14.4.

## Đổi hàng (UC-14.4): việc sau

Thêm, không sửa bản này: `resolution` = `EXCHANGE` kèm `replacement_variant_id` (cột đã có). Khi duyệt thì giữ kho biến thể thay thế; khi nhận hàng về thì tạo vận đơn giao món thay thế. Chênh giá giữa hai biến thể: [TBD — Bảo chốt khi làm UC-14.4].
