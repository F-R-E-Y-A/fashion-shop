---
title: Tài khoản và xác thực — vòng đời phiên giữa các yêu cầu và các tab
updated: 2026-10-18
status: đang dùng
owner: Tài
---
# Vòng đời phiên giữa các yêu cầu và các tab

**Chức năng:** Cơ chế, kiểm thử và giới hạn để kết quả đến muộn hay tab khác không làm sống lại, đổi lẫn hay xóa nhầm phiên.

Sửa lỗi [Issue #43](https://github.com/F-R-E-Y-A/fashion-shop/issues/43). Nghiệp vụ và tiêu chí chấp nhận ở
[use-cases.md](use-cases.md) (UC-01.4); lý do và phương án ở [ADR-026](LOG.md#adr-026). Phát hiện replay,
`authVersion` và single-flight gốc ở [security.md](security.md).

## Cơ chế ở giao diện

[AuthProvider.tsx](../../../apps/web/src/features/account/AuthProvider.tsx) cùng
[session-sync.ts](../../../apps/web/src/features/account/session-sync.ts).

| Cơ chế | Chặn gì | Ở đâu |
|---|---|---|
| **Epoch**: số tăng mỗi khi danh tính trong tab đổi (đăng nhập, đăng xuất, hết phiên, tab khác báo đổi). Refresh cùng người dùng không đổi epoch | Kết quả của phiên cũ ghi đè state; request retry sang phiên mới | `startEpoch`, `AuthProvider.tsx:94` |
| **Hủy theo phiên**: mỗi epoch một `AbortController`, gộp với tín hiệu của người gọi | Request của phiên cũ còn chạy | `authenticatedRequest`, `AuthProvider.tsx:264` |
| **Intent**: số tăng khi người dùng *bắt đầu* đăng nhập hay đăng xuất | Đăng nhập hay khôi phục phiên đến muộn sau một thao tác mới hơn | `login`, `logout`, `AuthProvider.tsx:221`, `:239` |
| **Khóa** `fashion-shop:auth-refresh` (Web Locks; không có thì chuỗi promise trong tab) | Cookie đổi sai thứ tự giữa login, logout, refresh, đổi mật khẩu | `createAuthLock`, `session-sync.ts:37` |
| **Dấu phiên**: chuỗi ngẫu nhiên trong `localStorage`, ghi mới trong khóa mỗi khi phiên cookie của trình duyệt đổi: đăng nhập, đăng xuất của tab còn sở hữu phiên (ghi **trước** khi gọi mạng), đổi mật khẩu thành công | Tab cũ đăng xuất, đổi mật khẩu hay refresh trên cookie của phiên khác | `writeSessionMarker`, `session-sync.ts:72` |
| **Kênh** `BroadcastChannel('fashion-shop:auth')`, tin `{ type: 'session-changed' }`. Tin chỉ là tín hiệu "kiểm lại": tab còn giữ đúng dấu hiện tại thì bỏ qua | Tab khác giữ trạng thái của phiên đã kết thúc; tin đến muộn xóa nhầm phiên mới hơn | `holdsCurrentSession`, `session-sync.ts:94`; bên nhận `AuthProvider.tsx:189` |

Dấu phiên và tin nhắn **không chứa token, id hay email**; bài kiểm thử AC8 kiểm cả hai.

### Phân biệt sự kiện với phiên hiện tại

Tin nhắn không nói phiên nào; dấu phiên nói. Mỗi tab nhớ dấu của phiên nó đang giữ (lúc khôi phục, hay lúc chính
nó ghi khi đăng nhập). Khi nhận tin:

| Tình huống | Dấu tab giữ so với dấu hiện tại | Kết quả |
|---|---|---|
| Tab khác đăng xuất, đăng nhập hay đổi mật khẩu sau phiên của tab này | Khác | Xóa trạng thái local |
| Tin của một lần đăng nhập **trước** khi tab này đăng nhập, đến muộn | Trùng | Bỏ qua, giữ phiên |
| Tab đã bị thay phiên rồi bấm đăng xuất | Không ghi dấu, không gửi tin | Phiên mới ở tab khác không bị đụng |
| Không đọc được dấu (storage bị chặn) | Không so được | Xóa trạng thái local: thiếu bằng chứng thì không giữ phiên |

### Ba luật để khóa không tự chờ chính mình

1. Trong khóa chỉ có **một** lời gọi mạng thô (`refresh`, `login`, `logout`, `change-password`). Không gọi
   `authenticatedRequest`, không xin khóa lần nữa, không chờ refresh đang bay.
2. Đổi mật khẩu gặp 401 thì **ra khỏi khóa** rồi mới làm mới phiên (refresh tự xin khóa), sau đó thử lại một lần.
3. Mỗi lời gọi trong khóa có hạn `AUTH_LOCK_TIMEOUT_MS` = 15 giây (`session-sync.ts:28`), nên một tab treo
   không giữ khóa mãi.

### Kiểm lại ngay trước khi gửi

Thao tác có thể chờ khóa lâu. Khi tới lượt:

| Thao tác | Kiểm | Không còn hợp lệ thì |
|---|---|---|
| Refresh giữa phiên | Epoch còn nguyên; dấu phiên chưa đổi | Không gửi; dấu đổi thì xóa trạng thái local |
| Khôi phục phiên lúc tải | Epoch và intent còn nguyên | Không gửi, bỏ kết quả |
| Đăng nhập | Intent còn nguyên | Không gửi, báo `SessionChangedError` |
| Đăng xuất | Dấu phiên chưa đổi | Không gửi, không ghi dấu, không báo tin; trạng thái local vẫn đã xóa |
| Đổi mật khẩu | Epoch còn nguyên; dấu phiên chưa đổi | Không gửi, xóa trạng thái local, báo `SessionChangedError` |

### Khôi phục phiên ban đầu khác đổi danh tính giữa phiên

- **Lúc tải trang** (`refreshSession(null)`): tab chưa có danh tính, nhận người dùng mà cookie đang giữ.
- **Giữa phiên** (`refreshSession(userId)`): refresh trả về người dùng khác (`AuthProvider.tsx:153`) hay dấu
  phiên đã đổi (`:131`) thì chỉ xóa trạng thái local, không dùng token mới, không gửi lại yêu cầu, không
  đăng xuất. Cookie đã xoay vẫn hợp lệ cho tab đang dùng phiên đó.

`SessionChangedError` xuất qua [index.ts](../../../apps/web/src/features/account/index.ts) để các trang khác
phân biệt "phiên đã đổi" với lỗi mạng. Trang đổi mật khẩu hiển thị thông báo riêng cho lỗi này.

## Cơ chế ở máy chủ

`AuthService.logout` (`apps/api/src/modules/auth/auth.service.ts:517`) chạy một giao dịch:

1. Đọc `userId`, `familyId` của token được gửi lên. Token lạ thì không làm gì.
2. `SELECT … FOR NO KEY UPDATE` dòng `users` (`lockUserForSessionEnd`, `user-session-lock.ts:45`).
3. Thu hồi mọi token chưa thu hồi của family đó bằng một câu lệnh mới.

Khóa ở bước 2 xung đột với `FOR SHARE` của login và refresh, nên logout và refresh xếp hàng. Thứ tự khóa luôn
là `users` rồi `refresh_tokens`, giống khóa tài khoản, đổi và đặt lại mật khẩu, nên không có vòng chờ.

| Thứ tự | Kết quả |
|---|---|
| Refresh đang xoay rồi logout | Logout chờ, rồi thấy và thu hồi token vừa xoay |
| Logout rồi refresh | Refresh chờ, đọc lại token đã thu hồi, trả 401; không coi là replay |

## Kiểm thử

| Bài | Phủ |
|---|---|
| [session-lifecycle.test.tsx](../../../apps/web/src/features/account/session-lifecycle.test.tsx) | 19 bài AC4–AC10: backend giả có cookie dùng chung, cổng giữ phản hồi, khóa giả FIFO, kênh giả có thể giữ tin để ép tin đến muộn. Thứ tự được ép bằng cổng, khóa và tin giữ lại, không chạy nhiều vòng |
| [auth-session-lifecycle.http.spec.ts](../../../apps/api/test/auth-session-lifecycle.http.spec.ts) | 7 bài AC5 trên Postgres thật, gồm hai bài ép thứ tự bằng giao dịch giữ khóa dòng và `pg_stat_activity` |
| [refresh-single-flight.test.tsx](../../../apps/web/src/features/account/refresh-single-flight.test.tsx) | Single-flight cũ giữ nguyên, vẫn xanh |

Kiểm chứng ngược ngày 18/10, chạy các bài mới trên `e7d4194`:
- Giao diện cũ hỏng 16/19 bài.
- Máy chủ cũ hỏng 2/7 bài: token vừa xoay vẫn refresh được (200).
- Bài chạy đồng thời 5 vòng **vẫn qua trên mã cũ**, nên hai bài ép thứ tự là bằng chứng chính.

Hai bài "tin đăng nhập đến muộn" và "đăng xuất lỗi mạng" lấy từ review của Codex; chúng hỏng trên bản trước review.

## Giới hạn đã biết

- Đăng xuất không vô hiệu access token: token cũ còn hiệu lực tới hết `JWT_ACCESS_TTL`. Tab khác được báo
  qua kênh và tự xóa trạng thái, nhưng máy chủ vẫn nhận token đó.
- Tab bỏ qua đăng xuất vì cookie là của phiên khác thì family cũ của tab không bị thu hồi (không còn trình
  duyệt nào giữ token của nó), tới khi hết hạn.
- Đăng xuất lỗi mạng: mọi tab đã xóa trạng thái, nhưng family ở máy chủ còn sống tới khi hết hạn nếu cookie chưa
  bị xóa.
- `localStorage` bị chặn thì không có dấu phiên. Khi đó:
  - mọi tin từ tab khác đều xóa trạng thái local, kể cả tin đến muộn;
  - còn lớp kiểm `userId` sau refresh;
  - đăng xuất hay đổi mật khẩu ở tab cũ có thể chạm cookie của phiên mới.
- Đăng nhập lại **cùng** tài khoản ở tab khác cũng làm tab này xóa trạng thái, vì dấu phiên đổi.
- Hết hạn 15 giây chỉ hủy phía trình duyệt; thao tác đã tới máy chủ (như đổi mật khẩu) vẫn có thể đã thực hiện.
