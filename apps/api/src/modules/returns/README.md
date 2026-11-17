---
title: Hợp đồng module returns
updated: 2026-11-14
status: đề xuất, trên nhánh task/returns-api, chưa vào develop
owner: Bảo
---
# Phân hệ `returns` — trả hàng và hoàn tiền sau giao

**Chức năng:** Module trả hàng phụ thuộc ai, giữ bảng nào, mỗi bước chạy dưới khoá nào và hoàn tiền nối với sổ của checkout ra sao.

**Quyết định:** [ADR-067](../../../../../docs/features/returns/LOG.md#adr-067) (luật nghiệp vụ), [ADR-068](../../../../../docs/features/returns/LOG.md#adr-068) (nối với checkout) · **Đặc tả:** [UC-14.1, UC-14.2](../../../../../docs/features/returns/use-cases.md) · Hình dạng HTTP: Swagger `/api/docs`, thẻ `returns`, `admin-returns`.

## Phụ thuộc

Một chiều: `returns` → `checkout` (khoá đơn, hoàn tiền, kho qua `checkout.inventory`) và `uploads` (ảnh). Không module nào import `returns`. `index.ts` chỉ xuất `ReturnsModule`.

## Dữ liệu

Module sở hữu `returns`, `return_items`, `return_media`, `refunds`, `refund_items`. Bản này mọi `return_items.resolution` là `REFUND`. Sổ tiền thật vẫn là `payment_transactions` của checkout; `refunds` chỉ nối yêu cầu với payment và mã hoàn, một dòng mỗi yêu cầu (`idempotency_key = return:<id>`).

## Mỗi bước chạy thế nào

| Bước | Ở đâu | Chặn trùng và chạy đua |
|---|---|---|
| Khách gửi | `ReturnsService.create` | Hỏi kho ảnh trước, ngoài khoá. Trong `withOrder`: kiểm đơn `DELIVERED`, hạn 15 ngày từ lần `DELIVERED` cuối, chưa có yêu cầu đang xử lý, số lượng; `uploads.attach` cùng transaction |
| Khách huỷ | `ReturnsService.cancel` | `updateMany` có điều kiện `REQUESTED`; xoá tài khoản nhận |
| Duyệt, từ chối | `AdminReturnsService` | `updateMany` có điều kiện `REQUESTED`; từ chối xoá tài khoản nhận |
| Nhận hàng | `AdminReturnsService.receive` | `APPROVED → RECEIVED` có điều kiện, rồi `inventory.restockReturned`; dòng `RETURN` unique theo (đơn, biến thể) nên hai lần bấm chỉ cộng kho một lần |
| Hoàn COD | `AdminReturnsService.refund` | Một transaction: `checkout.recordManualRefund` ghi `REFUND:MANUAL:<mã chuyển khoản>`, tạo `refunds` `SUCCEEDED`, yêu cầu `COMPLETED`, xoá tài khoản nhận |
| Hoàn online | như trên | Transaction 1 giữ dòng `refunds` `PROCESSING` mang mã lệnh đặt trước. Gọi `checkout.refundPayment` ngoài transaction. Cổng trả 00: listener `onRefundSettled` đóng yêu cầu cùng transaction ghi sổ. Cổng không trả lời: 503, yêu cầu giữ `RECEIVED`; ADMIN chốt lệnh ở trang đơn (SUCCEEDED thì listener đóng yêu cầu; FAILED thì bấm hoàn lại sinh mã lệnh mới) |

Mọi `orders.transition` đi qua `checkout.withOrder`, nên khi PR #74 (thông báo sau commit) vào thì không phải sửa module này.

## Ảnh

Mục đích `return` ở uploads, thư mục `freya/returns/<userId>`, tối đa 3 ảnh. Bắt buộc ít nhất 1 ảnh khi lý do là `DEFECTIVE` hoặc `WRONG_ITEM`, **trừ khi máy chủ chưa bật kho ảnh**: khi đó khách mô tả bằng chữ ([ADR-068](../../../../../docs/features/returns/LOG.md#adr-068)).

## Kiểm thử

- `return-policy.spec.ts`: hạn 15 ngày, ảnh bắt buộc, tiền hoàn, enum khớp Prisma.
- `test/returns.http.spec.ts`: 13 bài trên PostgreSQL và cổng VNPAY giả, tên theo `UC-14.1/ACk`, `UC-14.2/ACk`.
