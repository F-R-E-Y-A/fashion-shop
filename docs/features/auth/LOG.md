---
title: Tài khoản và xác thực — nhật ký quyết định và thay đổi
updated: 2026-09-30
status: đang dùng
owner: Tài
---
# Tài khoản và xác thực — nhật ký (chỉ thêm vào cuối)

Quyết định và thay đổi đáng nhớ của feature này, mới nhất ở cuối. Khuôn một mục: [LOG-entry.md](../../shared/templates/LOG-entry.md). Quyết định chạm cả nhóm ghi ở [docs/LOG.md](../../LOG.md).

---

<a id="adr-010"></a>

## 2026-09-27 · ADR-010 — Xác thực email bằng OTP 6 số, hash HMAC-SHA256 + pepper, MailService trừu tượng

**Loại:** quyết định · **Phạm vi:** `apps/api/src/modules/auth`, `apps/api/src/infra/mail`, `apps/web/src/features/account`, bảng `otp_codes` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

`identity.prisma:2-10` đã có `UserStatus.PENDING_VERIFICATION`; `identity.prisma:12-19` đã có
`OtpPurpose` (`EMAIL_VERIFICATION`, `PASSWORD_RESET`, `GUEST_RETURN_VERIFICATION`);
`identity.prisma:76-93` đã có `OtpCode` (`codeHash`, `attemptCount`, `sendCount`, `expiresAt`,
`consumedAt`), migrated từ `20260924184146_ht02_final_baseline`. Trước PH3.1, `AuthService.register`
tạo user thẳng `ACTIVE` (đã sửa ở PH3.1). Repo chưa có SMTP/Redis/queue nào
(`docker-compose.yml` ghi rõ: phân hệ nào cần dịch vụ gì thì tự thêm cùng PR, [LOG#adr-004](../../LOG.md#adr-004)).

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. OTP 6 số qua email | Khớp `attemptCount`/`sendCount` đã có sẵn trong schema; UX tốt trên mobile, không phụ thuộc trình duyệt mở link | Người dùng phải gõ tay | Có, cùng bảng `otp_codes` |
| B. Link xác thực (token ngẫu nhiên) | Không cần gõ tay | Mở sai trình duyệt/app mail dễ hỏng flow; entropy cao nên không cần pepper nghiêm ngặt như OTP số | Có |
| **A (chọn)** | | | |

**Chọn A** vì `docs/shared/data-model.md:41,82-87` đã đặc tả `otp_codes` theo hướng OTP số kèm
`attempt_count`/`send_count` từ trước PH3.1; đổi sang link sẽ bỏ phí thiết kế đó mà không có lý do
mạnh hơn. Trade-off chấp nhận: OTP 6 số có entropy thấp (10^6), nên bắt buộc hash bằng HMAC-SHA256
với `OTP_PEPPER` (không phải SHA-256 đơn thuần) và giới hạn `attemptCount` để chặn brute-force.

### Quyết định phụ

- **Hash OTP:** `HMAC-SHA256(OTP_PEPPER, email + purpose + code)`, so khớp bằng
  `crypto.timingSafeEqual`. Ràng buộc cả `email` và `purpose` vào hash để một OTP không thể bị dùng
  chéo qua email hay mục đích khác.
- **Resend invalidates old OTP:** thay vì thêm cột mới, resend gọi `OtpCode.updateMany({consumedAt:
  null} -> {consumedAt: now})` trên mọi bản ghi cũ của `(email, purpose)` rồi tạo bản ghi mới. Xác
  định, kiểm thử được, không cần unique constraint (mục X yêu cầu tránh constraint gây khó cho
  lịch sử OTP).
- **Email:** `infra/mail/mail.service.ts` là abstract class chỉ biết `send(message)`; Auth không
  import `nodemailer` trực tiếp. Local dùng Mailpit qua `docker-compose.yml`; test HTTP override
  bằng `FakeMailService` để không bao giờ cần SMTP thật.
- **Index mới:** `otp_codes(email, purpose, consumedAt)` cho truy vấn "OTP đang hoạt động của email
  này" — migration `20260927120000_ph3_1_otp_codes_lookup_index`, không sửa migration cũ.
- **Register không rollback khi gửi email thất bại:** user vẫn `PENDING_VERIFICATION`, OTP vẫn tồn
  tại trong DB, người dùng dùng `resend-verification` để xin mã mới.

### Kết quả mong đợi → thực tế

Mong đợi: `npm run check` xanh; test HTTP mới cho register/verify-email/resend-verification/login
pass mà không gọi SMTP thật; migration mới không sửa migration cũ.
Thực tế: `npm run lint`, `lint:boundaries`, `format:check`, `typecheck`, `test` (unit, không cần DB)
và `build` đã chạy xanh trong phiên triển khai PH3.1 (xem báo cáo triển khai). Test HTTP cần Postgres
thật **chưa chạy được trong môi trường này** (không có Docker/Postgres khả dụng) — cần chạy lại
`npm run db:deploy -w apps/api && npm run db:seed && npm run test:http:cov -w apps/api` ở máy có DB,
hoặc để CI job "api" tự chạy, trước khi coi ADR này là đã kiểm chứng đầy đủ.

### Điều kiện xem lại

Khi làm PASSWORD_RESET hoặc GUEST_RETURN_VERIFICATION: kiểm tra `OtpService` có còn đúng cho các
`OtpPurpose` khác không trước khi thêm logic riêng. Khi có Redis: cân nhắc chuyển resend-cooldown
và rate limiting sang đó thay vì đọc `otp_codes` trực tiếp.

---

<a id="adr-011"></a>

## 2026-09-28 · ADR-011 — Quên/đặt lại mật khẩu chỉ dành cho tài khoản ACTIVE, revoke toàn bộ refresh session

**Loại:** quyết định · **Phạm vi:** `apps/api/src/modules/auth`, `apps/web/src/features/account` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

`OtpService` (`otp.service.ts`) đã trung lập theo `OtpPurpose` từ PH3.1 ([ADR-010](#adr-010)); dùng
được thẳng cho `PASSWORD_RESET` mà không sửa file đó (đã xác nhận: PH3.2 không đụng
`otp.service.ts`). `RefreshToken.revokedAt` và chỉ mục theo `userId` (`identity.prisma:110`) đã đủ để
revoke toàn bộ session của một user trong một câu `updateMany`. Không có migration nào cho PH3.2.

### Phương án: policy theo UserStatus khi forgot-password

| UserStatus | Cấp OTP that? | Vì sao |
|---|---|---|
| **ACTIVE (chọn: có)** | Có | Trường hợp bình thường, mật khẩu thật sự dùng để đăng nhập |
| PENDING_VERIFICATION | Không | Đăng nhập vẫn bị chặn bởi `EMAIL_NOT_VERIFIED` bất kể mật khẩu; lối ra đúng là resend-verification |
| LOCKED / DISABLED | Không | Khóa có chủ đích; tự phục hồi mật khẩu làm mất tác dụng khóa, ngược `login()`/`refresh()` đã chặn |

**Chọn:** chỉ ACTIVE nhận OTP thật; ba trường hợp còn lại nhận cùng response `{ accepted: true }`
như email không tồn tại — tái dùng đúng khuôn chống dò email đã duyệt ở `resend-verification`
([ADR-010](#adr-010)), không phát minh cơ chế mới. Trade-off: một tài khoản PENDING_VERIFICATION có
mật khẩu bị lộ sẽ không tự "chữa" được bằng forgot-password — chấp nhận được vì tài khoản đó vốn
chưa đăng nhập được.

### Quyết định phụ

- **Transaction:** `resetPassword()` giữ đúng kỷ luật đã sửa ở PH3.1 (không throw outcome đã biết
  trước bên trong `$transaction`; map outcome sang lỗi HTTP sau khi commit) — cùng một transaction
  consume OTP, đổi `passwordHash`, và revoke **toàn bộ** refresh token (`userId`, không lọc
  `familyId`) để không có trạng thái nửa vời.
- **Revoke toàn bộ, không chỉ family hiện tại:** vì mục tiêu của reset là vô hiệu mọi phiên cũ, kể
  cả phiên trên thiết bị khác không liên quan tới yêu cầu reset này.
- **Không đóng access token cũ:** JWT truy cập ngắn hạn, không có `jti`/session linkage, nên còn
  sống tới hết TTL riêng — cần access-token blacklist mới đóng hẳn, ngoài phạm vi PH3.2 (mục XVII).
- **Dùng chung decorator OTP:** tách `IsOtpCode` vào `otp-policy.ts`, cả `VerifyEmailRequest` lẫn
  `ResetPasswordRequest` dùng chung, tránh lặp `^\d{6}$` ở hai DTO.

### Kết quả mong đợi → thực tế

Mong đợi: toàn bộ test PH3/PH3.1 cũ tiếp tục xanh; test mới cho forgot/reset-password,
session-revocation và concurrency (reset trùng OTP, sai OTP đồng thời, reset đồng thời resend) pass
trên Postgres thật; `npm run check` xanh; không migration mới.
Thực tế: `npm run check`, `test:http:cov -w apps/api` (71/71, gồm 9 test Products không đổi),
`build -w apps/web` đã chạy xanh trong phiên triển khai PH3.2 trên Postgres + Mailpit thật (xem báo
cáo triển khai). `git diff --stat` xác nhận không có migration mới, không đụng `identity.prisma`.

### Điều kiện xem lại

Khi làm Change Password hoặc access-token blacklist: xem lại giới hạn "access token cũ còn sống tới
TTL" ở trên — có thể cần thiết kế lại cùng lúc với session/device management.

---

<a id="adr-012"></a>

## 2026-09-28 · ADR-012 — Đổi mật khẩu thu hồi mọi refresh session, ghi hash có điều kiện, buộc đăng nhập lại

**Loại:** quyết định · **Phạm vi:** `apps/api/src/modules/auth`, `apps/web/src/features/account`, `apps/web/src/app/StoreLayout.tsx` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

`AuthGuard` (`auth.guard.ts:35-44`) đã truy vấn lại `UserStatus` cho từng request và chặn tài khoản
không ACTIVE bằng `401` chung. `RefreshToken.revokedAt` và chỉ mục `userId` (`identity.prisma`) đủ để
thu hồi mọi session bằng một `updateMany`. Mọi endpoint auth hiện có dùng `POST`. Không cần migration.
`authenticatedRequest()` (`AuthProvider.tsx`) tự refresh-retry mọi lần gặp `401`.

### Phương án

| Quyết định | Chọn | Vì sao / cái giá |
|---|---|---|
| Sau đổi mật khẩu, session cũ | **Thu hồi toàn bộ, buộc login lại** | Mục đích đổi mật khẩu là vô hiệu credential cũ; giữ lại phiên hiện tại sẽ chừa cửa cho kẻ đã có refresh cookie. Giá: người dùng phải đăng nhập lại |
| Chống hai request đổi song song | **`updateMany({ id, passwordHash: <đã đọc> })`** (khoá lạc quan) | Không cần khoá hàng hay Redis; request thua có `count = 0`. Giá: request thua nhận `CURRENT_PASSWORD_INVALID` dù mật khẩu nó gửi từng đúng — chấp nhận, vì lúc ghi nó đúng là đã lỗi thời |
| Mã HTTP khi sai mật khẩu hiện tại | **400** (không 401) | Người gọi đã xác thực (guard đã qua); đây là lỗi dữ liệu nghiệp vụ như `OTP_INVALID`. 401 sẽ khiến `authenticatedRequest()` refresh-retry vô ích |
| Chặn LOCKED/DISABLED/PENDING | **Nhờ `AuthGuard`, không kiểm lại** | Guard đã truy vấn trạng thái hiện tại cho chính request này; kiểm lại chỉ trùng lặp |
| Chặn trang đổi mật khẩu khi chưa đăng nhập | **Kiểm ngay trong trang, không dựng `RequireAuth`** | Repo chưa có kiến trúc route-guard; dựng chung cho một trang là quá tay ([ND-03](../../TECH_DEBT.md)) |

### Quyết định phụ

- Đọc `passwordHash` và chạy bcrypt (`verify` x2, `hash` x1) **ngoài** transaction để không giữ
  transaction mở qua ba phép bcrypt; trong transaction chỉ còn ghi hash + revoke.
- Không throw trong transaction: outcome `STALE`/`CHANGED` trả về, map sang lỗi HTTP sau khi commit,
  cùng kỷ luật [ADR-010](#adr-010)/[ADR-011](#adr-011).
- Xoá `refresh_token` bằng đúng `clearRefreshCookieOptions` của `logout`, không nhân đôi cấu hình cookie.
- `AuthProvider.changePassword()` xoá access token/user ở bộ nhớ khi thành công.

### Kết quả mong đợi → thực tế

Mong đợi: hai request song song cùng mật khẩu hiện tại → đúng một `204`; sau đổi, mật khẩu cũ `401`,
mật khẩu mới `200`, mọi refresh cookie cũ `401`, cookie hiện tại bị xoá.
Thực tế: test HTTP (`describe change-password`, 11 ca) pass trên Postgres thật; test đua chạy lặp 5 lần
đều pass. Kiểm chứng ngược (mutation): bỏ điều kiện `passwordHash` khỏi `updateMany` thì test đua
**fail** với `[204, 204]` (last-write-wins), khôi phục thì pass lại — nghĩa là test thật sự bảo vệ
được điều kiện này, không pass nhờ may mắn về thời gian.

### Giới hạn và điều kiện xem lại

Access token đã cấp trước khi đổi mật khẩu vẫn sống tới hết TTL (mặc định 15 phút) nếu ai đó giữ nó
ngoài trình duyệt, vì chưa có `jti`/session linkage/blacklist; giao diện chỉ xoá token của chính nó.
Xem lại khi làm Security Hardening hoặc session/device management.

---

<a id="adr-013"></a>

## 2026-09-28 · ADR-013 — Giới hạn tốc độ bằng Redis dùng chung, khoá HMAC, mở/chặn theo từng endpoint

**Loại:** quyết định · **Phạm vi:** `apps/api/src/infra/{redis,rate-limit}`, `modules/auth/{rate-limit.policy,auth-rate-limit.service}.ts`, `docker-compose.yml`, CI, `env.ts` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

Trước PH3.4 không có giới hạn nào: repo chưa có Redis, throttler hay thư viện đếm (đã kiểm `package.json`
và `docker-compose.yml`), `AuthService.login` cho thử vô hạn. `docker-compose.yml` ghi rõ phân hệ nào cần
dịch vụ gì thì thêm cùng PR ([ADR-004](../../LOG.md#adr-004)). API chạy được nhiều bản sao (Dockerfile,
`render.yaml`) và staging nằm sau proxy của Render.

### Phương án

| Nơi giữ bộ đếm | Được gì | Mất gì |
|---|---|---|
| Bộ nhớ tiến trình (`Map`) | Không thêm hạ tầng | Mỗi bản sao một bộ đếm: tăng số bản sao là vô hiệu giới hạn; mất khi khởi động lại. **Loại** |
| Bảng Postgres | Không thêm hạ tầng, có sẵn | Mỗi lần đăng nhập thêm một lần ghi, phải dọn hàng hết hạn, khoá hàng nóng dưới tấn công |
| `@nestjs/throttler` | Có sẵn decorator | Đếm theo request, khó "chỉ đếm lần sai, thành công thì xoá", khó khoá HMAC và chính sách mở/chặn riêng |
| **Redis + bộ đếm Lua tự viết (chọn)** | `INCR`+TTL nguyên tử, TTL tự dọn, độ trễ thấp | Thêm một dịch vụ phải vận hành |

**Chọn Redis.** Client `ioredis` 6.0.0 (không bị deprecated; đã xác nhận các option `enableOfflineQueue`,
`commandTimeout`, `retryStrategy` trên bản cài thật). Đếm **trước**, kiểm **sau**, nguyên tử: `N`
request song song chỉ có `limit` request đầu được đi tiếp. Login đếm mọi lần thử và xoá khi thành công,
nên thực chất là "5 lần sai / 15 phút".

### Quyết định phụ

- **Khoá không chứa dữ liệu cá nhân:** `HMAC-SHA256(RATE_LIMIT_PEPPER, phạm vi:giá trị chuẩn hoá)`, cho
  cả email, `userId` và IP; tiền tố theo `NODE_ENV`.
- **Chính sách một chỗ:** `rate-limit.policy.ts`. Các chốt chặn có sẵn (5 lần sai mỗi OTP, cooldown 60
  giây, bcrypt) giữ nguyên, giới hạn này bổ sung chứ không thay.
- **Redis lỗi thì sao (quyết định có chủ đích, không mặc định):**

| Nhóm | Endpoint | Khi Redis chết | Lý do |
|---|---|---|---|
| Chặn (503) | register, resend-verification, forgot-password | Không xử lý | Gửi email tới địa chỉ của người khác, không còn ranh giới nào giữa các danh tính; mở cửa là cho phép mail-bombing. Khách hiện có không bị ảnh hưởng |
| Mở | login | Cho đi tiếp, ghi log | Chặn = không ai đăng nhập được toàn hệ thống; bcrypt vẫn làm chậm |
| Mở | verify-email, reset-password | Cho đi tiếp | Chốt thật là 5 lần sai mỗi OTP trong Postgres; giới hạn IP chỉ là trần khối lượng |
| Mở | change-password | Cho đi tiếp | Cần access token hợp lệ |

- **IP khách:** `TRUST_PROXY_HOPS` mặc định 0 (bỏ qua `X-Forwarded-For`); **bắt buộc khai báo ở
  staging/production** vì đặt sai theo một trong hai hướng đều hỏng (mọi người chung một IP của proxy, hoặc
  kẻ tấn công giả IP). Không bao giờ bật `trust proxy` toàn cục.
- **Redis ephemeral:** `--save ""`, bộ đếm chỉ là trạng thái tạm. Cổng host cấu hình được (`REDIS_PORT`) vì
  cổng 6379 có thể đã do dự án khác trên máy giữ.

### Kết quả mong đợi → thực tế

Mong đợi: sau 5 lần sai, lần thứ 6 nhận 429 kể cả khi đúng mật khẩu; email không tồn tại nhận chuỗi phản
hồi y hệt email thật; 60 lần song song từ một IP chỉ 50 lần đi tiếp; Redis chết không treo request.
Thực tế: các kịch bản trên có test HTTP trên Postgres + Redis thật (giả `X-Forwarded-For` cả hai chiều
`TRUST_PROXY_HOPS`), test tích hợp `RedisRateLimiter` (100 song song → đúng 10 được phép; cổng đóng → lệnh
lỗi tức thì, khởi động không sập) và test chính sách mở/chặn bằng kho luôn lỗi. Quét toàn bộ khoá Redis
sau khi gọi API không thấy email/IP thô.

### Điều kiện xem lại

Khi triển khai nhiều vùng (Redis dùng chung phải chung vùng), khi cần CAPTCHA/2FA để chống việc lạm dụng
khoá tạm thời (ai biết email cũng chặn được đăng nhập 15 phút), hoặc khi đo được số hop thật của Render.

---

<a id="adr-014"></a>

## 2026-09-28 · ADR-014 — Phát hành OTP nguyên tử bằng khoá advisory của Postgres

**Loại:** quyết định · **Phạm vi:** `modules/auth/otp.service.ts`, `resendVerification`, `forgotPassword` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

ADR-011 ghi giới hạn: hai `forgot-password` đầu tiên song song cùng thấy "chưa có OTP" và cùng phát hành;
`resend-verification` có khe tương tự. Cooldown chỉ là `SELECT` không khoá rồi `INSERT`
(`isWithinResendCooldown` + `issue`), nên hai transaction READ COMMITTED không thấy nhau.

### Phương án

| Phương án | Được gì | Mất gì |
|---|---|---|
| Ràng buộc `unique` trên schema | DB tự chặn | Ép hình dạng lịch sử OTP; [ADR-010](#adr-010) đã cố ý tránh ràng buộc kiểu này |
| Khoá phân tán Redis (`SET NX` + TTL) | Đã có Redis | Trạng thái OTP ở Postgres còn khoá ở Redis: hai nguồn sự thật; chọn TTL (quá ngắn thì hở, quá dài thì kẹt); Redis chết thì OTP mất đúng đắn |
| **Khoá advisory theo transaction của Postgres (chọn)** | Cùng nơi với dữ liệu OTP; tự nhả khi commit/rollback (không TTL, không deadlock nếu tiến trình chết); đa bản sao; không phụ thuộc Redis | Chỉ có tác dụng trong transaction; khoá theo `hashtextextended` (va chạm chỉ gây xếp hàng thừa, không sai) |

**Chọn khoá advisory.** `pg_advisory_xact_lock` lấy **trước** khi đọc cooldown; khoá theo HMAC của
`otp-issue:<purpose>:<email>` nên email thô không tới câu lệnh khoá.

### Kết quả mong đợi → thực tế

Mong đợi: 2 (và 3) yêu cầu song song → đúng 1 mã, 1 email, cả ở lần phát hành đầu lẫn sau cooldown.
Thực tế: test `Promise.all` trên Postgres thật, chạy nhiều vòng. Kiểm chứng ngược: bỏ đúng dòng lấy khoá
thì cả 4 test fail (sinh 2–3 mã), nên test thật sự bảo vệ điều kiện này.

### Điều kiện xem lại

Nếu chuyển kho OTP khỏi Postgres, hoặc khi muốn dùng cho `GUEST_RETURN_VERIFICATION` (dùng lại được vì
khoá đã theo `purpose`).

---

<a id="adr-015"></a>

## 2026-09-28 · ADR-015 — Vô hiệu access token cũ bằng `authVersion`, tương thích JWT phát hành trước đó

**Loại:** quyết định · **Phạm vi:** `identity.prisma` (`users.auth_version`), `token.service.ts`, `auth.guard.ts`, `resetPassword`, `changePassword` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

[ADR-011](#adr-011) và [ADR-012](#adr-012) ghi giới hạn: access JWT chỉ có `sub`, `AuthGuard`
(`auth.guard.ts:35-44`) truy vấn `User` mỗi request nhưng không có gì để so, nên token cũ sống tới hết TTL
(mặc định 15 phút) sau khi đổi/đặt lại mật khẩu. `User` không có trường tương đương (`authVersion`,
`tokenVersion`, `passwordChangedAt`), nên cần migration tối thiểu.

### Phương án

| Phương án | Được gì | Mất gì |
|---|---|---|
| Danh sách đen `jti` (Redis) | Thu hồi từng token | Cần `jti`, kho có TTL, phụ thuộc Redis cho mọi request được bảo vệ |
| Rút ngắn TTL | Không đổi cấu trúc | Chỉ thu hẹp cửa sổ, không đóng; refresh nhiều hơn |
| **`users.auth_version` + claim `ver` (chọn)** | Một cột; `AuthGuard` đã đọc user mỗi request nên **không thêm truy vấn**; bền vững, không cache | Vô hiệu theo *người dùng* chứ không theo từng token (đủ cho đổi/đặt lại mật khẩu) |

**Chọn `authVersion`.** Tăng trong **cùng transaction** với đổi hash và thu hồi refresh token, cả hai luồng.

### Tương thích khi triển khai

JWT phát hành trước PH3.4 không có `ver`; coi là `0`, khớp default của cột. Mọi user hiện có ở `0`, nên
triển khai **không** đăng xuất ai; token cũ chỉ chết khi chủ nhân đổi/đặt lại mật khẩu. So sánh `!==`
(cao hơn hay thấp hơn đều bị từ chối). Migration: `ADD COLUMN ... NOT NULL DEFAULT 0` (không viết lại
bảng trên Postgres 17), forward-only.

### Kết quả mong đợi → thực tế

Mong đợi: token cũ → `/auth/me` = 401 ngay sau đổi và sau đặt lại mật khẩu; đăng nhập lại ra token mới
hợp lệ; thất bại không tăng phiên bản; hai đổi song song chỉ tăng một lần.
Thực tế: có test HTTP cho tất cả, cộng token *không có* `ver` (chạy ở phiên bản 0, chết sau khi đổi) và
`ver` sai hướng. Bỏ so sánh `ver` khỏi `AuthGuard` thì các test đó fail. Migration đã áp lên test DB và
dev DB, `db:drift` báo không lệch, user cũ đều ở 0.

### Điều kiện xem lại

Khi cần thu hồi một phiên riêng lẻ (quản lý thiết bị), khi thêm sự kiện khác cần cắt mọi access token
(khoá tài khoản đã được `AuthGuard` chặn qua `UserStatus`).

---

<a id="adr-016"></a>

## 2026-09-28 · ADR-016 — Phát hiện replay refresh token, thu hồi cả family, refresh single-flight ở frontend

**Loại:** quyết định · **Phạm vi:** `AuthService.refresh`, `AuthProvider.tsx` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

Trước PH3.4, dùng lại token đã xoay chỉ nhận 401 chung (`auth.service.ts` cũ), và test cũ còn khẳng định
token thay thế **vẫn dùng được** sau replay. `RefreshToken` đã có `familyId`, `revokedAt`,
`replacedByTokenId` (`identity.prisma`). Frontend đã có `refreshInFlight` trong một tab, nhưng một 401 đến
muộn vẫn xoay thêm một lần, và nhiều tab dùng chung một cookie.

### Phương án

| Câu hỏi | Chọn | Ghi chú |
|---|---|---|
| Phân biệt "xoay" với "logout/đổi mật khẩu" | **`replacedByTokenId` có giá trị = đã xoay** | Không cần cột `revokeReason` (chỉ thêm trường tối thiểu, ở đây là 0) |
| Phạm vi thu hồi khi replay | **Chỉ family đó** | Thu hồi cả người dùng làm một replay ở trình duyệt cũ đăng xuất mọi thiết bị; family khác không liên quan |
| Cửa sổ ân hạn cho token vừa xoay | **Không** | Yêu cầu của PH3.4: hai refresh song song → một thắng, một replay, family chết. Cửa sổ ân hạn mở đúng khe kẻ tấn công cần |
| Refresh song song cùng token | **Chiếm trước, tạo sau** | Đúng một request chiếm được; người kia coi là replay; không để lại bản ghi mồ côi |
| Bảo vệ ở frontend | **Single-flight + tái dùng token mới + khoá Web Locks giữa các tab** | Thiếu thì phát hiện replay khiến frontend tự đăng xuất mình |

### Quyết định phụ

- Chỉ replay đúng nghĩa mới thu hồi family; rác, hết hạn, đã logout, đã đổi mật khẩu, tài khoản không
  ACTIVE chỉ nhận 401 chung. Một chuỗi ngẫu nhiên không bao giờ thu hồi được phiên của ai.
- Mất chiếm (`count = 0`) được đọc lại để phân biệt replay với logout/đổi mật khẩu diễn ra đồng thời.
- Không throw trong transaction cho kết quả đã biết ([ADR-010](#adr-010)); log chỉ có `familyId` (UUID
  ngẫu nhiên), không token, không hash.
- Web Locks: nếu không có thì vẫn được bảo vệ trong từng tab. Đã có test nhóm đối chứng cho thấy thiếu
  khoá thì hai tab khôi phục cùng lúc mất phiên.

### Kết quả mong đợi → thực tế

Mong đợi: R1→R2, dùng lại R1 → 401 và R2 chết; refresh song song → đúng một 200, family chết kể cả token
của request thắng; family khác còn sống; rác/logout/đổi mật khẩu không kích hoạt phản ứng replay.
Thực tế: có test HTTP (gồm 5 family đua từng cái) và test frontend với backend giả mô hình hoá xoay+replay.
Kiểm chứng ngược: bỏ thu hồi family, coi mất chiếm là lỗi thường, bỏ single-flight, bỏ tái dùng token mới,
bỏ khoá Web Locks — mỗi cái làm đúng các test tương ứng fail. Một bản bảo vệ thừa (guard `null` trùng
với phép so token) đã được gỡ vì phá riêng từng cái không lộ ra.

### Đánh đổi chấp nhận và điều kiện xem lại

Nếu phản hồi refresh bị mất trên đường, lần thử lại bằng token cũ là replay và người dùng phải đăng nhập
lại. Xem lại nếu dữ liệu vận hành cho thấy tỷ lệ này đáng kể (khi đó mới cân nhắc cửa sổ ân hạn ngắn).

<a id="adr-017"></a>

## 2026-09-28 · ADR-017 — Log gửi email thất bại không chứa email người nhận, chỉ mã lỗi phân loại

**Loại:** quyết định · **Phạm vi:** `AuthService` (ba chỗ gửi mail), `infra/mail/smtp-mail.service.ts` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

### Hiện trạng

Ba cảnh báo trong `auth.service.ts` (đăng ký, gửi lại xác thực, quên mật khẩu) và một dòng lỗi trong
`smtp-mail.service.ts` ghi địa chỉ người nhận thô; dòng SMTP còn ghi `error.message`, mà máy chủ SMTP hay
lặp lại địa chỉ bị từ chối trong đó. Email là dữ liệu cá nhân, còn log thường sống lâu và được sao đi nhiều
nơi hơn cơ sở dữ liệu. Lệnh đo: `grep -rnE "logger\.|new Logger" apps/api/src` (chỉ còn `familyId`, tên endpoint,
mã lỗi phân loại sau thay đổi).

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Giữ email trong log | Dễ tìm lỗi của một người dùng | Log chứa PII; lộ luôn cả khi lỗi SMTP lặp lại địa chỉ | Có |
| B. Log email đã HMAC | Đối chiếu được mà không lộ | Thêm khoá, thêm mã; chưa có nhu cầu | Có |
| **C. Không log email, chỉ ghi `code`/`responseCode` đã lọc hình dạng (chọn)** | Đơn giản nhất; không đường nào cho văn bản tự do vào log | Khó hơn một chút khi cần biết mail của ai lỗi | Có |
| Không làm gì | – | Giữ PII trong log | – |

**Chọn C** vì việc gửi mail không đổi hành vi khi lỗi (request vẫn thành công), nên log chỉ cần cho biết
"đang có lỗi kiểu gì" để vận hành xử lý; cần đối chiếu người dùng thì có thời điểm log và bảng `otp_codes`.
Trade-off chấp nhận: mất mã tương quan theo từng email. Nếu sau này thật sự cần thì chuyển sang B, theo cách
khoá giới hạn tốc độ đã làm ([ADR-013](#adr-013)).

### Kết quả mong đợi → thực tế

Mong đợi: gửi mail lỗi thì đăng ký, gửi lại xác thực, quên mật khẩu vẫn trả phản hồi cũ, và không dòng log nào
chứa email, phần trước `@`, nội dung lỗi của máy chủ SMTP hay thông tin đăng nhập SMTP.
Thực tế: có test unit cho `SmtpMailService` và test HTTP cho ba luồng. Kiểm chứng ngược: đưa email và
`error.message` trở lại log thì 5 test unit và 3 test HTTP fail.

### Điều kiện xem lại

Khi vận hành cần đối chiếu lỗi gửi mail với một người dùng cụ thể một cách thường xuyên (chuyển sang phương án B).

<a id="adr-021"></a>

## 2026-09-30 · ADR-021 — Phân quyền theo vai bằng `RequireRoles` gộp `AuthGuard` và `RolesGuard`; danh mục vai nạp bằng migration, không bằng seed

**Loại:** quyết định · **Phạm vi:** `apps/api/src/modules/auth` (`RoleCode`, `RolesGuard`, `RequireRoles`, `grantAdminRole`), `apps/api/src/modules/users`, bảng `roles` và `user_roles`, `prisma/seed/identity.seed.ts`, `test/helpers/db.ts` · **Trạng thái:** đề xuất · **Người quyết:** Tài · **Commit:** (điền khi thi hành)

Số ADR: 018 đã được [products/LOG#adr-018](../products/LOG.md#adr-018) dùng, 019 và 020 do Issue #23 giữ
trước, nên lấy 021.

### Hiện trạng

- Không có `RolesGuard`, `@Roles` hay endpoint quản trị nào; `roles` chỉ nằm trong `CurrentUser`
  ([ND-03](../../TECH_DEBT.md)). `AuthGuard` đã đọc vai từ CSDL cho mỗi request (`auth.guard.ts:35-54`), JWT
  chỉ mang `sub` và `ver`.
- Bảng `roles` chỉ có `CUSTOMER`, và vai này **chỉ đến từ seed** (`identity.seed.ts`); migration không nạp
  vai nào. Production không chạy seed (`SEED_ON_START` chỉ bật ở staging, `render.yaml`), nên trên
  production `register()` sẽ trả `AUTH_CONFIGURATION_ERROR` vì thiếu `CUSTOMER` (suy luận từ mã, production
  chưa triển khai).
- Seed chạy cả trong image API (`docker-entrypoint.sh`, `SEED_ON_START`), nơi chỉ có `src/generated`, không
  có `src/modules` (`apps/api/Dockerfile`). Seed import mã nghiệp vụ thì staging dừng lúc khởi động.

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Controller tự gắn `@UseGuards(AuthGuard, RolesGuard)` và `@Roles(...)` | Quen thuộc với Nest | Quên một guard hay đảo thứ tự là thủng quyền mà không ai thấy | Có |
| **B. Một decorator `RequireRoles` gắn cả hai guard đúng thứ tự, guard từ chối khi thiếu metadata (chọn)** | Không thể dùng sai cách; sai cấu hình thì đóng cửa | Không tách được hai guard nếu sau này cần | Có |
| C. Kiểm vai trong service | Không cần guard | Mỗi chỗ viết lại một lần, dễ sót | Có |
| Không làm gì | – | Endpoint quản trị đầu tiên không có chặn quyền | – |

Danh mục vai:

| Phương án | Được gì | Mất gì |
|---|---|---|
| Seed upsert vai | Đơn giản | Production không có vai; seed không import được `RoleCode` trong image |
| **Migration dữ liệu `INSERT … ON CONFLICT (code) DO NOTHING` (chọn)** | Mọi môi trường có vai sau `migrate deploy`; chạy an toàn trên CSDL đã có `CUSTOMER` | Mã vai viết hai nơi (TypeScript và SQL) |
| Tài khoản admin cố định trong seed | Có admin ngay | Staging công khai chạy seed: mật khẩu cố định là cửa mở |

**Chọn B và migration dữ liệu.** Trade-off chấp nhận: mã vai có ở `role-code.ts` và trong SQL;
`role-code.spec.ts` đọc mọi migration và đòi hai nơi khớp nhau. Quản trị viên đầu tiên do người vận hành
nâng bằng `npm run admin:grant -w apps/api -- --email=<email>` từ một tài khoản đã tự đăng ký và xác thực.

Hệ quả: seed thôi ghi vai; `resetDatabase()` của kiểm thử HTTP không xoá bảng `roles`, nên bài kiểm thử
đăng ký dựa vào vai do migration nạp, đúng đường production.

### Kết quả mong đợi → thực tế

Mong đợi: ẩn danh gọi `/api/admin/users` nhận 401, `CUSTOMER` nhận 403, `ADMIN` nhận 200; gỡ hay cấp
`ADMIN` trong CSDL có hiệu lực ngay request kế tiếp với cùng access token; `npm run db:drift` không lệch.
Thực tế (30/09/2026, chưa commit): `test/admin-users.http.spec.ts` 17 bài xanh; `db:drift` "No difference
detected"; migration áp lên CSDL dev giữ nguyên `CUSTOMER` cũ và thêm `ADMIN`. Kiểm chứng ngược: bỏ
`RolesGuard` khỏi `RequireRoles` thì 3 bài HTTP đỏ; đảo thứ tự guard thì 11 bài HTTP và 2 bài đơn vị đỏ;
đưa `passwordHash` vào `select` thì 1 bài đơn vị và 3 bài HTTP đỏ; cho qua khi thiếu metadata thì 2 bài
đơn vị đỏ; thêm `STAFF` vào `RoleCode` mà không có migration thì 2 bài đơn vị đỏ.

### Điều kiện xem lại

Khi cần vai thứ ba (`STAFF`) hay quyền chi tiết hơn vai (theo từng thao tác), hoặc khi một phân hệ cần hai
guard tách rời.
