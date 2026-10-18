---
title: Tài khoản và xác thực — các lớp bảo vệ (PH3.4)
updated: 2026-10-18
status: đang dùng
owner: Tài
---
# Tài khoản và xác thực — các lớp bảo vệ (PH3.4)

**Chức năng:** Giới hạn tốc độ, khoá OTP, phát hiện replay refresh token, `authVersion`, refresh single-flight: cách chạy, cấu hình, kiểm thử, giới hạn.

Quyết định và lý do nằm ở [LOG.md](LOG.md) (ADR-013 đến ADR-017); file này mô tả **hệ thống đang chạy thế nào**.

## Bốn lớp, mỗi lớp giữ trạng thái ở đâu

| Lớp | Trạng thái nằm ở | Vì sao không nằm ở bộ nhớ tiến trình |
|---|---|---|
| Giới hạn tốc độ | Redis (`REDIS_URL`) | Nhiều bản sao API cùng đếm vào một chỗ; tăng số bản sao không làm giới hạn lỏng đi |
| Khoá phát hành OTP | Postgres (khoá advisory theo transaction) | Dữ liệu OTP vốn ở Postgres; khoá tự nhả khi commit/rollback |
| Phát hiện replay refresh token | Postgres (`refresh_tokens`) | Không cần Redis nên Redis chết không làm mất khả năng phát hiện replay |
| Vô hiệu access token cũ | Postgres (`users.auth_version`) | Bền vững qua khởi động lại, không cần danh sách đen từng token |

Không có Map/bộ đếm trong tiến trình làm cơ chế cưỡng chế. Thứ duy nhất giữ theo từng bản sao là mốc
thời gian để **giảm tần suất ghi log** khi Redis lỗi — không ảnh hưởng quyết định nào.

## Giới hạn tốc độ

### Kiến trúc

```
AuthController (@Ip)  ->  AuthService  ->  AuthRateLimitService  ->  RateLimiter (abstract)  ->  RedisRateLimiter -> Redis
                                            chính sách + khoá HMAC     infra/, không biết nghiệp vụ
```

- `infra/redis/redis.module.ts`: một client `ioredis` dùng chung. Không xếp hàng lệnh ngoại tuyến,
  lệnh chờ tối đa 1 giây; **đã đo**: cổng đóng thì lệnh bị từ chối sau 0 ms, nên Redis chết không làm
  request bị treo. Khởi động chờ Redis tối đa ~2 giây rồi vẫn lên (không sập vì Redis).
- `infra/rate-limit/redis-rate-limiter.ts`: bộ đếm **cửa sổ cố định**, một script Lua nguyên tử
  (`INCR` + đặt TTL + tự chữa nếu khoá mất TTL). **Đếm trước, kiểm sau**: `N` request song song chỉ có
  đúng `limit` request đầu được đi tiếp (đã test: 100 song song, limit 10 → đúng 10 được phép).
- `modules/auth/rate-limit.policy.ts`: **một chỗ duy nhất** khai báo mọi con số.
- `modules/auth/auth-rate-limit.service.ts`: ghép chính sách với `RateLimiter`, chỉ nơi này đặt khoá.

Nhược điểm cửa sổ cố định (chấp nhận): sát ranh giới hai cửa sổ có thể lọt tối đa gấp đôi giới hạn.

### Chính sách

| Endpoint | Theo danh tính | Theo IP | Khi Redis lỗi |
|---|---|---|---|
| `POST /auth/login` | 5 / 15 phút (đếm mọi lần thử, thành công thì xoá → thực chất "5 lần sai") | 50 / 15 phút | **mở** |
| `POST /auth/register` | — | 10 / 60 phút | **chặn (503)** |
| `POST /auth/resend-verification` | 3 / 15 phút | 30 / 15 phút | **chặn (503)** |
| `POST /auth/forgot-password` | 3 / 15 phút | 30 / 15 phút | **chặn (503)** |
| `POST /auth/verify-email` | — | 30 / 15 phút | mở |
| `POST /auth/reset-password` | — | 30 / 15 phút | mở |
| `POST /auth/change-password` | 5 / 15 phút theo `userId` (xoá khi chứng minh đúng mật khẩu hiện tại) | — | mở |
| `POST /auth/refresh` | không dùng giới hạn tốc độ: **phát hiện replay** thay thế | | không dùng Redis |
| `POST /auth/logout` | idempotent, không giới hạn | | |

