---
title: UC-07 Đặt hàng và UC-12 Xử lý đơn — đặc tả use case
updated: 2026-11-05
status: đề xuất, chờ Bảo duyệt
owner: Bảo
---
# UC-07 · Đặt hàng, UC-12 · Xử lý đơn

**Chức năng:** Khách đặt, theo dõi, hủy đơn và quản trị viên xác nhận, giao đơn: luồng, ngoại lệ, luật nghiệp vụ, tiêu chí chấp nhận có phân loại.

| | |
|---|---|
| **Người viết đặc tả** | Bảo, 05/11, viết ngược từ mã PH-11 và bài kiểm thử đang chạy; mã use case theo danh mục của Duy ở [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26) (`46a238c`, đóng chưa gộp ngày 05/11) |
| **Người sở hữu mã** | Bảo, module `checkout` (điều phối `orders`, `payments`, `inventory`, `cart`) |
| **Dòng việc** | **PH-11** làm UC-07.1, UC-07.3, UC-07.4, UC-12.1 (phần nghiệp vụ; phần điều hướng thuộc Issue #61 của Tài), UC-12.2. UC-07.2 (mã giảm giá) thuộc PH-10 của Duy |
| **Tác nhân** | Khách hàng (đã đăng nhập), Quản trị viên (`ADMIN`) |
| **Dữ liệu** | `orders`, `order_items`, `order_status_history`, `reservations`, `stock_movements`, `payments` qua public service từng module ([README](README.md) mục Ranh giới ghi dữ liệu) |

Cách đọc: mỗi AC mang loại `thuận`, `âm` hoặc `biên` ([LOG#adr-047](../../LOG.md#adr-047)). Bài nào kiểm AC nào **không ghi tay ở đây**: chạy `npm run evidence:trace -- --uc UC-07,UC-12` để sinh ma trận từ tên bài. Thanh toán trực tuyến và hoàn tiền ở [payments/use-cases.md](../payments/use-cases.md).

---

## UC-07.1 · Tạo đơn đặt hàng

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **xác nhận các món đã chọn trong giỏ với địa chỉ và cách trả tiền**, để **shop giữ hàng và giao cho tôi**.

### Điều kiện trước
- Đã đăng nhập; giỏ có ít nhất một món được chọn và còn tồn khả dụng.

### Điều kiện sau
- Thành công: một đơn mới với snapshot giá, hàng được giữ (trả trước 15 phút, COD 3 ngày), một payment intent. Đơn trả trước `PENDING_PAYMENT`, đơn COD `PENDING_CONFIRMATION`.
- Thất bại: không còn đơn, hold hay payment dở dang.

### Luồng chính
| Bước | Khách hàng | Hệ thống |
|---|---|---|
| 1 | Bấm "Tiến hành đặt hàng" ở giỏ | Mở `/thanh-toan`, gọi preview: món đã chọn, giá hiện tại, tồn khả dụng, phí ship, các phương thức dùng được |
| 2 | Chọn địa chỉ (chưa có thì thêm tại chỗ) và phương thức COD, VNPAY hoặc MoMo | Preview lại theo địa chỉ; phương thức bị tắt vẫn hiện kèm lý do |
| 3 | Bấm xác nhận | Đọc lại quote; khớp thì trong một transaction tạo đơn, giữ hàng, tạo payment |
| 4 | | COD: mở trang đơn "Chờ xử lý". Trả trước: sang UC-08.1 ở [payments/use-cases.md](../payments/use-cases.md) |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Chưa đăng nhập | 401; web chuyển trang đăng nhập |
| E2 | Không có món nào được chọn đủ tồn | 409 "Chọn sản phẩm đủ tồn kho trong giỏ trước khi thanh toán."; web dẫn về giỏ |
| E3 | Địa chỉ thuộc xã chưa có biểu phí | 422 "Địa chỉ này chưa có biểu phí giao hàng." ([shipping.service.ts:24](../../../apps/api/src/modules/shipping/shipping.service.ts#L24)) |
| E4 | Giá, giỏ hoặc địa chỉ đổi sau preview | 409 `QUOTE_CHANGED` |
| E5 | Còn một đơn trả trước đang chờ với giỏ khác | 409 `PENDING_ORDER_EXISTS` kèm mã đơn |
| E6 | COD bị tắt theo BR4 | 409 `COD_UNAVAILABLE` kèm lý do |
| E7 | Quá giới hạn tần suất | 429 kèm `Retry-After` |
| E8 | Mã idempotency đã dùng cho nội dung khác | 409 "Mã yêu cầu đã sử dụng cho nội dung khác." |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Giá và phí ship tính ở máy chủ; giá gửi từ client bị bỏ qua |
| BR2 | Phí ship 30.000đ, miễn khi tiền hàng sau giảm giá từ 500.000đ. Giảm giá bằng 0 tới khi có PH-10 |
| BR3 | Mỗi khách tối đa một đơn trả trước đang chờ thanh toán ([checkout.service.ts:198](../../../apps/api/src/modules/checkout/checkout.service.ts#L198)) |
| BR4 | COD tắt khi tổng vượt `COD_MAX_AMOUNT` (2.000.000đ), khách có từ `COD_MAX_FAILED_DELIVERIES` (2) lần giao thất bại, hoặc đã có `COD_MAX_PENDING_ORDERS` (3) đơn COD chờ xác nhận ([ADR-040](../../LOG.md#adr-040)) |
| BR5 | Cùng mã idempotency trả cùng đơn; gửi lại đúng giỏ của đơn đang chờ với mã mới cũng trả đơn đó |
| BR6 | Tối đa 10 lần tạo đơn mỗi phút mỗi tài khoản; kho đếm (Redis) lỗi thì cho qua |

### Đường dẫn API
`POST /api/checkout/preview`, `POST /api/checkout/orders`. Hình dạng ở Swagger `/api/docs`.

### Tiêu chí chấp nhận
- **AC1** (thuận) Preview không giữ hàng; ship 30.000đ, giảm giá 0, miễn ship khi tiền hàng từ 500.000đ
- **AC2** (âm) Chưa đăng nhập trả 401; địa chỉ của người khác hoặc ID sai định dạng bị từ chối; giá gửi từ client không được dùng
- **AC3** (âm) Quote đổi giữa preview và xác nhận trả 409 `QUOTE_CHANGED`, không để lại đơn, hold, payment; web tải quote mới và chờ khách xác nhận lại
- **AC4** (biên) 8 request đồng thời cùng mã idempotency tạo đúng 1 đơn, 1 hold, 1 payment
- **AC5** (biên) Nhiều khách tranh đơn vị cuối của một SKU: chỉ đúng số tồn được giữ, không bán vượt (T-M1)
- **AC6** (âm) Còn đơn trả trước đang chờ: giỏ khác trả 409 `PENDING_ORDER_EXISTS`, preview chỉ sang đơn đó; hủy đơn đó rồi đặt được
- **AC7** (thuận) Đơn COD ở `PENDING_CONFIRMATION`, không có link cổng, giữ hàng dài hạn; gửi lại cùng giỏ trả cùng đơn
- **AC8** (thuận) COD luôn có trong preview, dùng được cả khi chưa cấu hình cổng trực tuyến
- **AC9** (biên) Đơn COD chờ xác nhận không chặn đơn mới; tới `COD_MAX_PENDING_ORDERS` (3) đơn chờ thì COD tắt
- **AC10** (âm) Khách đủ 2 lần giao thất bại: COD tắt kèm lý do, cố tạo đơn COD trả 409
- **AC11** (biên) Đơn vượt trần COD (mặc định 2.000.000đ) chỉ nhận trả trước
- **AC12** (biên) Lần tạo đơn thứ 11 trong một phút trả 429 kèm `Retry-After`, không tạo gì; kho đếm lỗi thì không chặn mua
- **AC13** (âm) Địa chỉ chưa có biểu phí: API trả 422, trang thanh toán hiện đúng lý do đó, không báo "chưa chọn sản phẩm"
- **AC14** (thuận) Chưa có địa chỉ thì mở sẵn form thêm tại chỗ, không gọi preview; lưu xong tự chọn địa chỉ mới
- **AC15** (âm) Giỏ chưa chọn món thì trang thanh toán dẫn về giỏ thay vì báo lỗi
- **AC16** (thuận) Qua trình duyệt: khách thêm hàng, chọn COD, xác nhận và tới trang đơn "Chờ xử lý"

---

## UC-07.3 · Theo dõi trạng thái đơn hàng

Là một **khách hàng**, tôi muốn **xem các đơn của mình và trạng thái hiện tại**, để **biết đơn đang ở đâu và còn phải làm gì**. Đường dẫn: `GET /api/orders`, `GET /api/orders/:id`, `GET /api/orders/by-payment/:reference`; web `/tai-khoan/don-hang`, `/don-hang/:id`.

| Mã | Quy tắc |
|---|---|
| BR1 | Chỉ đọc đơn của chính tài khoản; đơn người khác trả như không tồn tại |
| BR2 | Trang đơn chỉ hiện thao tác hợp lệ với trạng thái; đối soát thanh toán do hệ thống tự làm, không có nút kiểm tra tay |

### Tiêu chí chấp nhận
- **AC1** (thuận) Danh sách đơn: mỗi thẻ có mã, nhãn trạng thái ngắn, tổng tiền; danh sách rỗng mời mua sắm
- **AC2** (âm) Đọc đơn của tài khoản khác bị từ chối như không tồn tại
- **AC3** (thuận) Đơn chờ thanh toán chỉ có nút tiếp tục hoặc thử lại và hủy; không trạng thái nào có nút kiểm tra thanh toán tay
- **AC4** (biên) Đồng hồ đếm theo hạn link cổng, kết thúc sớm hơn hạn giữ hàng
- **AC5** (âm) Tiền đến muộn (`PAYMENT_REVIEW`): trang hiện hướng xử lý, không cho thanh toán lại
- **AC6** (thuận) Đơn COD sau khi shop ghi đã giao: khách tải lại thấy "Đã giao hàng"

---

## UC-07.4 · Hủy đơn hàng trước giao

Là một **khách hàng**, tôi muốn **hủy đơn khi shop chưa xử lý**, để **lấy lại tiền hoặc đặt lại giỏ khác**. Đường dẫn: `POST /api/orders/:id/cancel`. Luật hủy đơn đã trả: [ADR-038](../../LOG.md#adr-038).

| Mã | Quy tắc |
|---|---|
| BR1 | Hủy được khi đơn `PENDING_PAYMENT`, `PENDING_CONFIRMATION`, hoặc `CONFIRMED` mà shop chưa bấm "Bắt đầu xử lý" |
| BR2 | Hủy trả hàng về kho đúng một lần và chọn lại các món trong giỏ |
| BR3 | Đơn đã trả: hoàn toàn bộ tự động; cổng không xác nhận thì đơn vẫn hủy, lệnh hoàn chờ quản trị viên chốt |

### Tiêu chí chấp nhận
- **AC1** (thuận) Hủy đơn chờ thanh toán nhả hold; tiền về sau khi hủy vào `PAYMENT_REVIEW`, không bán
- **AC2** (biên) Hủy đơn đang giữ đơn vị cuối: món được chọn lại trong giỏ và đặt lại được ngay
- **AC3** (thuận) Hủy đơn COD chưa xác nhận: hàng về kho, đặt lại được
- **AC4** (thuận) Đơn trả trước đã thanh toán, shop chưa xử lý: hủy làm hàng về kho một lần, hoàn toàn bộ, đơn `CANCELLED` rồi `REFUNDED`; web hiện số đã hoàn
- **AC5** (âm) Cổng không xác nhận hoàn: đơn vẫn hủy, lệnh hoàn chờ quản trị viên, bấm lại không hoàn lần hai; web báo đang xử lý, không mời đặt lại
- **AC6** (âm) Shop đã bắt đầu xử lý hoặc đã xác nhận COD: khách hủy bị 409, trang không còn nút hủy
- **AC7** (thuận) Hủy phải qua hộp xác nhận; bấm "Hủy" trong hộp thì không gửi request

---

## UC-12.1 · Tiếp nhận và xác nhận đơn — phần nghiệp vụ

Phần điều hướng danh sách (AC1–AC6) do Tài đặc tả ở [orders/use-cases.md](../orders/use-cases.md); phần này đánh số tiếp từ AC7 để mã không trùng.

Là một **quản trị viên**, tôi muốn **xem đơn cần xử lý và xác nhận đơn COD**, để **chốt hàng trước khi giao**. Đường dẫn: `GET /api/admin/orders`, `GET /api/admin/orders/:id`, `POST /api/admin/orders/:id/confirm-cod`, `POST /api/admin/orders/:id/start-processing`; web `/admin/orders`.

| Mã | Quy tắc |
|---|---|
| BR1 | Chỉ vai trò `ADMIN`; web nhận 403 thì ẩn dữ liệu khách và dọn cache quản trị |
| BR2 | Bước chuyển trạng thái kiểm theo trạng thái nguồn, ghi lịch sử kèm người thao tác ([orders.service.ts](../../../apps/api/src/modules/orders/orders.service.ts)) |
| BR3 | Xác nhận COD chốt kho, trừ giỏ và tắt tự hủy; sau đó khách không tự hủy |
| BR4 | Thao tác không tự gửi lại; kết quả chưa rõ thì đọc lại đơn trước khi cho thao tác tiếp ([ADR-039](../../LOG.md#adr-039)) |

### Tiêu chí chấp nhận
- **AC7** (thuận) Danh sách mọi khách, lọc nhiều trạng thái, tìm theo mã đơn; web mặc định tab "Cần xử lý"
- **AC8** (âm) Khách thường gọi API quản trị đơn nhận 403; web nhận 403 thì ẩn dữ liệu khách
- **AC9** (thuận) Xác nhận COD: đơn `PROCESSING`, kho chốt, giỏ trừ đúng lượng, hết tự hủy
- **AC10** (âm) Bước chuyển không hợp lệ trả 409 và không ghi lịch sử; web giữ câu nghiệp vụ của máy chủ và tải lại đơn
- **AC11** (biên) Bấm xác nhận liên tiếp chỉ gửi một POST; POST quá hạn không tự gửi lại, chặn thao tác tới khi đọc lại đơn thành công

---

## UC-12.2 · Đóng gói và giao vận chuyển

Là một **quản trị viên**, tôi muốn **ghi kết quả giao đơn COD**, để **đơn, kho và tiền khớp với thực tế**. Đường dẫn: `POST /api/admin/orders/:id/delivered`, `POST /api/admin/orders/:id/delivery-failed`.

### Tiêu chí chấp nhận
- **AC1** (thuận) Ghi đã giao: đơn `DELIVERED`, payment COD `SUCCEEDED`
- **AC2** (biên) Ghi đã giao lần hai trả 409, không đổi dữ liệu
- **AC3** (âm) Giao thất bại bắt buộc lý do; hàng về kho đúng một lần, payment `FAILED`, đơn `CANCELLED`, tính vào BR4 của UC-07.1

---

## Câu hỏi còn treo

| Câu hỏi | Đề xuất | Ai chốt |
|---|---|---|
| Danh mục chung `use-case-index.md` lấy bộ số của PR #26 hay bộ khác? | Giữ bộ số PR #26; tệp này chỉ dùng các mã đó | Duy |
| UC-12.2 có cần vận đơn thật (UC-09) không? | Chưa; COD ghi kết quả tay, vận chuyển là việc sau | Duy và Bảo |
