---
title: Trả hàng — nhật ký quyết định
updated: 2026-11-14
status: đang dùng
owner: Bảo
---
# Trả hàng — nhật ký (chỉ thêm vào cuối)

**Chức năng:** Vì sao phân hệ trả hàng có luật như hiện tại: phương án đã cân, số liệu khảo sát, trạng thái từng quyết định.

<a id="adr-067"></a>
## 2026-11-14 · ADR-067 — Bản đầu chỉ trả và hoàn, hạn 15 ngày, đơn COD hoàn vào tài khoản khách nhập

**Loại:** quyết định · **Phạm vi:** khách, `ADMIN`; module returns, payments, inventory · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi thi hành)

### Hiện trạng
- Bảng `returns`, `return_items`, `return_media`, `refunds`, `refund_items` đã có trong `apps/api/prisma/schema/identity.prisma`, chưa có mã nào dùng. Enum `ReturnStatus` có `REQUESTED`, `APPROVED`, `REJECTED`, `RECEIVED`, `COMPLETED`, `CANCELLED`; `ReturnItemResolution` có `REFUND`, `EXCHANGE`.
- Đơn `DELIVERED` đã được phép sang `PARTIALLY_REFUNDED`/`REFUNDED`; `refundPayment` hoàn một phần qua cổng, sổ ở `payment_transactions` ([ADR-036](../payments/LOG.md#adr-036)).
- `stock_movements` unique theo (đơn, biến thể, loại), nên mỗi biến thể chỉ có một dòng `RETURN` cho một đơn.
- Khảo sát 41 phiếu, 04–10/11, cả 41 người 18–24 tuổi, đa số ở TP.HCM; câu 8.x chỉ 23 người trả lời; không hỏi số ngày, không hỏi thích đổi hay hoàn. Bảng số trong sổ việc ngoài kho (`work/surveys/freya-2026-10-25/tong-hop-41-phieu-2026-11-10.json`):
  - 7.1: 23/37 từng muốn đổi/trả; 8 người muốn nhưng bỏ cuộc.
  - 8.1: cỡ không vừa 14/23; kiểu, màu, chất liệu khác mong đợi 14; lỗi/hư 8; sai/thiếu hàng 5; đổi ý 1.
  - 8.2: không rõ điều kiện 7/23; đòi nhiều bằng chứng 7; phí và đóng gói gửi lại 7; khó liên hệ 6; chờ hàng đổi lâu 5.
  - 9.1: muốn nhận vào tài khoản ngân hàng tự chọn 26/41; về đúng phương thức đã trả 25; số dư hoặc phiếu mua hàng 5.
  - 5.1: đã dùng COD 16/37.
- Shopee cho trả trong 15 ngày kể từ "Giao hàng thành công" (blog Shopee, VnExpress); 25/38 người xem hàng chủ yếu trên sàn.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| **A. Chỉ trả và hoàn (chọn)** | Dùng lại hoàn tiền và kho có sẵn; khoảng 3,5 ngày | Khách cỡ không vừa phải tự đặt lại | Dễ: B chỉ thêm |
| B. Trả, hoàn và đổi hàng | Đúng nhu cầu lớn nhất (cỡ không vừa 14/23) | Cần giao món thay thế qua phân hệ vận chuyển, PR #111 chưa gộp; thêm 1,5–2 ngày | — |
| C. A kèm nút "Đặt cỡ khác" trên yêu cầu | Rẻ hơn B | Bảo thấy dễ hiểu nhầm là kéo khách đặt thay vì trả | Dễ |

**Chọn A.** B làm sau khi PR #111 vào `develop`, theo cách thêm vào chứ không sửa A.

Luật đi kèm:
1. Hạn 15 ngày kể từ lúc đơn `DELIVERED`, một hằng số.
2. Năm lý do cố định theo câu 8.1: cỡ không vừa; kiểu, màu, chất liệu khác mong đợi; lỗi hoặc hư; sai hoặc thiếu hàng; đổi ý.
3. Ảnh 0–3; bắt buộc ít nhất 1 ảnh khi lý do là lỗi/hư hoặc sai/thiếu hàng (8.2: "đòi nhiều bằng chứng").
4. Mỗi đơn chỉ một yêu cầu không ở `REJECTED`/`CANCELLED`, do ràng buộc unique của `stock_movements`.
5. Đơn trả online hoàn về đúng cổng. Đơn COD: khách nhập ngân hàng, số tài khoản, tên chủ tài khoản; `ADMIN` chuyển khoản tay và nhập mã giao dịch. Ba trường này chỉ `ADMIN` đọc được, không ghi log, xoá trong cùng transaction chuyển `COMPLETED`.
6. Tiền hoàn bằng tiền hàng các món trả. Phí giao gốc chỉ hoàn khi trả cả đơn vì lỗi của shop. Phí gửi trả do shop chịu khi lỗi/sai hàng, khách chịu với lý do khác; hệ thống không tạo vận đơn gửi trả.
7. Không chuyển sổ hoàn cũ sang `refunds`; `refunds` chỉ nối yêu cầu trả với payment và mã hoàn.

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| Câu hỏi phản biện | Bảo hỏi nút "Đặt cỡ khác" có phải để kéo khách đặt lại thay vì trả không | Bỏ nút; trang yêu cầu vẫn có liên kết tới sản phẩm |
| Câu hỏi phản biện | Bảo muốn đổi phân loại thuận tiện như Shopee | Tách thành việc riêng ở giỏ hàng ([PR #130](https://github.com/F-R-E-Y-A/fashion-shop/pull/130)); bảng chọn dùng lại cho B |
| AI gợi ý | Claude Code (Opus 5.5, 14/11): lưu số tài khoản là dữ liệu nhạy cảm, nên giới hạn người đọc và xoá khi xong | giữ |

**Kết luận:** Bản đầu cho khách gửi yêu cầu trả trong 15 ngày, `ADMIN` duyệt, nhận hàng, cộng kho và hoàn tiền; đổi hàng làm sau.
**Bằng chứng:** chưa có mã; điền commit khi thi hành.

### Kết quả mong đợi → thực tế
Mong đợi: một yêu cầu trả chạy trọn trên staging, từ khách gửi tới `COMPLETED`, cả đơn online lẫn COD; F10 và F15 chuyển "Có".
Thực tế: (điền sau khi thử trên staging).

### Điều kiện xem lại
PR #111 vào `develop` (làm B); người thực nghiệm phàn nàn hạn 15 ngày hoặc cách hoàn COD; có yêu cầu trả thứ hai cho cùng đơn.
