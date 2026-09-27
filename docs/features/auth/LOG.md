---
title: Tài khoản và xác thực — nhật ký quyết định và thay đổi
updated: 2026-09-24
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
