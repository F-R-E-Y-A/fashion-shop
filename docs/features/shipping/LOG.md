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

## 2026-11-14 · PH-02 — luồng FAILED → RETURNED, đơn trả trước và khoá đơn

**Loại:** thay đổi mã · **Commit:** đề xuất.

Xử lý review PR #111 của Bảo và Tài. `FAILED` chỉ ghi nhận vận đơn; trả kho và hủy đơn COD dời sang `RETURNED` (hàng về tới kho) để không cộng kho khi hàng còn trên xe và để `FAILED` → `RETURNED` không còn bị chặn. Đơn đã hủy vẫn xác nhận được `RETURNED` mà không hoàn kho hay ghi thanh toán lần nữa, vẫn chặn chuyển sang đang giao/đã giao. Đơn trả trước không tự hủy: giữ trạng thái đơn, admin hoàn tiền theo luồng hiện có. Khoá đơn bằng `OrdersService.lock` đầu giao dịch, cùng khoá với thao tác admin. Trang admin có thêm nút mô phỏng "Hàng hoàn về kho". [README](README.md).

<a id="adr-070"></a>
## 2026-11-16 · ADR-070 — Tích hợp GHN Sandbox qua lớp Gateway và giữ cơ chế dự phòng mô phỏng nội bộ

**Loại:** quyết định · **Phạm vi:** `apps/api/src/modules/shipping`, `apps/api/prisma/schema/orders.prisma`, `apps/web/src/features/checkout` · **Trạng thái:** đề xuất · **Người quyết:** Duy · **Commit:** (điền khi thi hành)

### Hiện trạng
Bản `shipping` trước đây chỉ sinh mã mô phỏng `GHN-SBX-...` và gắn cờ cứng `isMock: true` trong phản hồi ([shipping.service.ts](../../../apps/api/src/modules/shipping/shipping.service.ts), [checkout.service.ts](../../../apps/api/src/modules/checkout/checkout.service.ts)), chưa kết nối được với API GHN Sandbox (`dev-online-gateway.ghn.vn`) và chưa hỗ trợ payload callback/tra cứu của GHN.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Chỉ gọi GHN Sandbox, bỏ mô phỏng | Đơn giản nhánh xử lý | Chết luồng demo khi GHN Sandbox bảo trì, thiếu token hoặc webhook không tới localhost | Dễ |
| **B. Tách `ShippingCarrierGateway` (`GhnCarrierGateway` + `MockCarrierGateway`) và chế độ `AUTO / GHN / MOCK` (chọn)** | Tạo vận đơn thật trên GHN Sandbox, nhận webhook & đồng bộ chủ động, nhưng vẫn tự fallback hoặc cho phép admin chọn mô phỏng khi cần | Thêm 4 cột trạng thái trên `Shipment` (`is_mock`, `carrier_status`, `status_note`, `expected_delivery_at`) và 1 bảng ánh xạ 20+ mã trạng thái GHN | Dễ |

**Chọn B** vì đồ án vừa cần chứng minh tích hợp thật với GHN Sandbox (tạo vận đơn, giải mã địa chỉ 2 cấp Việt Nam mới qua Master Data v3 + `is_new_to_address: true`, nhận webhook GHN), vừa cần đảm bảo khả năng demo và test tự động ổn định ngay cả khi không có kết nối mạng ra ngoài hoặc thiếu token sandbox. Gọi HTTP GHN tạo đơn được đặt trước `$transaction` để tránh giữ lock cơ sở dữ liệu khi mạng chậm.

### Kết quả mong đợi → thực tế
Mong đợi:
- `npm -w apps/api run typecheck`, `npm -w apps/web run typecheck` và unit tests `shipping.service.spec.ts`, `ghn.carrier.spec.ts`, `shipment-webhook.controller.spec.ts`, `admin-orders.test.tsx`, `checkout.test.tsx` pass.
Thực tế: đang kiểm định sau khi hoàn thiện cả 5 phân hệ của Duy.

### Điều kiện xem lại
Khi tích hợp thêm đơn vị vận chuyển thật thứ hai (GHTK, Viettel Post) hoặc áp dụng đối soát cước phí động theo cân nặng từng sản phẩm.
