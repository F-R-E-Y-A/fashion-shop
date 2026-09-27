---
title: Tài khoản và xác thực — bản đồ
updated: 2026-09-24
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
Không triển khai rate limiting toàn cục ở PH3.1 (task riêng sau).

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

Không log/response/error nào chứa OTP thô, `OTP_PEPPER`, hay mật khẩu SMTP. `resend-verification`
luôn trả cùng một phản hồi chung chung bất kể email tồn tại hay không, để không lộ thông tin tài
khoản. Đăng ký không rollback khi gửi email thất bại: user vẫn ở PENDING_VERIFICATION và có thể
dùng resend. Chưa làm ở PH3.1 (xem `docs/TECH_DEBT.md` nếu cần mở nợ): rate limiting toàn cục,
revoke cả họ refresh-token khi phát hiện replay, quên/đặt lại mật khẩu, đổi mật khẩu, OAuth.
