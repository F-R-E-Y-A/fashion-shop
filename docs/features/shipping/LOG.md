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

## 2026-11-13 · PH-02 — vận đơn và webhook cập nhật từ hãng vận chuyển

**Loại:** thay đổi mã và lược đồ · **Commit:** đề xuất.

Bổ sung trường `carrier_name` vào bảng `shipments`. Cung cấp API cho Admin tạo vận đơn (mô phỏng Sandbox `GHN-SBX-...`), webhook nhận sự kiện từ đơn vị vận chuyển với header xác thực bí mật `x-carrier-token` chỉ đọc từ biến môi trường server (bỏ secret mặc định và đổi nút mô phỏng trên Admin sang gọi trực tiếp endpoint `PATCH /api/admin/orders/:id/shipment/status`), kiểm tra ma trận chuyển trạng thái idempotent chặn lùi đơn và chặn cập nhật đơn đã hủy `CANCELLED`, chuẩn hóa tiền tố receipt COD `COD:<orderCode>:<uuid>` tương thích Reporting #112, tách danh tính hãng khỏi UUID actor người dùng, và giao diện theo dõi tiến trình giao hàng trực quan cho khách hàng. [README](README.md).
