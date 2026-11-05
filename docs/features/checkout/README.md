---
title: Checkout — luồng PH-11
updated: 2026-11-04
status: ưu tiên VNPAY sandbox, MoMo để sau
owner: Bảo
---
# Checkout

**Chức năng:** Luồng xác nhận mua, ranh giới giữa giỏ/đơn/kho/thanh toán, dữ liệu cần chuẩn bị và cách nghiệm thu.

## Luồng hiện tại

1. Khách phải đăng nhập; chọn địa chỉ thuộc tài khoản và còn hỗ trợ giao hàng. Preview chỉ đọc sản phẩm được chọn, giá hiện tại, tồn khả dụng và phí ship; chưa giữ hàng ([checkout.service.ts:85](../../../apps/api/src/modules/checkout/checkout.service.ts#L85), [checkout-address.service.ts:11](../../../apps/api/src/modules/users/checkout-address.service.ts#L11)).
2. Ô khuyến mãi trống; discount bằng 0. Ship mặc định 30.000đ, miễn từ 500.000đ tiền hàng sau giảm giá. Chưa gọi module của Duy ([shipping.service.ts:11](../../../apps/api/src/modules/shipping/shipping.service.ts#L11)).
3. Mỗi khách chỉ một đơn trả trước đang chờ thanh toán: còn đơn đó mà gửi giỏ khác thì 409 `PENDING_ORDER_EXISTS`; preview trả `pendingOrder` để web dẫn về đơn đó ([checkout.service.ts:198](../../../apps/api/src/modules/checkout/checkout.service.ts#L198)). Đơn COD chờ shop xác nhận không chặn đơn mới; tới `COD_MAX_PENDING_ORDERS` (mặc định 3) đơn thì COD bị tắt kèm lý do như các chặn COD khác ([checkout.service.ts:72](../../../apps/api/src/modules/checkout/checkout.service.ts#L72), [ADR-040](../../LOG.md#adr-040)). Gửi lại đúng giỏ của một đơn đang chờ (online hoặc COD) với key mới thì trả lại đơn đó, không tạo đơn trùng. Đơn chờ đang giữ đơn vị cuối thì giỏ thấy hết hàng; preview khi đó trả 409 `PENDING_ORDER_EXISTS` kèm mã đơn thay vì bảo khách chọn lại giỏ ([checkout.service.ts:157](../../../apps/api/src/modules/checkout/checkout.service.ts#L157)). Chọn VNPAY/MoMo đã cấu hình rồi xác nhận: đọc lại quote; fingerprint đổi trả 409 `QUOTE_CHANGED`. Cùng SQL transaction tạo snapshot đơn, payment intent và giữ hàng 15 phút; link cổng hết hạn sau 12 phút, 3 phút còn lại để chờ IPN/query ([payments.service.ts:45](../../../apps/api/src/modules/payments/payments.service.ts#L45)). VNPAY ký URL local; MoMo gọi HTTP sau commit, lưu request trước để retry giữ nguyên reference. Key lặp trả cùng đơn và gateway; không đổi cổng trên đơn đang chờ ([checkout.service.ts:174](../../../apps/api/src/modules/checkout/checkout.service.ts#L174), [launchLatest:154](../../../apps/api/src/modules/payments/payments.service.ts#L154)).
4. IPN/query đã được adapter xác thực, khớp merchant/reference/amount mới ghi nhận tiền; browser return chỉ tìm đơn thuộc tài khoản. Hold còn hạn: trừ kho, ghi SALE, xác nhận đơn và chỉ trừ lượng mua khỏi giỏ. MoMo 9000 chưa phải thành công cuối ([settlement.service.ts:71](../../../apps/api/src/modules/checkout/settlement.service.ts#L71)).
5. Hủy/hết hạn nhả hold, giữ giỏ và chọn lại các món của đơn: lúc giữ hàng, đọc giỏ thấy hết hàng nên đã bỏ chọn ([cart.service.ts:70](../../../apps/api/src/modules/cart/cart.service.ts#L70)). Thử lại không gia hạn deadline; attempt chưa rõ kết quả được dùng lại. Nhận tiền sau khi nhả hàng hoặc thanh toán hai lần chuyển `PAYMENT_REVIEW`, không trừ kho thêm ([checkout.service.ts:367](../../../apps/api/src/modules/checkout/checkout.service.ts#L367), [settlement.service.ts:70](../../../apps/api/src/modules/checkout/settlement.service.ts#L70)).

Hình dạng HTTP thật ở Swagger `/api/docs`, sinh từ [DTO response](../../../apps/api/src/modules/checkout/dto/checkout.response.ts). Web ở [checkout/index.ts](../../../apps/web/src/features/checkout/index.ts), bắt buộc Auth tại [routes.tsx](../../../apps/web/src/app/routes.tsx). Ba trang theo khung trang giỏ: xác nhận (`/thanh-toan`), kết quả đơn (`/don-hang/:id`, `/thanh-toan/ket-qua`) và danh sách đơn là tab `/tai-khoan/don-hang`; `/don-hang` chuyển hướng về tab đó. Đồng hồ trang đơn dùng `role="timer"` để trình đọc màn hình không đọc mỗi giây.

## Điều hướng quản trị — Issue #61, chờ review

URL Orders dùng codec [order-list-query.ts:18](../../../apps/web/src/features/checkout/admin/order-list-query.ts#L18)
cho tab/q/page đã chuẩn hóa; chỉ query sau canonical. Link chi tiết mang query và dựng đường về danh sách nội bộ,
không dùng return URL tùy ý. Back/Forward đồng bộ draft; trang sau rỗng có link phục hồi, không tự redirect theo total.
Không đổi API, CSS, tiền/kho hoặc mutation. [Đặc tả điều hướng UC-12.1 đề xuất](../orders/use-cases.md),
[quyết định ADR-043](LOG.md#adr-043); Issue #61 tách từ develop `8fe405e`, đã tích hợp shell từ develop `63d9798`.

## Phân chia trách nhiệm

### Bảo vệ phiên của màn quản trị — Issue #57, đã merge PR #58

- `/admin/orders` và chi tiết dùng cùng `useAdminForbidden` với Users qua public index Account;
  403 dọn các resource admin của actor, ẩn dữ liệu khách và ngừng query. Không thay guard backend.
- Query truyền AbortSignal; cache đặt dưới gốc phiên. Đổi tab/q không dùng dòng của tập cũ làm placeholder.
  Đổi epoch tạo lại observer và trạng thái cục bộ, kể cả đăng nhập lại cùng actor.
- [AdminOrderDetailPage.tsx:62](../../../apps/web/src/features/checkout/admin/AdminOrderDetailPage.tsx#L62)
  kiểm epoch/thế hệ quyền ở callback, hủy GET cũ trước khi đọc lại sau POST; không tự retry mutation.
  Chờ POST tối đa 15 giây; timeout/mạng/5xx là kết quả chưa rõ. Nếu GET đối chiếu chưa thành công thì
  chặn thao tác tiếp và cho kiểm lại bằng GET. Không giữ ledger cũ trong hộp sau kết quả không rõ.
- Hồi quy tại [admin-order-races.test.tsx](../../../apps/web/src/features/checkout/admin/admin-order-races.test.tsx)
  và [admin-order-session.test.tsx](../../../apps/web/src/features/checkout/admin/admin-order-session.test.tsx);
  hợp đồng phiên theo UC-01.4/AC6–AC7 và bảo vệ admin dùng chung UC-02.1/AC6, AC8.
  Chưa tự cấp mã use case mới cho luồng quản trị đơn; danh mục còn cần thống nhất với Duy.

### Ranh giới ghi dữ liệu

| Module | Sở hữu việc ghi |
|---|---|
| Cart | Selection và tiêu thụ đúng lượng đã mua |
| Orders | Đơn, dòng hàng, lịch sử trạng thái |
| Inventory | Reservation, số lượng kho, StockMovement |
| Payments | Payment, transaction của gateway, claim query |
| Users / Shipping | Đọc địa chỉ có ownership / tính quote ship |
| Checkout | Điều phối transaction qua các public service; không ghi trực tiếp bảng module khác |

Quyết định liên module: [ADR-032](../../LOG.md#adr-032), [ADR-034](../../LOG.md#adr-034). Hợp đồng: [Orders](../../../apps/api/src/modules/orders/README.md), [Payments](../../../apps/api/src/modules/payments/README.md), [Inventory](../../../apps/api/src/modules/inventory/README.md), [Shipping](../../../apps/api/src/modules/shipping/README.md).

## Dữ liệu và cấu hình cần dùng

- Một migration [PH-11](../../../apps/api/prisma/migrations/20261018090000_ph11_checkout_payment/migration.sql) mở rộng bảng sẵn có: deadline, idempotency, reference, URL, query claim và liên kết SALE với đơn. Không tạo hệ bảng checkout khác.
- Sức tải: `DATABASE_POOL_MAX` (mặc định 10 kết nối mỗi API process; tổng mọi instance phải nhỏ hơn `max_connections`) và `DATABASE_POOL_TIMEOUT_MS` (mặc định 10000 ms, quá hạn thì báo lỗi thay vì treo) ở [env.ts](../../../apps/api/src/infra/config/env.ts). Tạo đơn tối đa 10 lần, tạo lượt thanh toán 20 lần mỗi phút mỗi tài khoản, vượt trả 429 kèm `Retry-After`; Redis lỗi thì cho qua ([checkout-rate-limit.service.ts](../../../apps/api/src/modules/checkout/checkout-rate-limit.service.ts)).
- `npm run db:deploy -w apps/api`, `npm run db:generate`, `npm run db:seed`: triển khai schema và biểu phí cho xã đang hoạt động. Seed không ghi đè rate đã được chỉnh ([shipping.seed.ts](../../../apps/api/prisma/seed/shipping.seed.ts)).
- Tồn thật do chủ kho nạp theo variant bằng `npm run stock:import -w apps/api -- --file=<csv> [--dry-run]` (CSV `sku,quantity`). Không có Inventory thì hiển thị chưa cập nhật tồn; không cho checkout. Không tự suy ra tồn từ sản phẩm crawl. Test dùng fixture riêng, tuyệt đối không chạy suite resetDatabase trên DB ứng dụng.
- Chưa có key: preview được, cổng chưa cấu hình bị vô hiệu hoá; cưỡng ép tạo payment trả 503 và rollback. MoMo đã cấu hình nhưng HTTP timeout: giữ đơn PENDING và hold để query/retry; không coi timeout là chưa thu tiền ([momo.adapter.ts:50](../../../apps/api/src/modules/payments/momo.adapter.ts#L50), [payments.service.ts:154](../../../apps/api/src/modules/payments/payments.service.ts#L154)). [Cấp key và tunnel](../payments/setup.md).

## Nghiệm thu và giới hạn

Tải SKU hot: `npm run test:load -w apps/api` (tham số `LOAD_USERS`, `LOAD_STOCK`, `LOAD_RAMP_MS`, chỉ trên DB test). Số đo và giới hạn hiện tại ở [LOG](LOG.md): đúng đắn giữ ở 1000 khách, độ trễ chưa đạt mục tiêu.

[HTTP VNPAY](../../../apps/api/test/checkout-payment.http.spec.ts) kiểm tranh món cuối, callback lặp, ownership, rollback, retry/expiry và query. [HTTP MoMo](../../../apps/api/test/checkout-momo.http.spec.ts) thêm commit trước network, init timeout/replay, 9000, IPN sai, query thiếu IPN và tiền muộn. [Web tests](../../../apps/web/src/features/checkout/checkout.test.tsx) kiểm chọn gateway, promo trống và không tin return URL. Lệnh/output thật lưu trong nhật ký ngoài kho; có test không đồng nghĩa đã chạy.

Worker chỉ hoạt động khi API đang chạy; khởi động lại quét deadline từ DB. Mỗi tick 30 giây lấy từng lô 50 đơn quá hạn rồi 50 payment cần đối soát cho tới khi hết việc hoặc hết 20 giây; mục lỗi chỉ ghi log id và để tick sau, không chặn mục khác ([settlement.service.ts](../../../apps/api/src/modules/checkout/settlement.service.ts)). Nhiều instance chạy cùng an toàn nhờ khoá đơn và claim payment, chỉ tốn việc trùng. Query tự động xét payment trong 24 giờ; claim theo interval từng cổng: VNPAY 305 giây, MoMo 60 giây. Worker chờ interval trước query đầu, trang return chủ động yêu cầu đối soát ngay nếu attempt chưa query. Query lỗi đường truyền chỉ lùi 30 giây ([settlement.service.ts:124](../../../apps/api/src/modules/checkout/settlement.service.ts#L124)): nghiệm thu 19/10 gặp kết nối đầu tới QueryDR sandbox lỗi sau khoảng 10 giây trong khi lần sau trả kết quả trong 237 ms. Đơn cũ hơn cần đối soát vận hành ([settlement.service.ts:104](../../../apps/api/src/modules/checkout/settlement.service.ts#L104), [payments.service.ts:116](../../../apps/api/src/modules/payments/payments.service.ts#L116), [OrderPage.tsx:59](../../../apps/web/src/features/checkout/OrderPage.tsx#L59)).

Theo phạm vi mới của Bảo, hiện cấu hình VNPAY; checkout ẩn MoMo khi chưa có key. VNPAY PAY/OTP/return và QueryDR có chữ ký đã được nghiệm thu trên HTTPS với DB riêng; IPN thử bằng replay payload hợp lệ, chưa xác minh VNPAY chủ động gọi IPN đã đăng ký. MoMo chưa nghiệm thu cổng thật. Ngày 19/10 chạy trọn luồng trên app với DB clone riêng: khách vãng lai thêm hàng → đăng nhập gộp giỏ → thêm địa chỉ → checkout 79.000đ → VNPAY NCB/OTP → worker QueryDR → `CONFIRMED`, tồn 5→4, một SALE, giỏ trừ đúng món. Tồn nạp bằng `stock:import`.

`PAYMENT_REVIEW` yêu cầu khách không thanh toán lại, liên hệ shop kèm mã đơn; ADMIN hoàn trên màn `/admin/orders` ([payments/README.md](../payments/README.md)), chưa tự động hoàn. Khách tự hủy đơn online đã trả khi shop chưa bấm "Bắt đầu xử lý": hàng về kho, hoàn tiền tự động ([ADR-038](../../LOG.md#adr-038)); từ `PROCESSING` trở đi khách liên hệ shop. SOAP không thuộc luồng cơ bản này.

## Giao diện quản trị — Issue #59, đã merge PR #60

AdminKit áp dụng panel/bảng trắng và nhãn trạng thái; chi tiết đặt sản phẩm/thanh toán/lịch sử bên trái, giao hàng/thao tác bên phải.
Chỉ di chuyển JSX và đổi CSS: actions, ledger, tiền/kho/COD/refund, request và vòng đời phiên giữ nguyên.
Dialog dùng lại ConfirmDialog; URL/Back của Orders nằm trong Issue #61/PR #62, đã ghép trên shell.
PR #58 đã merge tại `8fe405e`, PR #60 được Duy approve và merge tại `63d9798`.
PR #62 vẫn cần CI đúng head tích hợp và review chéo trước merge; không tự coi nghiệp vụ Orders đã được duyệt.
