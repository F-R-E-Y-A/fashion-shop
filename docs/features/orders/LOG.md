---
title: Orders — nhật ký
updated: 2026-10-18
status: đang dùng
owner: Duy
---
# Orders — nhật ký

**Chức năng:** Ghi thay đổi mô hình và vòng đời đơn.

## 2026-10-18 · PH-11 — snapshot và trạng thái tiền tách biệt khả năng giao hàng

**Loại:** thay đổi mã · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Giữ Order/Item/History sẵn có; thêm key/fingerprint/deadline và hai trạng thái cần cho luồng trả trước. Cột mới nullable để dữ liệu cũ vẫn hợp lệ. `PAYMENT_REVIEW` không che mất việc đã nhận tiền sau khi đơn hủy/nhả hàng. Đánh đổi và cách điều phối ở [ADR-032](../../LOG.md#adr-032); phạm vi ở [README](README.md).
