---
title: Shipping — nhật ký
updated: 2026-10-18
status: đang dùng
owner: Duy
---
# Shipping — nhật ký

**Chức năng:** Lý do chọn chính sách phí vận chuyển theo giai đoạn.

## 2026-10-18 · PH-11 — phí nội địa cố định, miễn ship theo tiền hàng

**Loại:** thay đổi mã và dữ liệu nền · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Bảo uỷ quyền chọn phí hợp shop thời trang. Dùng cấu hình ShippingZone/Rate sẵn có, 30.000đ và ngưỡng 500.000đ để luồng đặt hàng hoạt động trước khi ghép carrier/voucher. Không hardcode miễn ship vào web; server trả quote và Order giữ snapshot. [ADR-032](../../LOG.md#adr-032), [README](README.md).