Các chốt chặn có sẵn **vẫn giữ nguyên**, bảng này không thay thế chúng: tối đa 5 lần nhập sai trên mỗi
OTP (`otp_codes.attempt_count`), cooldown 60 giây của OTP, bcrypt chi phí 12.

### Khi Redis lỗi: mở hay chặn

- **Chặn (503)** cho endpoint gửi email tới *địa chỉ của người khác* mà không còn ranh giới nào giữa
  các danh tính: register, resend, forgot. Mở cửa lúc Redis chết là mở cửa cho spam/mail-bombing.
  Khách hàng hiện có không bị ảnh hưởng (login vẫn chạy).
- **Mở** cho login (Redis chết mà chặn thì không ai đăng nhập được; bcrypt vẫn làm chậm kẻ tấn công),
  verify-email/reset-password (chốt thật là 5 lần sai mỗi OTP trong Postgres, giới hạn này chỉ là trần
  khối lượng), change-password (cần access token hợp lệ).
- 503 chỉ nói "dịch vụ tạm thời không khả dụng", không nhắc Redis hay giới hạn. Lỗi kho được log **một
  lần mỗi 30 giây mỗi bản sao**, chỉ ghi tên endpoint và hành động, không ghi khoá/IP/danh tính.
- Đổi hành vi một endpoint: sửa `onStoreError` trong `rate-limit.policy.ts`; bài test
  `auth-rate-limit.service.spec.ts` sẽ báo nếu một endpoint gửi email thoát khỏi nhóm "chặn".

### Riêng tư của khoá

Khoá Redis có dạng `fs:rl:<NODE_ENV>:<ENDPOINT>:<ip|id>:<64 hex>`, phần hex là
`HMAC-SHA256(RATE_LIMIT_PEPPER, "<phạm vi>:<giá trị chuẩn hoá>")`. **Không** có email, `userId` hay IP
thô trong khoá (có test quét toàn bộ khoá Redis sau khi gọi API). Email chuẩn hoá trước khi băm nên
`A@x.com` và ` a@X.com ` cùng một xô. Tiền tố theo `NODE_ENV` để test và dev dùng chung một Redis mà
không đụng nhau; dọn khoá test chỉ xoá `fs:rl:test:*`.

### Phản hồi 429

`429` + mã `RATE_LIMITED` + header `Retry-After` (giây còn lại của cửa sổ). Thân phản hồi giống hệt
mọi lỗi khác (`statusCode/code/message/path/timestamp`), không có số lần còn lại. Với login,
forgot-password và resend-verification, bộ đếm chạy **trước** khi tra cứu tài khoản và tính cả email
không tồn tại, nên chuỗi phản hồi của email thật và email giả **giống hệt nhau**, kể cả lúc bị chặn.

### IP khách và proxy

`req.ip` do Express tính. Mặc định (`TRUST_PROXY_HOPS=0`) header `X-Forwarded-For` **bị bỏ qua**, kẻ
tấn công không giả IP được. Sau một proxy tin cậy, đặt `TRUST_PROXY_HOPS` bằng số proxy đó; khi đó chỉ
địa chỉ do proxy tin cậy nối vào (bên phải nhất) được tính, phần bên trái do khách tự khai bị bỏ qua
(đã test cả hai chiều). **Ở staging/production biến này bắt buộc khai báo** — nếu API nằm sau load
balancer mà để 0, mọi người dùng bị tính chung một IP của proxy và giới hạn IP tự làm sập đăng nhập.
Số hop thật của Render chưa được xác minh trong repo (xem giới hạn bên dưới).

