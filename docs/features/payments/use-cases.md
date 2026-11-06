---
title: UC-08 Thanh toán và UC-14.3 Hoàn tiền — đặc tả use case
updated: 2026-11-05
status: đề xuất, chờ Bảo duyệt
owner: Bảo
---
# UC-08 · Thanh toán, UC-14.3 · Hoàn tiền

**Chức năng:** Khách trả tiền qua VNPAY, MoMo; cổng báo kết quả; quản trị viên hoàn tiền: luồng, luật và tiêu chí chấp nhận có phân loại.

| | |
|---|---|
| **Người viết đặc tả** | Bảo, 05/11, viết ngược từ mã PH-11 và bài kiểm thử đang chạy; mã use case theo danh mục của Duy ở [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26) (`46a238c`) |
| **Người sở hữu mã** | Bảo, module `payments`; chốt đơn và kho ở `checkout/settlement.service.ts` |
| **Dòng việc** | **PH-11** làm UC-08.1, UC-08.2, UC-14.3. UC-14.1, UC-14.2, UC-14.4 (đổi trả) chưa giao |
| **Tác nhân** | Khách hàng, Cổng thanh toán (VNPAY, MoMo), Quản trị viên (`ADMIN`) |
| **Dữ liệu** | `payments`, `payment_transactions`, `refunds` (module Payments); đơn và kho qua public service |

