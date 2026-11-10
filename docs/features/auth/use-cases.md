---
title: UC-01 Tài khoản và xác thực — đặc tả use case
updated: 2026-11-02
status: nháp
owner: Tài
---
# UC-01 · Tài khoản và xác thực

**Chức năng:** Đặc tả đề xuất cho các use case tài khoản đang sửa mã; hiện có UC-01.4 làm mới phiên và đăng xuất.

| | |
|---|---|
| **Người viết đặc tả** | Tài (đề xuất, chờ duyệt) |
| **Người sở hữu mã** | Tài, module `apps/api/src/modules/auth` và `apps/web/src/features/account` |
| **Dòng việc** | PH-03; sửa lỗi [Issue #43](https://github.com/F-R-E-Y-A/fashion-shop/issues/43) |
| **Tác nhân chính** | Khách hàng |
| **Tác nhân phụ** | — |

Mã nhóm và số thứ tự lấy theo **bản đề xuất** ở [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26)
(chưa gộp, chưa duyệt). [use-case-index.md](../../shared/use-case-index.md) trên `develop` còn là khuôn; tệp
này không sửa danh mục chung. PR #26 cũng tạo tệp này, nên khi gộp phải hợp nhất thành một bản UC-01.4.
[TBD — hỏi Duy]

Cơ chế cài đặt, bài kiểm thử và giới hạn nằm ở [session-lifecycle.md](session-lifecycle.md); tệp này chỉ giữ
nghiệp vụ và tiêu chí.

---

## UC-01.4 · Làm mới phiên và đăng xuất

### Câu chuyện người dùng
Là một **khách hàng**, tôi muốn **phiên đăng nhập tự duy trì và đăng xuất có hiệu lực trên mọi tab**, để
**không ai dùng tiếp tài khoản của tôi sau khi tôi rời đi**.

### Điều kiện trước
Trình duyệt có refresh cookie HttpOnly từ một lần đăng nhập, hoặc tab đang ở trạng thái đã đăng nhập.

### Điều kiện sau
- Làm mới: token cũ bị thu hồi, cookie mang token mới cùng family, tab nhận access token mới.
- Đăng xuất: family của cookie bị thu hồi, cookie bị xóa, trạng thái và dữ liệu tài khoản đã cache ở mọi tab
  của trình duyệt bị xóa.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Mở trang, hoặc access token hết hạn | Gửi yêu cầu làm mới bằng cookie |
| 2 | | Xoay refresh token, trả access token mới và người dùng |
| 3 | Bấm Đăng xuất | Xóa trạng thái tab ngay, gửi yêu cầu đăng xuất, báo các tab khác |
| 4 | | Thu hồi cả family của cookie, xóa cookie |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Token đã xoay bị dùng lại | Thu hồi family của token đó, trả 401 chung |
| E2 | Kết quả làm mới, đăng nhập hay yêu cầu đến sau khi phiên trong tab đã đổi | Bỏ kết quả, không ghi trạng thái, không gửi lại |
| E3 | Tab khác đã đăng nhập phiên khác | Tab này chỉ xóa trạng thái local; không đăng xuất, không đổi mật khẩu trên cookie đó |
| E4 | Đăng xuất lỗi mạng | Trạng thái local ở mọi tab vẫn bị xóa |
| E5 | Thông báo của một sự kiện cũ hơn phiên hiện tại của tab đến muộn | Tab bỏ qua, giữ phiên |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Làm mới và đăng xuất không cần access token, chỉ cần cookie |
| BR2 | Thông tin trao đổi giữa các tab không chứa token, mã người dùng hay email |
| BR3 | Đăng nhập, đăng xuất, làm mới và đổi mật khẩu xếp hàng qua một khóa chung, không lồng khóa |
| BR4 | Chỉ lúc tải trang mới nhận phiên của cookie hiện có; giữa phiên không nhận người dùng khác |

### Đường dẫn API cần có
`POST /api/auth/refresh` (401 khi token không dùng được), `POST /api/auth/logout` (luôn 204). Hình dạng ở
Swagger `/api/docs`.

### Dữ liệu
`refresh_tokens` (`family_id`, `revoked_at`, `replaced_by_token_id`); dòng `users` bị khóa khi tạo, xoay hay kết
thúc phiên. Không thêm bảng hay cột.

### Tiêu chí chấp nhận
- [ ] **AC1** Làm mới bằng cookie hợp lệ trả access token mới và xoay cookie.
- [ ] **AC2** Dùng lại token đã xoay thu hồi cả family của nó; family khác của cùng người dùng không bị ảnh hưởng.
- [ ] **AC3** Đăng xuất thu hồi phiên ở máy chủ, xóa cookie và xóa trạng thái ở client.
- [ ] **AC4** Kết quả làm mới hay đăng nhập đến muộn, thành công hay thất bại, không thay đổi phiên đã đăng xuất
  hoặc đã đổi.
- [ ] **AC5** Đăng xuất thu hồi cả family của token được gửi lên, kể cả khi token đó vừa bị xoay; family khác
  không bị ảnh hưởng.
- [ ] **AC6** Yêu cầu gửi dưới một danh tính không bao giờ được gửi lại bằng token của danh tính khác; kết quả
  của nó bị bỏ khi phiên đã đổi.
- [ ] **AC7** Đổi phiên hủy các yêu cầu đang chờ và xóa dữ liệu tài khoản đã cache của phiên trước,
  gồm hồ sơ, địa chỉ, preview/đơn cá nhân và mọi phân hệ admin. Cùng tài khoản đăng nhập lại vẫn là
  phiên mới; không giữ placeholder hoặc thông báo của phiên trước. Cache công khai vẫn được giữ.
- [ ] **AC8** Tab phát hiện phiên đã đổi thì chỉ xóa trạng thái local, không tự nhận tài khoản khác, không đăng
  xuất phiên đó. Thông báo của sự kiện cũ hơn phiên hiện tại của tab bị bỏ qua; đăng xuất lỗi mạng vẫn báo
  các tab khác; tab đã bị thay phiên đăng xuất thì không báo.
- [ ] **AC9** Đăng nhập, đăng xuất, làm mới và đổi mật khẩu xếp hàng qua một khóa, kiểm lại tính hợp lệ ngay
  trước khi gửi, không lồng khóa; đổi mật khẩu hay đăng xuất không xóa phiên mà tab khác vừa tạo.
- [ ] **AC10** Khôi phục phiên lúc tải trang nhận phiên của cookie hiện có.

AC1–AC3 đã có hành vi và bài kiểm thử từ PH3.4 (`auth.http.spec.ts`, `auth-hardening.http.spec.ts`) nhưng tên
bài chưa ghi mã; AC4–AC10 ghi mã trong tên bài.

## Câu hỏi còn treo

- Mã `UC-01.4` và cách hợp nhất với bản ở PR #26. [TBD — hỏi Duy]
- Có cần đăng xuất vô hiệu ngay cả access token không; hiện token còn sống tới hết `JWT_ACCESS_TTL`.