## Phát hành OTP nguyên tử

`OtpService.issueIfCooldownElapsed` (dùng cho `resend-verification` và `forgot-password`) lấy
`pg_advisory_xact_lock(hashtextextended(HMAC(otp-issue:<purpose>:<email>), 0))` **trước** khi đọc
cooldown, rồi mới phát hành. Yêu cầu thứ hai của cùng `(email, purpose)` chờ yêu cầu đầu commit, thấy
bản ghi của nó nằm trong cooldown và không phát hành gì. Trước đó cả hai cùng thấy "chưa có OTP" và
người dùng nhận hai mã, hai email. Khoá tự nhả khi commit/rollback (không TTL, không deadlock nếu tiến
trình chết), chạy được nhiều bản sao, và độ đúng của OTP không phụ thuộc Redis. Khoá băm nên email thô
không tới câu lệnh khoá.

Đã kiểm bằng `Promise.all` trên Postgres thật: 2 và 3 forgot-password song song → đúng 1 mã, 1 email;
2 resend song song lúc chưa có mã (5 vòng) → đúng 1 mã; sau cooldown → đúng 1 mã mới và mã cũ bị vô hiệu.
Bỏ dòng khoá thì cả 4 test **fail** (sinh 2–3 mã).

## Refresh token: replay và thu hồi family

Một token đã xoay có `revokedAt` **và** `replacedByTokenId`; token bị logout hoặc đổi mật khẩu thu hồi
chỉ có `revokedAt`. Chỉ với sự khác biệt đó nên **không cần đổi schema**. `AuthService.refresh` phân loại:

| Trường hợp | Kết quả | Thu hồi family? |
|---|---|---|
| Hash không tồn tại (rác) | 401 chung | Không |
| Hết hạn | 401 chung | Không |
| Bị thu hồi bởi logout / đổi / đặt lại mật khẩu | 401 chung | Không |
| Tài khoản không ACTIVE | 401 chung | Không |
| **Token đã xoay bị dùng lại (replay)** | 401 chung | **Có, chỉ family của token đó** |

Token được **chiếm trước** (`updateMany where revokedAt is null`) rồi mới tạo token thay thế. Hai
request song song cùng token: đúng một request chiếm được; request kia chờ hàng, thấy token đã xoay và
coi là replay. Token mới của request thắng nằm cùng family và đã commit nên cũng bị thu hồi — đó là hành
vi mong muốn, vì không phân biệt được ai mới là chủ hợp lệ. Family khác của cùng người dùng không bị
đụng. Mọi trường hợp đều trả cùng một 401 chung; replay chỉ để lại một dòng log `familyId` (UUID ngẫu
nhiên, không phải bí mật), không bao giờ log token hay hash.

Như ở mọi nơi khác, không throw bên trong transaction cho kết quả đã biết trước: việc thu hồi family
phải được lưu dù request thất bại.