Cách đọc như [checkout/use-cases.md](../checkout/use-cases.md): AC có loại `thuận`, `âm`, `biên` ([LOG#adr-047](../../LOG.md#adr-047)); ma trận bài kiểm thử sinh bằng `npm run evidence:trace -- --uc UC-08,UC-14`. Cổng thật trong bài kiểm thử là cổng giả có chữ ký đúng đặc tả; nghiệm thu sandbox thật ghi ở [README](README.md).

---

## UC-08.1 · Thanh toán đơn hàng trực tuyến

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **trả tiền đơn qua VNPAY hoặc MoMo rồi quay về shop**, để **đơn được xác nhận ngay khi tôi trả xong**.

### Điều kiện trước
- Đơn `PENDING_PAYMENT` của chính khách, còn hạn giữ hàng; cổng đã cấu hình khoá.

### Điều kiện sau
- Thành công: payment `SUCCEEDED`, đơn `CONFIRMED`, kho trừ một lần (UC-08.2). Thất bại hoặc khách hủy trên cổng: đơn vẫn chờ, thử lại được trong hạn cũ.

### Luồng chính
| Bước | Khách hàng | Hệ thống |
|---|---|---|
| 1 | Bấm thanh toán trên đơn | Tạo lượt thanh toán (attempt); commit giữ hàng **trước** khi gọi mạng; trả link cổng hết hạn sớm hơn hold 3 phút |
| 2 | Trả tiền trên trang cổng | |
| 3 | Được cổng đưa về `/thanh-toan/ket-qua` | Web gửi tham số return về máy chủ để đối soát; chỉ tin kết quả máy chủ |
| 4 | | Return có chữ ký hợp lệ và khớp đơn thì chốt như IPN (UC-08.2); không thì chỉ đọc trạng thái |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Cổng chưa cấu hình khoá | Ẩn khỏi trang thanh toán; cố tạo thì 503 và rollback đơn, hold |
| E2 | Lượt trước thất bại | Cho lượt mới, **không** gia hạn hạn giữ hàng |
| E3 | Lượt trước chưa rõ kết quả (đang chờ, timeout) | Không mở lượt mới; MoMo gửi lại đúng payload đã lưu |
| E4 | Còn quá ít thời gian an toàn | 409 "Không còn đủ thời gian thanh toán an toàn cho đơn này. Hủy đơn và đặt lại." |
| E5 | Đổi cổng trên đơn đang chờ | 409 "Đơn chờ đang dùng cổng khác…" |
| E6 | Return giả, sửa tiền, sai merchant, ký bằng khoá khác | Không nhận tiền, không trừ kho |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Không có thanh toán giả lập trong ứng dụng; thiếu khoá là lỗi cấu hình |
| BR2 | Chỉ ghi nhận tiền khi chữ ký, merchant, mã tham chiếu và số tiền đều khớp ([vnpay.adapter.ts](../../../apps/api/src/modules/payments/vnpay.adapter.ts), [momo.adapter.ts](../../../apps/api/src/modules/payments/momo.adapter.ts)) |
| BR3 | VNPAY ký HMAC-SHA512 theo thứ tự khoá ASCII; MoMo ký HMAC-SHA256 theo thứ tự trường của tài liệu |
| BR4 | Chỉ đi tới `payUrl` thuộc host tin cậy, kể cả khi cổng báo thành công |

### Đường dẫn API
`POST /api/orders/:id/payments`, `POST /api/orders/:id/reconcile` (kèm `params` của return), `GET /api/orders/by-payment/:reference`.

### Tiêu chí chấp nhận
- **AC1** (thuận) Tạo lượt thanh toán commit giữ hàng trước khi gọi cổng; gửi lại cùng yêu cầu dùng lại cùng đơn và mã yêu cầu
- **AC2** (âm) Cổng chưa cấu hình: trang chỉ hiện cổng đã có khoá; cố tạo lượt trả 503, rollback đơn và hold, không giả lập
- **AC3** (biên) Lượt thất bại cho thử lại cùng hạn giữ hàng; lượt chưa rõ kết quả không mở lượt mới
- **AC4** (biên) Link cổng hết hạn trước hold 3 phút; thử lại sát hạn bị từ chối, không mở lượt
- **AC5** (âm) Return không chữ ký hoặc báo thành công giả chỉ đọc trạng thái; web vẫn hiện "đang chờ" tới khi máy chủ xác nhận
- **AC6** (thuận) Return có chữ ký đúng, thành công: đơn chốt ngay; gửi lại return hoặc IPN không trừ kho lần hai
- **AC7** (thuận) Khách hủy trên cổng (VNPAY mã 24, QueryDR trạng thái 11): đóng lượt, đơn giữ để thử lại, không trừ kho
- **AC8** (âm) Return hoặc query bị sửa tiền, sai mã tham chiếu, sai merchant, ký bằng khoá khác: không nhận tiền, không trừ kho, đơn giữ nguyên
- **AC9** (thuận) MoMo tạo lượt không rõ kết quả: lần sau gửi lại payload đã lưu, kể cả khi cấu hình callback đã đổi
- **AC10** (thuận) Chữ ký đúng đặc tả cổng: VNPAY HMAC-SHA512 khớp RFC 4231, MoMo ký đúng trường cho cả ví và thẻ ATM
- **AC11** (âm) Không đi tới `payUrl` lạ dù cổng báo thành công; chọn MoMo không dùng lại mã idempotency của VNPAY
- **AC12** (thuận) Quay về từ cổng: web tự đối soát qua máy chủ và đơn chuyển sang đã thanh toán, khách không phải thao tác

---

## UC-08.2 · Xác nhận thanh toán qua thông báo của cổng

### Câu chuyện người dùng
Là **cổng thanh toán**, tôi gửi **IPN báo kết quả giao dịch**, để **shop chốt đơn đúng một lần dù tôi gửi lặp hay gửi muộn**.

### Luồng chính
| Bước | Cổng / worker | Hệ thống |
|---|---|---|
| 1 | Cổng gửi IPN (VNPAY `GET /api/payments/vnpay/ipn`, MoMo `POST /api/payments/momo/ipn`) | Adapter kiểm chữ ký, merchant, mã tham chiếu, số tiền |
| 2 | | Khoá đơn; hold còn hạn thì trừ kho, ghi `SALE`, đơn `CONFIRMED`, trừ đúng lượng đã mua khỏi giỏ |
| 3 | | Trả mã cổng yêu cầu (VNPAY `RspCode`, MoMo 204) |
| 4 | Worker mỗi 30 giây | Query cổng cho payment chưa rõ trong 24 giờ; nhả hàng đơn quá hạn |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Idempotent theo payment: nhận lặp không thu hay trừ kho thêm (T-M2) |
| BR2 | Tiền về sau khi nhả hàng, hoặc hai lượt cùng thu: ghi đủ giao dịch, đơn `PAYMENT_REVIEW`, không trừ kho thêm |
| BR3 | Lỗi khi chốt: rollback toàn bộ, trả lỗi để cổng gửi lại; không lộ chi tiết lỗi ra log công khai |
| BR4 | VNPAY QueryDR cách ít nhất 305 giây; lỗi đường truyền lùi 30 giây. `ResponseCode=00` chỉ là query thành công, `TransactionStatus=00` mới là thu tiền |
| BR5 | Worker xử lý từng mục riêng: một mục lỗi không chặn mục khác; hết 20 giây thì để tick sau |

### Tiêu chí chấp nhận
- **AC1** (thuận) IPN ký đúng chốt đơn: trừ kho, ghi `SALE`, đơn `CONFIRMED`, giỏ giữ món thêm mới sau khi đặt
- **AC2** (âm) IPN sai chữ ký, sai tiền hoặc sai cổng bị chặn, không ghi gì
- **AC3** (biên) IPN, return và query trùng nhau chỉ thu và trừ kho một lần (T-M2)
- **AC4** (âm) Lỗi khi chốt: MoMo nhận 503 để gửi lại, VNPAY rollback cả tiền, đơn, hold, giỏ; lần gửi lại chốt đúng một lần
- **AC5** (thuận) Mất IPN: query có chữ ký phục hồi đơn sau khởi động lại; query giả mạo không chốt
- **AC6** (biên) VNPAY không query sớm hay lặp trong 5 phút; mất kết nối chỉ lùi 30 giây rồi chốt được
- **AC7** (biên) Hai lượt cùng thu tiền: ghi đủ giao dịch, kho trừ một lần; tiền về sau khi hết hạn vào `PAYMENT_REVIEW`, không bán vượt
- **AC8** (thuận) Bảng mã VNPAY: chỉ `TransactionStatus=00` sau khi kiểm chữ ký mới là thu tiền
- **AC9** (biên) Worker vét nhiều lô trong ngân sách thời gian; mục lỗi không chặn mục sau, hết ngân sách để tick sau

---

## UC-14.3 · Thực hiện hoàn tiền đơn hàng

### Câu chuyện người dùng
Là một **quản trị viên**, tôi muốn **hoàn toàn bộ hoặc một phần tiền đã thu qua cổng**, để **trả tiền cho khách mà cổng không bao giờ hoàn hai lần**.

### Luồng chính
| Bước | Quản trị viên | Hệ thống |
|---|---|---|
| 1 | Mở đơn ở `/admin/orders`, bấm hoàn, sửa số tiền và lý do | Hộp xác nhận điền sẵn số còn hoàn được |
| 2 | Xác nhận | Dưới khoá đơn ghi lệnh `REFUND-INTENT` trạng thái `RECEIVED` **trước** khi gọi cổng |
| 3 | | Cổng trả thành công: ghi sổ hoàn, đơn `PARTIALLY_REFUNDED` hoặc `REFUNDED` theo tổng sổ |
| 4 | Cổng không trả lời rõ: đối chiếu trên trang cổng rồi chốt `SUCCEEDED` hoặc `FAILED` | Chốt không gọi cổng lần nữa |

Đường dẫn: `POST /api/admin/payments/:id/refund`, `POST /api/admin/payments/:id/refund/resolve`, `POST /api/admin/orders/:id/cancel-refund`. Lý do thiết kế: [ADR-036](LOG.md#adr-036), [ADR-038](../../LOG.md#adr-038).

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Còn lệnh `RECEIVED` thì lệnh mới trả 409 `REFUND_PENDING` (T-M3) |
| BR2 | Tổng đã hoàn không vượt số đã thu; hoàn đủ thì lệnh tiếp trả 409 |
| BR3 | Hoàn tiền không tự trả kho, trừ khi hủy đơn còn `CONFIRMED` (hàng chưa rời kho) |
| BR4 | VNPAY loại `02` chỉ khi hoàn trọn ngay lần đầu, còn lại `03`; MoMo hoàn theo `transId` lúc thu, mỗi lệnh một `orderId` mới |

### Tiêu chí chấp nhận
- **AC1** (biên) Hai lần bấm hoàn song song: cổng nhận đúng một lệnh, đơn `REFUNDED` một lần (T-M3)
- **AC2** (biên) Hoàn một phần hai lần: `PARTIALLY_REFUNDED` rồi `REFUNDED`, tổng theo sổ; lần ba trả 409
- **AC3** (âm) Cổng mất kết nối: lệnh giữ chờ đối soát, lệnh mới bị chặn; chốt `FAILED` rồi hoàn lại được
- **AC4** (âm) Cổng trả mã lỗi: lệnh giữ chờ; chốt `SUCCEEDED` ghi sổ mà không gọi cổng lại
- **AC5** (biên) Không chốt được lệnh đang chờ cổng trả lời; lệnh treo quá hạn (tiến trình sập giữa chừng) thì chốt được
- **AC6** (âm) Chỉ `ADMIN` hoàn và chốt; khách gọi nhận 403, không tạo lệnh
- **AC7** (thuận) Quản trị viên hủy và hoàn đơn `CONFIRMED`: hàng về kho, đơn `REFUNDED`
- **AC8** (thuận) Lệnh hoàn ký đúng đặc tả cổng; phản hồi sai mã, sai chữ ký, lệch lệnh hoặc thiếu `transId` bị coi là chưa rõ
- **AC9** (âm) Hoàn gặp lỗi 5xx: web báo chưa xác định kết quả, không in lỗi thô, đọc lại đơn trước khi cho thao tác tiếp
