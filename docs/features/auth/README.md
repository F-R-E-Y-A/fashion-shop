---
title: Tài khoản và xác thực — bản đồ
updated: 2026-09-28
status: đang làm
owner: Tài
---
# Tài khoản và xác thực

**Chức năng:** Cửa vào của feature tài khoản: đặc tả ở đâu, dòng việc nào đang làm, hợp đồng công bố cho người khác, trạng thái hôm nay.

| | |
|---|---|
| **Người sở hữu** | Tài · `apps/api/src/modules/auth`, `apps/api/src/modules/users` · `apps/web/src/features/account` · bảng trong `prisma/schema/identity.prisma` |
| **Dòng việc** | PH-03 (Issue #8, nhánh `feature/ph3-auth`), sprint S2 |
| **Use case** | UC-01.1 đăng ký, UC-01.2 đăng nhập, UC-01.4 đăng xuất. Đặc tả của Duy đang ở pull request #9, chưa gộp; khi gộp đặt tại `docs/features/auth/use-cases.md` |

## Hợp đồng công bố

Duy cần biết ai đang đăng nhập để gộp giỏ. Issue #8 hẹn công bố trước hết Thứ Ba 23/09:

```
AuthGuard      // xac minh Bearer access JWT va gan principal an toan vao request
CurrentUser    // decorator lay { id, email, roles }
```

Khi có mã, chữ ký thật ghi ở `apps/api/src/modules/auth/README.md` theo mẫu [products/README.md](../../../apps/api/src/modules/products/README.md).

## Trạng thái hôm nay (27/09/2026)

`identity.prisma` và migration baseline đã có `users`, `roles`, `user_roles`, `refresh_tokens`.
Phase 4 đã có refresh/logout: refresh cookie HttpOnly được rotate khi cấp access token mới, còn
logout revoke refresh session hiện tại và xóa cookie. Hai endpoint này không cần access token.
Phase 5 giữ access token và user trong bộ nhớ giao diện; khi tải lại trang, app gọi `/auth/refresh`
bằng cookie HttpOnly để khôi phục phiên. Logout luôn xóa state giao diện, kể cả khi gọi API gặp lỗi.

## PH3.1 — Xác thực email (OTP), nhánh `feature/ph3-email-verification`

### Luồng đăng ký mới

```
POST /auth/register        -> tạo User PENDING_VERIFICATION + CUSTOMER, tạo OtpCode, gửi email OTP
                               KHÔNG cấp access token, KHÔNG tạo refresh token, KHÔNG set cookie
POST /auth/verify-email     -> đúng OTP thì User -> ACTIVE, OTP bị consume. Không cấp session.
POST /auth/resend-verification -> luôn trả { accepted: true }, kể cả email không tồn tại/đã ACTIVE
POST /auth/login            -> như cũ; PENDING_VERIFICATION + mật khẩu đúng -> lỗi EMAIL_NOT_VERIFIED
```

Giao diện: đăng ký xong điều hướng sang `/xac-thuc-email` (không tự đăng nhập). Xác thực xong
điều hướng người dùng sang `/login` bằng nút bấm, không tự động đăng nhập.

### OTP policy (`apps/api/src/modules/auth/otp-policy.ts`)

OTP 6 chữ số, sinh bằng `node:crypto.randomInt` (không dùng `Math.random`). Hết hạn sau 10 phút,
tối đa 5 lần nhập sai (`attemptCount`), sau đó phải resend. Resend có cooldown 60 giây; resend
thành công sẽ vô hiệu hoá (consume) mọi OTP `EMAIL_VERIFICATION` chưa dùng trước đó của email đó.
Rate limiting toàn cục không làm ở PH3.1; đã làm ở PH3.4 ([security.md](security.md)).

### Lưu trữ OTP: HMAC-SHA256 + pepper (`apps/api/src/modules/auth/otp.util.ts`)

Không lưu OTP dạng chữ số thô, và SHA-256 đơn thuần chưa đủ (OTP 6 số entropy thấp, brute-force
được nếu DB lộ). `codeHash` bám vào `email + purpose + code` bằng HMAC-SHA256 với secret server-only
`OTP_PEPPER` (`infra/config/env.ts`, bắt buộc, tối thiểu 32 ký tự, không có default). So khớp dùng
`crypto.timingSafeEqual`. Không dùng bảng OTP mới: tái dùng `otp_codes` đã có sẵn từ trước
(`OtpPurpose.EMAIL_VERIFICATION`); `PASSWORD_RESET`/`GUEST_RETURN_VERIFICATION` dùng lại được
`OtpService` cho các việc sau này mà không sửa file này.

### Email: MailService trừu tượng, SMTP thật là Mailpit ở local

`infra/mail/mail.service.ts` là interface trừu tượng (`send(message)`); Auth không phụ thuộc thẳng
vào `nodemailer`. `infra/mail/smtp-mail.service.ts` là implementation SMTP. Biến môi trường:
`SMTP_HOST`, `SMTP_FROM` bắt buộc; `SMTP_PORT` (default 1025), `SMTP_SECURE` (default false),
`SMTP_USER`/`SMTP_PASS` tùy chọn (để trống khi dùng Mailpit, không cần xác thực).

Local: `npm run db:up` khởi động thêm `mailpit` (SMTP `localhost:1025`, web UI `localhost:8025`) —
xem email OTP thật đã "gửi" tại `http://localhost:8025`. Kiểm thử HTTP (`apps/api/test`) không gọi
SMTP thật: `test/helpers/create-test-app.ts` override `MailService` bằng `FakeMailService`
(`test/helpers/fake-mail.service.ts`), chỉ ghi nhận email vào bộ nhớ.

### An toàn

Không log/response/error nào chứa OTP thô, `OTP_PEPPER`, mật khẩu SMTP, hay email người nhận (xem [security.md](security.md#nhật-ký-không-chứa-email-người-nhận)). `resend-verification`
luôn trả cùng một phản hồi chung chung bất kể email tồn tại hay không, để không lộ thông tin tài
khoản. Đăng ký không rollback khi gửi email thất bại: user vẫn ở PENDING_VERIFICATION và có thể
dùng resend. Các việc PH3.1 chưa làm — rate limiting, phát hiện replay refresh token, quên/đặt lại
mật khẩu, đổi mật khẩu — đã làm ở PH3.2–PH3.4; chỉ còn OAuth, 2FA và RBAC admin.

## PH3.2 — Quên mật khẩu / đặt lại mật khẩu, nhánh `feature/ph3-password-recovery`

### Luồng

```
POST /auth/forgot-password  -> luon tra { accepted: true }. Chi tao OTP PASSWORD_RESET + gui email
                                khi user dang ACTIVE (xem "Policy theo UserStatus" duoi day).
POST /auth/reset-password   -> dung OTP dung: doi passwordHash, consume OTP, revoke MOI refresh
                                token con hieu luc cua user (khong chi mot family). Khong cap session.
```

Giao diện: `/quen-mat-khau` (nhập email, luôn hiện thông báo chung chung) → `/dat-lai-mat-khau`
(email + OTP + mật khẩu mới + xác nhận). Đặt lại thành công hiện nút "Đăng nhập ngay", không tự
đăng nhập — giống hệt cách `/xac-thuc-email` xử lý ở PH3.1. `LoginPage` có thêm link "Quên mật khẩu?".

### Policy theo UserStatus (quyết định của PH3.2)

Chỉ tài khoản **ACTIVE** mới thực sự nhận OTP `PASSWORD_RESET` + email. Ba trường hợp còn lại đều
trả cùng response chung chung như email không tồn tại, **không** tạo OTP:

- **PENDING_VERIFICATION**: tài khoản này không đăng nhập được dù mật khẩu gì (bị chặn bởi
  `EMAIL_NOT_VERIFIED`), nên "quên mật khẩu" không giải quyết được gì; lối ra đúng là
  `resend-verification`, không phải `forgot-password`.
- **LOCKED / DISABLED**: đây là hành động khóa có chủ đích; cho tự phục hồi mật khẩu sẽ làm mất tác
  dụng của việc khóa, nên giữ nguyên chặn như `login()`/`refresh()` đã làm.

### Tái sử dụng từ PH3.1, không sửa gì

`OtpService` (`issue`/`verify`/`isWithinResendCooldown`) đã trung lập theo `OtpPurpose` từ thiết kế
ban đầu ([LOG#adr-010](LOG.md#adr-010)) nên PH3.2 dùng thẳng với `OtpPurpose.PASSWORD_RESET`, không
sửa `otp.service.ts`. `MailService` dùng lại nguyên vẹn, chỉ thêm `password-reset-email.ts` soạn nội
dung riêng. Mã OTP dùng chung decorator `IsOtpCode` (`otp-policy.ts`, tách ra từ PH3.2 để
`verify-email` và `reset-password` không lặp lại luật `^\d{6}$`). Mật khẩu mới dùng lại
`IsStrongPassword` và `PasswordHasherService` y hệt `register()`, không có logic hash thứ hai.
Không có migration nào ở PH3.2: `OtpPurpose.PASSWORD_RESET`, `OtpCode`, `RefreshToken.revokedAt` đã
đủ từ trước.

### Transaction và revoke session

`resetPassword()` theo đúng kỷ luật đã sửa ở PH3.1 ([LOG#adr-010](LOG.md#adr-010) phần "Thực tế"):
không throw bên trong `$transaction` cho một outcome đã biết trước, chỉ throw sau khi transaction đã
commit. Khi OTP đúng, cùng một transaction: consume OTP, đổi `passwordHash`, và
`refreshToken.updateMany({userId, revokedAt: null} -> revokedAt: now)` cho **toàn bộ** family, không
chỉ family hiện tại — nên không có trạng thái nửa vời (đổi mật khẩu nhưng OTP chưa consume, hoặc
ngược lại). Giới hạn ở thời điểm PH3.2 (access token cũ còn sống tới hết TTL) đã được xử lý ở PH3.4:
transaction này giờ còn tăng `authVersion`, xem [security.md](security.md#access-token-authversion).

## PH3.3 — Đổi mật khẩu, nhánh `feature/ph3-change-password`

Dành cho người **đang đăng nhập**, không dùng OTP.

```
POST /auth/change-password   (Bearer access token, AuthGuard + CurrentUser)
  body { currentPassword, newPassword }   -> 204, xoa refresh cookie, KHONG cap token/session moi
```

- **Định danh chỉ lấy từ token:** `userId` là `CurrentUser.id` do `AuthGuard` gắn vào request;
  body không có `userId`/`email`. Convention endpoint: mọi endpoint auth hiện có dùng `POST` (không
  có `PATCH` nào cho credential), nên giữ `POST`.
- **Trạng thái tài khoản:** `AuthGuard` truy vấn lại `UserStatus` cho từng request và chặn
  LOCKED/DISABLED/PENDING_VERIFICATION bằng `401 UNAUTHORIZED` chung, nên endpoint này thừa hưởng
  luôn, `changePassword()` không kiểm lại.
- **Mật khẩu hiện tại** kiểm bằng `PasswordHasherService.verify` (không gọi bcrypt trực tiếp); sai →
  `400 CURRENT_PASSWORD_INVALID`, không đổi hash, không revoke session. Dùng 400 chứ không 401 để
  `authenticatedRequest()` của giao diện (tự refresh-retry khi gặp 401) không nhầm mật khẩu sai với
  access token hết hạn.
- **Mật khẩu mới:** dùng lại `IsStrongPassword` như register/reset (yếu → `400 BAD_REQUEST`); trùng
  mật khẩu hiện tại → `400 NEW_PASSWORD_SAME_AS_CURRENT`. Ô xác nhận chỉ kiểm ở giao diện, không gửi
  lên server. Không lưu lịch sử mật khẩu.
- **Nguyên tử + chống đua:** đổi `passwordHash` và revoke **toàn bộ** refresh token còn hiệu lực
  (mọi family, kể cả phiên trình duyệt khác) chung một transaction. Ghi hash là
  `updateMany({ id, passwordHash: <hash đã đọc> })`: hai request đổi song song cùng mật khẩu hiện tại
  thì chỉ một request khớp điều kiện, request còn lại `count = 0` → `CURRENT_PASSWORD_INVALID`, không
  ghi đè kiểu last-write-wins. Không throw trong transaction; map lỗi sau khi commit (như PH3.1/3.2).
- **Cookie:** controller xoá `refresh_token` bằng đúng `clearRefreshCookieOptions` mà `logout` dùng.
- **Giao diện:** route `/doi-mat-khau` (link "Đổi mật khẩu" ở navbar khi đã đăng nhập). Chưa đăng nhập
  thì trang chuyển về `/login`. Thành công: `AuthProvider.changePassword()` xoá access token và user
  ở bộ nhớ, trang hiện "Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại." kèm nút về `/login`;
  không tự đăng nhập lại, không lưu mật khẩu vào storage/URL/navigation state.
- **Access token cũ:** ở thời điểm PH3.3 còn sống tới hết TTL; PH3.4 đã đóng bằng `authVersion`
  (mọi access token cũ bị `AuthGuard` từ chối ngay sau khi đổi mật khẩu), xem
  [security.md](security.md#access-token-authversion) và [LOG#adr-015](LOG.md#adr-015).
- **Không migration:** không đụng `identity.prisma`.

Cách test: `npm run test:http -w apps/api` (describe `change-password`, có test đua bằng
`Promise.all` trên Postgres thật) và `npm run test -w apps/web`. Chạy tay: đăng nhập hai lần (hai
phiên), gọi `POST /api/auth/change-password` bằng phiên A → cả hai refresh cookie đều bị `401` ở
`/api/auth/refresh`, mật khẩu cũ `401`, mật khẩu mới `200` ở `/api/auth/login`.

## PH3.4 — Hardening bảo mật, nhánh `feature/ph3-security-hardening`

Chi tiết ở [security.md](security.md) (tách riêng để giữ mỗi file dưới 300 dòng). Tóm tắt:

| Việc | Cách làm | Quyết định |
|---|---|---|
| Chống dò mật khẩu / spam | Giới hạn tốc độ trên **Redis** dùng chung, khoá là HMAC, có chính sách mở/chặn khi Redis chết theo từng endpoint | [ADR-013](LOG.md#adr-013) |
| OTP phát hành nguyên tử | Khoá advisory theo transaction của **Postgres** (không dùng Redis) | [ADR-014](LOG.md#adr-014) |
| Access token cũ sau đổi/đặt lại mật khẩu | Cột `users.auth_version` + claim `ver`, `AuthGuard` so sánh | [ADR-015](LOG.md#adr-015) |
| Refresh token bị dùng lại | Phát hiện replay, thu hồi **cả family**; frontend refresh single-flight + khoá Web Locks | [ADR-016](LOG.md#adr-016) |

Biến môi trường mới: `REDIS_URL`, `RATE_LIMIT_PEPPER` (bắt buộc), `TRUST_PROXY_HOPS` (bắt buộc ở
staging/production). Một migration mới: `20260928120000_ph3_4_user_auth_version`. Local cần thêm
dịch vụ `redis` trong `docker-compose.yml` (`npm run db:up`).
