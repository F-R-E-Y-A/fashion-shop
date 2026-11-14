---
title: UC-14.1 và UC-14.2 Trả hàng — đặc tả use case
updated: 2026-11-14
status: đề xuất, chờ Bảo duyệt
owner: Bảo
---
# UC-14.1 · Gửi yêu cầu trả hàng, UC-14.2 · Duyệt và xử lý trả hàng

**Chức năng:** Khách gửi yêu cầu trả, quản trị viên duyệt, nhận hàng, cộng kho và hoàn tiền: luồng, luật và tiêu chí chấp nhận có phân loại.

| | |
|---|---|
| **Người viết đặc tả** | Bảo, 14/11, viết trước khi có mã; luật theo [ADR-067](LOG.md#adr-067) |
| **Người sở hữu mã** | Bảo, module `returns` (sẽ tạo); kho qua `InventoryService`, hoàn tiền qua `refundPayment` của checkout |
| **Dòng việc** | **PH-11**. UC-14.3 hoàn tiền ở [payments](../payments/use-cases.md). UC-14.4 đổi hàng làm sau |
| **Tác nhân** | Khách hàng, Quản trị viên (`ADMIN`), Cổng thanh toán (khi hoàn online) |
| **Dữ liệu** | `returns`, `return_items`, `return_media`, `refunds`, `refund_items`; đơn, payment và kho qua public service |

Cách đọc như [checkout/use-cases.md](../checkout/use-cases.md): AC có loại `thuận`, `âm`, `biên` ([LOG#adr-047](../../LOG.md#adr-047)). Tên bài kiểm thử mang mã `UC-14.1/ACk`, `UC-14.2/ACk`.

---

## UC-14.1 · Gửi yêu cầu trả hàng

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **gửi yêu cầu trả món không vừa ý ngay từ trang đơn và theo dõi tới khi nhận lại tiền**, để **không phải nhắn tin hỏi shop**.

### Điều kiện trước
- Khách đã đăng nhập; đơn của chính khách ở `DELIVERED`, giao chưa quá 15 ngày; đơn chưa có yêu cầu nào khác `REJECTED`/`CANCELLED`.

### Điều kiện sau
- Thành công: yêu cầu `REQUESTED` kèm các món, lý do, ảnh; đơn và kho chưa đổi. Khách huỷ: yêu cầu `CANCELLED`, gửi lại được nếu còn hạn.

### Luồng chính
| Bước | Khách hàng | Hệ thống |
|---|---|---|
| 1 | Mở trang đơn đã giao | Hiện nút "Yêu cầu trả hàng" và hạn còn lại, khi đủ điều kiện trước |
| 2 | Bấm nút | Hiện điều kiện trả, phí gửi trả theo lý do, cách nhận tiền **trước** khi khách điền |
| 3 | Chọn món và số lượng, chọn một trong năm lý do, mô tả, thêm ảnh | Bắt buộc ảnh khi lý do là lỗi/hư hoặc sai/thiếu hàng |
| 4 | Đơn COD: nhập ngân hàng, số tài khoản, tên chủ tài khoản | Đơn online không hỏi; tiền về đúng cổng đã trả |
| 5 | Gửi | Kiểm lại mọi điều kiện ở máy chủ; ghi yêu cầu `REQUESTED` |
| 6 | Xem "Yêu cầu trả hàng của tôi" | Hiện trạng thái từng bước, lý do từ chối nếu có |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Quá 15 ngày, hoặc đơn chưa `DELIVERED` | 409, không ghi; web không hiện nút |
| E2 | Đơn đã có yêu cầu đang xử lý hoặc đã xong | 409, chỉ tới yêu cầu đó |
| E3 | Số lượng trả lớn hơn số đã mua của món đó, hoặc món không thuộc đơn | 400 |
| E4 | Lỗi/hư hoặc sai/thiếu hàng mà không có ảnh; hơn 3 ảnh; ảnh không phải của khách đã tải | 400 |
| E5 | Đơn COD thiếu thông tin tài khoản | 400 |
| E6 | Khách huỷ yêu cầu đã được duyệt | 409 |
| E7 | Xem yêu cầu của khách khác | 404 |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Hạn 15 ngày tính từ lúc đơn chuyển `DELIVERED` |
| BR2 | Mỗi đơn chỉ một yêu cầu không ở `REJECTED`/`CANCELLED`; mỗi biến thể chỉ được cộng kho trả một lần cho một đơn |
| BR3 | Năm lý do cố định: `SIZE_MISMATCH`, `NOT_AS_EXPECTED`, `DEFECTIVE`, `WRONG_ITEM`, `CHANGED_MIND` |
| BR4 | Ảnh 0–3, đi qua module uploads với mục đích `return` |
| BR5 | Số tài khoản không bao giờ trả về cho khách sau khi gửi, không ghi vào log |

### Tiêu chí chấp nhận
- **AC1** (thuận) Đơn `DELIVERED` trong hạn: gửi 1 món, lý do cỡ không vừa, không ảnh → 201, yêu cầu `REQUESTED`; đơn và kho không đổi
- **AC2** (biên) Giao đúng 15 ngày trước thì vẫn gửi được; quá hạn thì 409
- **AC3** (âm) Đơn `PROCESSING`, `CANCELLED` hoặc của khách khác: không gửi được
- **AC4** (âm) Yêu cầu thứ hai cho cùng đơn khi yêu cầu đầu chưa bị từ chối hay huỷ: 409; sau khi yêu cầu đầu bị từ chối thì gửi được
- **AC5** (âm) Trả nhiều hơn số đã mua, hoặc món không thuộc đơn: 400
- **AC6** (âm) Lý do lỗi/hư không có ảnh: 400; có 1 ảnh thì 201
- **AC7** (âm) Đơn COD không có tài khoản nhận: 400; có đủ thì 201, nhưng `GET` của khách không trả số tài khoản
- **AC8** (thuận) Khách huỷ khi `REQUESTED` → `CANCELLED`; khi đã `APPROVED` thì 409
- **AC9** (thuận) Trang đơn chỉ hiện nút khi đủ điều kiện; form hiện điều kiện và phí gửi trả trước khi gửi

---

## UC-14.2 · Duyệt và xử lý trả hàng

### Câu chuyện người dùng
Là một **quản trị viên**, tôi muốn **duyệt yêu cầu trả, ghi nhận hàng về và hoàn tiền trong một màn hình**, để **kho và sổ tiền khớp mà không phải sửa tay**.

### Điều kiện trước
- Người dùng có vai trò `ADMIN`; yêu cầu ở trạng thái đúng cho từng thao tác.

### Điều kiện sau
- Duyệt hoặc từ chối: ghi người quyết, thời điểm, ghi chú. Nhận hàng: kho tăng đúng số lượng trả. Hoàn tiền: có `refunds` + `refund_items`, đơn `PARTIALLY_REFUNDED` hoặc `REFUNDED`, tài khoản nhận của khách bị xoá.

### Luồng chính
| Bước | Quản trị viên | Hệ thống |
|---|---|---|
| 1 | Mở "Trả hàng", lọc `REQUESTED` | Danh sách cũ nhất trước, kèm đơn, lý do, số ảnh |
| 2 | Xem chi tiết, ảnh | Hiện món, số lượng, số tiền dự kiến hoàn, cách hoàn |
| 3 | Duyệt, hoặc từ chối kèm lý do | `APPROVED` hoặc `REJECTED`; khách thấy lý do |
| 4 | Hàng về kho: bấm "Đã nhận hàng" | Dưới khoá đơn: ghi `RETURN` cho từng món, kho tăng; `RECEIVED` |
| 5 | Bấm "Hoàn tiền" | Online: gọi `refundPayment` với số tiền các món trả. COD: nhập mã chuyển khoản. Ghi `refunds`, `refund_items`; `COMPLETED`; xoá tài khoản nhận |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Thao tác sai trạng thái (nhận hàng khi chưa duyệt, hoàn khi chưa nhận) | 409 |
| E2 | Từ chối không có lý do | 400 |
| E3 | Cổng không xác nhận hoàn (timeout, mã lạ) | Yêu cầu giữ `RECEIVED`; lệnh hoàn chờ `ADMIN` chốt như [UC-14.3](../payments/use-cases.md) |
| E4 | Đơn COD hoàn mà thiếu mã chuyển khoản | 400 |
| E5 | Hai `ADMIN` bấm "Đã nhận hàng" cùng lúc | Chỉ một lần cộng kho; lần sau 409 |
| E6 | Không phải `ADMIN` | 403 |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Tiền hoàn = đơn giá lúc mua × số lượng trả của từng món; phí giao gốc chỉ hoàn khi trả cả đơn vì lỗi của shop |
| BR2 | Hoàn online theo luật của UC-14.3; sổ cổng vẫn ở `payment_transactions` |
| BR3 | Nhận hàng và cộng kho cùng một transaction, có khoá đơn |
| BR4 | Tài khoản nhận của khách xoá trong cùng transaction chuyển `COMPLETED` |

### Tiêu chí chấp nhận
- **AC1** (thuận) Duyệt `REQUESTED` → `APPROVED`, ghi người duyệt và thời điểm
- **AC2** (âm) Từ chối không lý do: 400; có lý do → `REJECTED`, khách thấy lý do
- **AC3** (thuận) "Đã nhận hàng" từ `APPROVED`: kho từng biến thể tăng đúng số lượng trả, có một dòng `RETURN` mỗi biến thể; `RECEIVED`
- **AC4** (biên) Bấm "Đã nhận hàng" hai lần hoặc đồng thời: kho chỉ tăng một lần
- **AC5** (thuận) Hoàn đơn online (cổng giả): đúng số tiền các món trả, đơn `PARTIALLY_REFUNDED` khi trả một phần, `REFUNDED` khi trả hết; `COMPLETED`
- **AC6** (thuận) Hoàn đơn COD kèm mã chuyển khoản: `refunds.external_refund_id` là mã đó; tài khoản nhận bị xoá
- **AC7** (âm) Thao tác sai thứ tự (hoàn khi chưa nhận, nhận khi chưa duyệt): 409, không đổi kho hay tiền
- **AC8** (âm) Người không phải `ADMIN` gọi API quản trị trả hàng: 403
