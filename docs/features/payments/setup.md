---
title: Cấu hình VNPAY và MoMo qua HTTPS tunnel
updated: 2026-10-18
status: hướng dẫn; VNPAY ưu tiên, MoMo để sau
owner: Bảo
---
# Cấu hình VNPAY và MoMo qua HTTPS tunnel

**Chức năng:** Mở HTTPS cho shop local, đăng ký merchant thử nghiệm, thêm key và nghiệm thu hai cổng.

## Mở shop local ra HTTPS

Chạy tại gốc repo, mỗi lệnh trong một terminal:

```bash
npm run dev:api
npm run dev:web
npm run payment:tunnel
```

Nếu API/web đã chạy thì giữ nguyên; không mở thêm process trùng port. Sau khi tunnel cập nhật `.env`, dừng API bằng `Ctrl+C` ở terminal của API rồi chạy lại `npm run dev:api`. Vite tự đọc lại cấu hình. Không mở port router.

```bash
npm run payment:tunnel:status
npm run payment:tunnel:stop
```

Status in `websiteUrl`, `returnUrl`, `vnpayIpn`, `momoIpn`; không in secret. Dùng **URL do status hiện tại trả về**, không chép host cũ từ ảnh/chat. Script giữ nguyên key, đặt `VITE_API_URL=/api`, CORS và URL callback trong `.env` ([payment-tunnel.mjs:82](../../../tools/dev/payment-tunnel.mjs#L82)).

Tunnel chuyển HTTPS đến Vite local; Vite proxy `/api` đến API local ([vite.config.ts:26](../../../apps/web/vite.config.ts#L26)). Trình duyệt được chuyển về `returnUrl`; máy chủ gateway gửi kết quả tới IPN. Không điền IPN vào ô URL website.

Giữ tunnel, API, web và máy tính hoạt động suốt phiên thử. Quick Tunnel đổi domain khi tạo lại; chạy status, restart API và cập nhật IPN đã đăng ký bên VNPAY. Theo [Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), Quick Tunnel không hỗ trợ SSE; giao diện tự polling khi stream lỗi ([StorefrontLiveUpdates.tsx:42](../../../apps/web/src/app/StorefrontLiveUpdates.tsx#L42)).

## Đăng ký VNPAY sandbox

Mở [form chính thức](https://sandbox.vnpayment.vn/devreg/) và điền:

| Ô | Nội dung |
|---|---|
| Tên website | `FREYA Fashion Shop` |
| Địa chỉ URL | Giá trị `websiteUrl` của tunnel; có thể thêm `/` cuối |
| Email đăng ký | Email bạn đang truy cập được để nhận cấu hình |
| Mật khẩu / nhập lại | Mật khẩu riêng, đúng yêu cầu form |
| Mã xác nhận | Nhập CAPTCHA đang hiển thị, hết hạn thì tải lại |

Nếu báo “Không đúng định dạng Url”, chọn toàn bộ ô và dán lại URL thuần, không khoảng trắng, dấu backtick hoặc xuống dòng. Kiểm tra trực tiếp validator ngày 18/10 cho thấy URL Quick Tunnel hợp lệ được chấp nhận; dấu cách cuối bị từ chối. Chưa khẳng định server chấp nhận đăng ký khi chưa gửi form thành công.

Theo [PAY chính thức](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html), thông tin kết nối gửi qua email đăng ký. Kiểm tra thư rác; lấy `vnp_TmnCode` và `vnp_HashSecret`, ánh xạ như sau trong `.env` gốc repo:

```dotenv
VNPAY_TMN_CODE=<ma-merchant-duoc-cap>
VNPAY_HASH_SECRET=<secret-duoc-cap>
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_QUERY_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
VNPAY_RETURN_URL=https://<host-tunnel-hien-tai>/thanh-toan/ket-qua
```

Đăng ký giá trị `vnpayIpn` trong cấu hình merchant hoặc theo hướng dẫn email/hỗ trợ VNPAY. Đây là cấu hình **bên VNPAY**, không có biến `VNPAY_IPN_URL` để tự đăng ký thay. Return URL đã được script đặt trong `.env`; giữ host đang chạy. IPN yêu cầu HTTPS và nhận GET server-to-server theo tài liệu PAY.

## Đăng ký MoMo Test

1. Mở [MoMo for Business](https://business.momo.vn), chọn **Đăng ký**. Điền thông tin tài khoản và hồ sơ được yêu cầu. [Quy trình chính thức](https://developers.momo.vn/v3/vi/docs/payment/onboarding/merchant-profile/) nêu sau đăng ký thành công có quyền truy cập môi trường Test; Production cần xác thực doanh nghiệp và UAT.
2. Đăng nhập, mở [nơi lấy mã do MoMo dẫn](https://business.momo.vn/sanpham/portal/payment-integration-center), chọn môi trường **Test**, lấy **Partner Code**, **Access Key**, **Secret Key**. Giao diện sau đăng nhập chưa được kiểm chứng; tên menu có thể thay đổi. [Tài liệu tích hợp](https://developers.momo.vn/v3/vi/docs/payment/onboarding/integration-process/) phân biệt bộ mã theo môi trường.
3. Nếu form yêu cầu hồ sơ pháp lý bạn chưa có, liên hệ hỗ trợ MoMo để xin phương án sandbox cho đồ án: `merchant.care@momo.vn`. Chưa xác minh có luồng tự đăng ký dành riêng cho sinh viên.
4. Thêm ba mã vào `.env`; URL đã được tunnel đặt sẵn:

```dotenv
MOMO_PARTNER_CODE=<partner-code-Test>
MOMO_ACCESS_KEY=<access-key-Test>
MOMO_SECRET_KEY=<secret-key-Test>
MOMO_API_URL=https://test-payment.momo.vn/v2/gateway/api
MOMO_RETURN_URL=https://<host-tunnel-hien-tai>/thanh-toan/ket-qua
MOMO_IPN_URL=https://<host-tunnel-hien-tai>/api/payments/momo/ipn
```

Adapter dùng `captureWallet`, `autoCapture=true`; gửi redirect/IPN URL trong request tạo giao dịch ([momo.adapter.ts:115](../../../apps/api/src/modules/payments/momo.adapter.ts#L115)). Không cần Public Key cho luồng này. Nếu portal yêu cầu khai URL callback, dùng đúng giá trị status.

Để quét QR sandbox, dùng **MoMo Test** theo [hướng dẫn test chính thức](https://developers.momo.vn/v3/vi/docs/payment/onboarding/test-instructions/). Tài khoản merchant và ví thanh toán test là hai vai trò khác nhau. Dùng hướng dẫn hiện hành trên trang, không lấy dữ liệu thẻ đã hết hạn từ ví dụ cũ.

## Sau khi thêm key

Phạm vi hiện tại của Bảo là **VNPAY trước**, MoMo để trống. Chưa cấu hình MoMo thì giao diện ẩn lựa chọn này, không cản trở VNPAY. Phần MoMo phía trên giữ làm hướng dẫn khi mở lại.

Chỉ sửa các dòng tương ứng, giữ DB/mail/JWT và các cấu hình khác. Secret chỉ nằm ở backend; không đổi thành biến `VITE_*`, không gửi chat hoặc commit. Mẫu biến ở [.env.example:50](../../../.env.example#L50); validation ở [env.ts:78](../../../apps/api/src/infra/config/env.ts#L78).

Dừng API đang chạy rồi khởi động lại `npm run dev:api`. Với process nền do agent mở, nhờ agent restart đúng process; không chạy thêm API trùng port hoặc dừng toàn bộ Node trên máy. Chưa có key vẫn xem preview được; gateway chưa cấu hình bị vô hiệu hoá, request cưỡng ép bị rollback.

## Nghiệm thu

Mở **websiteUrl công khai và đăng nhập trên chính địa chỉ đó**. Login localhost không bảo đảm session khi return về domain tunnel. Có địa chỉ giao hàng và tồn kho hợp lệ theo [Checkout](../checkout/README.md#dữ-liệu-và-cấu-hình-cần-dùng); không tự nạp tồn giả vào DB ứng dụng.

Chọn sản phẩm → giỏ hàng → checkout → địa chỉ/ship → để trống khuyến mãi → chọn VNPAY hoặc MoMo → sang trang cổng → dùng phương tiện sandbox → quay về shop. IPN/query đã xác thực mới xác nhận tiền; return URL không tự xác nhận thanh toán ([settlement.service.ts:71](../../../apps/api/src/modules/checkout/settlement.service.ts#L71)).

Đối chiếu đơn `CONFIRMED`, payment `SUCCEEDED`, stock giảm một lần và giỏ chỉ trừ lượng đã mua. Kiểm bỏ ngang, callback lặp, mất IPN rồi đối soát, hết hạn/tiền muộn và thử lại. MoMo timeout giữ đơn chờ kiểm tra, retry dùng lại request gốc, không kéo dài giữ hàng.

VNPAY QueryDR giới hạn truy vấn lặp trong 5 phút ([mã 94](https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/)); app dùng khoảng cách 305 giây. Sau return, app tự yêu cầu đối soát; nếu vừa query trước đó, tiếp tục chờ kết quả mới hoặc IPN, không tạo payment khác do đang chờ.

Thẻ NCB/OTP chỉ dùng sandbox: lấy dữ liệu hiện hành tại [demo chính thức](https://sandbox.vnpayment.vn/apis/vnpay-demo/). PAY/OTP/return HTTPS và QueryDR đã thử với key local trên DB fixture riêng. IPN đã thử replay chữ ký hợp lệ; cần đăng ký endpoint với VNPAY để kiểm chứng server-to-server thực tế.

Fixture HMAC/HTTP loopback chỉ dùng trong test với DB riêng. Chưa có credentials thì chưa thể nghiệm thu tiền trên hai sandbox thật. `PAYMENT_REVIEW` cần shop đối soát/hoàn thủ công; chưa có refund API.