Logout thu hồi **cả family** của token được gửi, kể cả token vừa bị xoay, dưới khoá `FOR NO KEY UPDATE`
dòng `users` để xếp hàng với refresh ([ADR-026](LOG.md#adr-026), [session-lifecycle.md](session-lifecycle.md)).

**Đánh đổi chấp nhận:** nếu phản hồi refresh bị mất trên đường (mạng rớt sau khi server đã xoay), lần
thử lại bằng token cũ bị coi là replay và người dùng phải đăng nhập lại.

## Frontend: refresh single-flight

Với phát hiện replay, hai lần refresh song song cùng cookie sẽ khiến **chính frontend tự đăng xuất
mình**. `AuthProvider` ngăn điều đó ở ba mức:

1. **Trong một tab:** chỉ một lời gọi `/auth/refresh` chạy; mọi request 401 khác chờ cùng một promise
   (`refreshInFlight`, cũng đỡ lần chạy hai của React StrictMode).
2. **401 đến muộn:** nếu token hiện tại đã khác token request này gửi đi (request khác đã refresh xong),
   dùng lại token đó thay vì xoay thêm; nếu auth đã bị xoá (refresh thất bại, đăng xuất) thì chỉ báo lỗi,
   không thử refresh nữa. Mỗi request chỉ retry đúng một lần.
3. **Giữa các tab:** các tab cùng gốc dùng chung một cookie, nên khôi phục nhiều tab cùng lúc sẽ tự
   replay nhau. Lời gọi refresh chạy trong khoá `navigator.locks` (Web Locks): tab sau chỉ gửi request khi
   phản hồi của tab trước đã đặt cookie mới. Trình duyệt không có Web Locks vẫn được bảo vệ ở mức 1–2.

Từ [ADR-026](LOG.md#adr-026), single-flight gắn với **epoch** của phiên, cùng khoá đó bọc cả đăng nhập, đăng
xuất và đổi mật khẩu, và kết quả của phiên cũ bị bỏ. Cơ chế và giới hạn ở [session-lifecycle.md](session-lifecycle.md).

Refresh token không bao giờ nằm trong JS (cookie HttpOnly). Test `refresh-single-flight.test.tsx` dùng
một backend giả **mô hình hoá đúng cơ chế xoay + replay**, gồm nhóm đối chứng cho thấy thiếu khoá thì hai
tab thật sự mất phiên.

## Access token: authVersion

Cột `users.auth_version` (`INT NOT NULL DEFAULT 0`). Access JWT mang `{ sub, ver }`; `AuthGuard` (đã
truy vấn user cho mọi request) so `ver` với `auth_version`, lệch thì `401`. Đổi mật khẩu và đặt lại mật
khẩu tăng `auth_version` **trong cùng transaction** với việc đổi hash và thu hồi refresh token, nên mọi
access token cũ chết ngay chứ không sống tới hết TTL. `CurrentUserType` không đổi.

**Tương thích khi triển khai:** JWT cấp trước PH3.4 không có `ver`, được coi là `0`. Mọi user hiện có
đang ở `auth_version = 0`, nên triển khai **không** đăng xuất ai; token cũ chỉ chết khi chủ nhân đổi/đặt
lại mật khẩu. So sánh là `!==` nên `ver` cao hơn hay thấp hơn đều bị từ chối. Đổi/đặt lại thất bại không
làm tăng số phiên bản.

## Nhật ký không chứa email người nhận

Gửi email thất bại **không** làm hỏng request (đăng ký, gửi lại mã, quên mật khẩu vẫn trả phản hồi thường), nên
chỉ được ghi một dòng cảnh báo. Dòng đó không mang địa chỉ người nhận:

- `AuthService` ghi `Gui email … that bai` không kèm email (ba chỗ: đăng ký, gửi lại xác thực, quên mật khẩu).
- `SmtpMailService` ghi `Gui email that bai (code=<mã> responseCode=<số>)`. **Không** ghi `error.message`, vì
  máy chủ SMTP thường lặp lại địa chỉ bị từ chối trong thông báo lỗi (ví dụ `550 <a@b.com> User unknown`).
  `code` chỉ nhận dạng `[A-Z0-9_]{1,32}` (ví dụ `EENVELOPE`, `ECONNECTION`, `EAUTH`), `responseCode` chỉ nhận số
  nguyên; giá trị khác hình dạng đó thành `UNKNOWN` / `-`, nên văn bản tự do không thể lọt vào log qua hai trường này.
- Vẫn ném lại lỗi gốc, hành vi gửi mail và API không đổi.

Cần đối chiếu một lỗi gửi mail với một người dùng cụ thể thì dùng thời điểm log kèm bảng `otp_codes` (không log
định danh). Chưa cần mã tương quan đã băm; nếu sau này cần, dùng HMAC theo cách khoá giới hạn tốc độ đã làm.

## Migration

`20260928120000_ph3_4_user_auth_version`: một câu `ALTER TABLE "users" ADD COLUMN "auth_version" INTEGER
NOT NULL DEFAULT 0`. Postgres 11+ thêm cột với default hằng mà không viết lại bảng; chỉ tiến, không
xoá dữ liệu. Đã áp lên test DB và dev DB, `npm run db:drift -w apps/api` báo "No difference detected".

## Cấu hình

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `REDIS_URL` | có | `redis://` hoặc `rediss://` (TLS). Mật khẩu nằm trong URL, không bị log |
| `RATE_LIMIT_PEPPER` | có | ≥ 32 ký tự, không có default; đổi giá trị thì mọi bộ đếm hiện có mất hiệu lực |
| `TRUST_PROXY_HOPS` | staging/production | Số proxy tin cậy; `0` nếu không có proxy. Local để trống |
| `REDIS_PORT` | không | Cổng **trên máy** cho Docker (mặc định 6379). Máy đã có Redis khác giữ 6379 thì đặt ví dụ 6380 và `REDIS_URL` khớp |

Local: `docker-compose.yml` có dịch vụ `redis` (`redis:7-alpine`, tắt persistence: bộ đếm chỉ là trạng
thái tạm, khởi động lại chỉ làm cửa sổ bắt đầu lại). CI: job `api` có service Redis, job `docker` chạy một
container Redis cùng mạng.

## Kiểm thử

| Lệnh | Phủ |
|---|---|
| `npm run test -w apps/api` | chính sách, khoá riêng tư, mở/chặn, `env`, `token`, khoá OTP (kho giả), log gửi mail thất bại (`SmtpMailService`) |
| `npm run test:http -w apps/api` | **Postgres và Redis thật**: brute-force, IP nguyên tử, giả mạo `X-Forwarded-For`, OTP song song, replay đồng thời, `authVersion`, Redis chết, gửi mail lỗi không lộ email trong log, logout thu hồi family theo hai thứ tự ép buộc |
| `npm run test -w apps/web` | refresh single-flight, khoá Web Locks (kèm nhóm đối chứng), kết quả đến muộn và đổi phiên giữa các tab |

Mỗi cơ chế được **kiểm chứng ngược**: phá riêng nó (bỏ khoá OTP, bỏ thu hồi family, coi replay đồng thời
là lỗi thường, bỏ so sánh `ver`, bỏ single-flight, bỏ khoá Web Locks…) thì đúng các test tương ứng fail.

## Cân nhắc production và giới hạn đã biết

- **Redis là một điểm phụ thuộc.** Chính sách mở/chặn ở trên là giải pháp cho lúc nó chết; cần giám sát
  log `Kho gioi han toc do loi`. Nên dùng Redis có mật khẩu/TLS và không đặt cùng dữ liệu khác.
- **Khoá tài khoản tạm thời bị lạm dụng được:** ai biết email của bạn có thể gửi 5 lần đăng nhập sai để
  chặn đăng nhập vào tài khoản đó 15 phút (đánh đổi của giới hạn theo danh tính). Cách chữa đúng là
  CAPTCHA/2FA, ngoài phạm vi PH3.4.
- **Hạ tầng triển khai chưa theo kịp** (chưa xác minh trong phiên này): `render.yaml` và
  `infra/compose.prod.yml` chưa khai báo `JWT_ACCESS_SECRET`, `OTP_PEPPER`, `SMTP_*` từ PH3, và nay thêm
  `REDIS_URL`, `RATE_LIMIT_PEPPER`, `TRUST_PROXY_HOPS`. Staging cần một Redis (ví dụ Render Key Value) và
  số hop thật của Render phải được xác minh trước khi đặt `TRUST_PROXY_HOPS`.
- Khoá Web Locks cần trình duyệt hỗ trợ; mỗi lời gọi trong khoá bị huỷ sau 15 giây để tab treo không giữ khoá mãi.
- Phản hồi refresh bị mất trên đường buộc đăng nhập lại (đánh đổi của phát hiện replay).
- Cửa sổ cố định cho phép lọt tối đa gấp đôi sát ranh giới cửa sổ.
