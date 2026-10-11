---
title: Đề xuất chuyển đổi chính sách mật khẩu
updated: 2026-10-11
status: đề xuất
owner: Tài
---
# Đề xuất chuyển đổi chính sách mật khẩu

**Chức năng:** Đặc tả policy 12 ký tự, giới hạn bcrypt, kiểm tra mật khẩu phổ biến và kế hoạch tương thích tài khoản cũ.

## Phạm vi và trạng thái

Chưa triển khai. Patch 1–2 giữ policy hiện tại ở server và frontend: tối thiểu 8 đơn vị UTF-16,
ít nhất một ký tự A–Z và một số 0–9. Không tự thêm giới hạn 12 ký tự hoặc 72 byte ở Register.
Nguồn: [password-policy.ts:6](../../../apps/api/src/modules/auth/password-policy.ts#L6),
[auth-form.ts](../../../apps/web/src/features/account/auth-form.ts).

Policy mới cần phê duyệt riêng và cập nhật đồng bộ Register, Reset và New Password trong Change.
Không thay policy đăng nhập hoặc Current Password. API thật tiếp tục lấy Swagger làm nguồn;
file này không công bố contract mới.

## Policy mục tiêu cần duyệt

| Thuộc tính | Đề xuất |
|---|---|
| Minimum | 12 Unicode code points; dùng cùng cách đếm ở FE/BE |
| Maximum | 72 byte UTF-8, giữ bcrypt cost 12 |
| Composition | Không bắt buộc chữ hoa, chữ số hoặc ký tự đặc biệt |
| Khoảng trắng/Unicode | Cho phép; không trim hoặc normalize ngầm |
| Common passwords | Blocklist phía server; ưu tiên danh sách local có phiên bản |
| Confirm | Chỉ kiểm ở UI, không gửi hoặc lưu bên server |
| Login/Current Password | Kiểm tra không rỗng và dùng bcrypt compare hiện tại |

12 ký tự là mục tiêu Product Owner yêu cầu; không coi mốc này là chứng nhận đạt mọi chuẩn
bảo mật. Unicode code points cũng không hoàn toàn trùng số grapheme nhìn thấy; helper và test
phải ghi rõ cách đếm thống nhất, không phụ thuộc `string.length` cũ.

[Bcrypt](https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns) dùng 72 byte đầu.
Server đo bằng `Buffer.byteLength(value, 'utf8')`; frontend dùng `TextEncoder`. Không cắt ngầm,
không dùng HTML `maxLength=72` thay kiểm byte, không thêm pre-hash tùy tiện. Mật khẩu Unicode
có thể đạt 12 ký tự nhưng vượt 72 byte; UI phải giải thích và cho người dùng sửa.
Hasher hiện tại: [password-hasher.service.ts:4](../../../apps/api/src/modules/auth/password-hasher.service.ts#L4).

## Blocklist

- Quyền quyết định ở backend; checklist frontend không bảo đảm password an toàn.
- Bắt đầu với danh sách phổ biến có nguồn, phiên bản và license được duyệt; kiểm exact candidate
  theo quy tắc blocklist, không biến đổi password được đưa vào bcrypt.
- Chốt riêng cách đối chiếu case và Unicode; không dùng regex composition để giả lập blocklist.
- Không gửi plaintext password đến dịch vụ ngoài, không ghi password vào log/telemetry.
- Nếu cân nhắc dịch vụ breached-password sau này, cần review privacy, timeout và failure policy.
- Mã lỗi và contract field-error mới phải được review; không suy ra từ chuỗi message nội bộ.

## Tương thích và triển khai đồng bộ

1. Duyệt policy, message, Unicode semantics, nguồn blocklist và tiêu chí chấp nhận.
2. Cập nhật một nguồn policy phía server cho tất cả thao tác tạo/thay password.
3. Cập nhật helpers và UI cả Register/Reset/Change trong cùng đợt rollout. Login và Current
   Password không dùng helper tạo mới để chặn password legacy.
4. Giữ bcrypt format/cost và compare cũ; không sửa schema, không rehash hoặc ép reset toàn bộ.
5. Tài khoản cũ có password ngắn hoặc dài hơn 72 byte vẫn đăng nhập theo hành vi bcrypt cũ.
   Chỉ password mới phải đáp ứng policy mới; không suy ra độ dài gốc từ hash.
6. Khi đổi từ password legacy bị truncate, cần chọn password mới thực sự khác; compare phía
   server vẫn có thể coi một candidate cùng prefix 72 byte là password cũ.
7. Nếu UI cũ/server mới lệch thời điểm, server vẫn từ chối candidate không hợp lệ và UI phải
   hiển thị lỗi an toàn; ưu tiên rollout phối hợp thay vì thay rule ở frontend trước.

## Validation và kiểm thử cần có

- Biên 11/12 Unicode code points và 71/72/73 byte; ASCII, tiếng Việt, emoji, combining marks.
- Password dài có cùng prefix: không chấp nhận candidate mới vượt giới hạn, không cắt ngầm.
- Passphrase không composition vẫn được nhận nếu đạt chiều dài/byte và không trong blocklist.
- Common password bị chặn cùng cách ở Register/Reset/Change.
- Legacy login/current verification vẫn thành công; sai password không được thông qua.
- Payload không có confirm; không log/plaintext leak; không đổi cơ chế revoke sessions.
- Unit/FE tests không dùng DB thật; HTTP tests chỉ khi database cô lập được xác nhận riêng.

## Dependency với Patch 3 — Reset Password B

Cần review verify-recovery API và proof ngắn hạn, một lần dùng, gắn account/purpose và phiên
bản credentials. Verify phải consume OTP và tạo proof nguyên tử; reset phải consume proof,
thay hash, tăng authVersion và revoke phiên trong transaction. Test hết hạn/replay/đua request,
rate limit, account bị khóa và mất proof khi reload. Không tạo bước frontend xác minh giả.
Pending recovery là policy khác, không tự mở rộng reset ACTIVE để activate hoặc unlock account.

Lý do chia phase và phạm vi: [LOG](LOG.md#auth-ui-refinement-2026-10-11).
