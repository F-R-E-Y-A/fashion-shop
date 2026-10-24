---
title: Payments — nhật ký
updated: 2026-10-18
status: đang dùng
owner: Bảo
---
# Payments — nhật ký

**Chức năng:** Lý do và phạm vi thay đổi tích hợp thanh toán.

## 2026-10-18 · PH-11 — một adapter VNPAY, IPN và query dùng chung settlement

**Loại:** thay đổi mã · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Theo uỷ quyền hoàn thiện luồng, dùng VNPAY trước để nghiệm thu một cổng từ đầu tới cuối. SOAP không tăng bảo đảm transaction của ngân hàng; chưa thêm protocol khi không có đối tác/rubric bắt buộc. So sánh phương án ở [ADR-032](../../LOG.md#adr-032).

Giữ Payment và reference bền vững; timeout không đồng nghĩa thất bại. Callback/query chung một settlement có khoá và transaction, không giảm trạng thái SUCCEEDED về FAILED. Bảo chưa có sandbox key, yêu cầu cứ làm và hướng dẫn cấp sau: fake HTTP chỉ trong test, không fallback trên app. [README](README.md) ghi giới hạn refund/đối soát thật.

## 2026-10-18 · PH-11 — MoMo adapter và công cụ HTTPS tunnel

**Loại:** thay đổi mã và cấu hình · **Phạm vi:** Payments, Checkout và web · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Theo yêu cầu Bảo, mở rộng sang hai cổng và chuẩn bị tunnel trước khi lấy merchant key. Strategy/Adapter/Registry giữ protocol riêng bên Payments, dùng chung settlement cho kho/đơn/giỏ. MoMo init intent được lưu trong transaction hiện có; network sau commit để không giữ khoá DB qua thời gian chờ cổng. Phương án và trade-off ở [ADR-033](../../LOG.md#adr-033).

Hướng dẫn [setup](setup.md) thay phần chỉ có VNPAY bằng đăng ký cả hai, cấu hình key/callback, same-origin login và giới hạn Quick Tunnel. Không ghi domain ngắn hạn vào tài liệu như cấu hình cố định. Cổng chưa có key vẫn bị vô hiệu hoá; chưa nghiệm thu gateway thật.

## 2026-10-18 · PH-11 — ưu tiên VNPAY và sửa lịch QueryDR theo sandbox thật

**Loại:** sửa mã và nghiệm thu · **Phạm vi:** Payments, Checkout/web · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Bảo yêu cầu VNPAY trước, MoMo để sau. Key VNPAY đã được nhập local; không đưa vào mã/nhật ký. Checkout ẩn cổng chưa cấu hình, giữ VNPAY để giải thích trạng thái chưa sẵn sàng. Return tự gọi backend đối soát một lần, không chuyển tiền theo query string của trình duyệt. Link trả tiền chỉ lấy attempt mới nhất còn pending.

Thử PAY/NCB/OTP thật trên DB fixture qua HTTPS phát hiện worker một phút gọi sớm khi khách chưa trả tiền, rồi QueryDR trả 94. [Bảng mã VNPAY](https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/) quy định giới hạn 5 phút. Dùng interval theo adapter, VNPAY 305 giây và đợi interval trước query nền đầu; return vẫn chủ động query nếu chưa query lần nào. Không giảm bảo đảm chữ ký để làm demo xanh.

Đã nhận QueryDR chữ ký hợp lệ và ghi CONFIRMED/SUCCEEDED, kho trừ một lần, giữ lượng thêm mới trong giỏ. Replay payload VNPAY ký thật bị nhận diện trùng; tamper bị từ chối. Chưa coi là nghiệm thu IPN do VNPAY chủ động gửi: endpoint vẫn cần đăng ký bên provider. Bằng chứng lệnh/output/SHA ở nhật ký ngoài repo theo quy ước.

## 2026-10-18 · PH-11 — phân biệt kết quả API query với trạng thái giao dịch hủy

**Loại:** sửa mapping gateway · **Phạm vi:** Payments · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

QueryDR của giao dịch hủy thực tế trả ResponseCode=00 (query thành công) và TransactionStatus=11 (giao dịch bị hủy), có HMAC hợp lệ. Bảng 2.5.7.2 trang 36 của [đặc tả chính thức](https://sandbox.vnpayment.vn/apis/files/VNPAY%20Payment%20Gateway_Techspec%20Post%20method%202.1.0-VN.pdf) xác nhận 08 quá thời gian, 11 hủy; 09 là hoàn tiền bị từ chối, không phải thất bại thanh toán. Adapter dùng FAILED cho 02/08/11, giữ 09 và trạng thái chưa rõ ở PENDING để không cho tạo lượt thu tiền mới khi chưa chắc chắn ([vnpay.adapter.ts:40](../../../apps/api/src/modules/payments/vnpay.adapter.ts#L40)).

Thêm [adapter contract tests](../../../apps/api/src/modules/payments/vnpay.adapter.spec.ts) và ca HTTP query-hủy-thử lại cùng deadline. Không dùng ResponseCode trên URL trình duyệt để quyết định trạng thái tiền.
