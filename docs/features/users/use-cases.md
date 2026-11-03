---
title: UC-02 Quản trị tài khoản — đặc tả use case
updated: 2026-11-03
status: đề xuất
owner: Tài
---
# UC-02 · Quản trị tài khoản

**Chức năng:** Quản trị viên tìm, lọc, xem tài khoản và khóa, mở khóa ở danh sách hay chi tiết qua giao diện web.

| | |
|---|---|
| **Người viết đặc tả** | Tài (đề xuất, chờ duyệt) |
| **Người sở hữu mã** | Tài, module `apps/api/src/modules/users` và `apps/web/src/features/account/admin` |
| **Dòng việc** | PH-03 · Admin.3, [Issue #46](https://github.com/F-R-E-Y-A/fashion-shop/issues/46); tìm, lọc và thao tác nhanh, [Issue #48](https://github.com/F-R-E-Y-A/fashion-shop/issues/48); UC-02.2 chưa giao |
| **Tác nhân chính** | Quản trị viên |
| **Tác nhân phụ** | Người dùng bị khóa hay mở khóa |

Mã `UC-02.1` lấy theo **bản đề xuất** ở [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26), chưa gộp. Bản đó ghi UC-02.1 "Đã viết" nhưng không kèm đặc tả; tệp này là đặc tả đầu tiên. Mã và số AC chưa được Duy chốt. [TBD — hỏi Duy]

Hợp đồng API đã cài đặt nằm ở Swagger `/api/docs` (thẻ `admin-users`) và [README.md](README.md#api); tệp này chỉ giữ nghiệp vụ và tiêu chí.

---

## UC-02.1 · Quản trị tài khoản và khóa người dùng

### Câu chuyện người dùng
Là một **quản trị viên**, tôi muốn **xem và khóa, mở khóa tài khoản qua một giao diện rõ ràng**, để **xử lý tài khoản có vấn đề mà không sửa trực tiếp cơ sở dữ liệu**.

### Điều kiện trước
Người dùng đã đăng nhập; tài khoản `ACTIVE` và có vai `ADMIN`.

### Điều kiện sau
- Khóa: `status = LOCKED`, mọi access và refresh token của người bị khóa hết hiệu lực, một dòng nhật ký `LOCK_USER`. Giao diện hiện `Đã khóa` ở chi tiết và ở các trang danh sách đã tải, không cần tải lại trang.
- Mở khóa: `status = ACTIVE`, không phiên nào được khôi phục, một dòng nhật ký `UNLOCK_USER`.

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | Mở `/admin/users` | Kiểm phiên và vai; hiện trang 1, 20 tài khoản, tổng số lấy từ `total` |
| 1a | Gõ email, chọn trạng thái, vai, xác thực, sắp xếp hay số dòng | API lọc trên toàn bộ dữ liệu; URL giữ điều kiện; về trang 1 |
| 2 | Chọn một email | Mở `/admin/users/:id`, hiện sáu trường và thao tác được phép |
| 3 | Bấm Khóa tài khoản ở chi tiết, hay Khóa ngay trên dòng của danh sách | Mở hộp xác nhận nêu tác động; focus ở Hủy |
| 4 | Bấm xác nhận | Gửi đúng một yêu cầu; báo kết quả, cập nhật trạng thái, đưa focus tới thông báo |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | Chưa đăng nhập | Về `/login`, đăng nhập xong quay lại đúng địa chỉ nội bộ đã yêu cầu |
| E2 | Đăng nhập nhưng không có vai `ADMIN` | Trang "Không đủ quyền truy cập"; không gửi yêu cầu quản trị nào |
| E3 | Phiên hết hạn giữa chừng (401) | Làm mới phiên qua cơ chế chung; không được thì về đăng nhập |
| E4 | Mất vai `ADMIN` giữa phiên (403) | Hiện "Không đủ quyền", xóa dữ liệu quản trị đã tải; không đăng xuất tài khoản |
| E5 | Id sai dạng (400) hoặc không tồn tại (404) | "Không tìm thấy tài khoản", có đường về danh sách |
| E6 | Trạng thái vừa bị đổi ở nơi khác (409) | Báo trạng thái đã đổi, tải lại chi tiết và danh sách |
| E7 | Máy chủ từ chối (422, vd tự khóa) | Hiện lý do |
| E8 | Hết thời gian chờ, mất mạng hay 5xx khi khóa, mở khóa | Báo **chưa xác định kết quả**; cho kiểm lại bằng GET; không tự gửi lại |
| E9 | Phiên đổi (đăng xuất, đăng nhập khác, kể cả cùng tài khoản) khi yêu cầu đang chạy | Hủy yêu cầu; bỏ kết quả về muộn; không ghi vào phiên mới |
| E10 | Không tài khoản nào khớp bộ lọc | "Không có tài khoản phù hợp với bộ lọc", khác "Chưa có tài khoản nào"; có Xóa bộ lọc |
| E11 | Khóa hay mở khóa làm tài khoản rời bộ lọc đang xem | Dòng ghi "Không còn khớp bộ lọc" tới khi API trả tập mới; tổng và trang lấy lại từ API |
| E12 | Điều kiện trên URL sai dạng hay lặp | Bỏ giá trị sai, thay URL bằng bản chuẩn hóa; không gửi lên API |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Máy chủ quyết quyền (`RequireRoles(ADMIN)`); giao diện chỉ ẩn hay hiện |
| BR2 | Chỉ khóa tài khoản `ACTIVE`; chỉ mở khóa tài khoản `LOCKED` |
| BR3 | Không ai tự khóa chính mình (máy chủ trả 422) |
| BR4 | Giao diện không đưa nút khóa cho tài khoản có vai `ADMIN`. Máy chủ **chưa** chặn việc này; xem [README.md](README.md#còn-mở) |
| BR5 | Khóa chấm dứt mọi phiên; mở khóa không khôi phục phiên nào |
| BR6 | Chỉ hiển thị `id`, `email`, `status`, `roles`, `emailVerifiedAt`, `createdAt` |
| BR7 | Khóa, mở khóa không tự gửi lại; truy vấn không tự thử lại lỗi 4xx |
| BR8 | Tìm email là "chứa chuỗi", không phân biệt hoa thường; `%`, `_`, `\` và dấu nháy là ký tự thường |
| BR9 | Các bộ lọc kết hợp AND; vai là "có vai này" (tài khoản nhiều vai khớp mỗi vai); "chưa xác thực" là chưa có thời điểm xác thực email, không suy từ trạng thái |
| BR10 | Tổng và số trang luôn do máy chủ đếm theo đúng bộ lọc; giao diện không tự trừ |

### Đường dẫn
Giao diện: `/admin`, `/admin/users` với `q`, `status`, `role`, `verified`, `sort`, `page`, `pageSize` (bỏ giá trị
mặc định), `/admin/users/:id`; `/quan-tri` chuyển hướng
thay thế về `/admin` ([LOG#adr-027](../../LOG.md#adr-027)). API: `GET /api/admin/users`,
`GET /api/admin/users/:id`, `POST /api/admin/users/:id/lock`, `POST /api/admin/users/:id/unlock`.

### Dữ liệu
Không thêm bảng hay cột. Đọc `users`, `user_roles`; khóa, mở khóa ghi `users`, `refresh_tokens`, `audit_logs` như Admin.2.

### Tiêu chí chấp nhận
- [ ] **AC1** Đang khôi phục phiên chỉ thấy trạng thái tải, không dựng khung quản trị; khách về `/login` và quay
  lại đúng trang; người không có `ADMIN` thấy "Không đủ quyền truy cập" và không phát yêu cầu quản trị nào.
  Link Quản trị ở cửa hàng chỉ hiện cho `ADMIN`.
- [ ] **AC2** `/admin`, `/admin/users`, `/admin/users?page=N`, `/admin/users/:id` hoạt động khi mở trực tiếp;
  `/quan-tri` chuyển hướng thay thế về `/admin`, giữ query và hash. `page` chỉ nhận số nguyên dương an toàn;
  sai thì thay URL về `/admin/users`; vượt số trang thì hiện rỗng kèm link về trang hợp lệ. Quay lại từ chi
  tiết giữ trang đã xem.
- [ ] **AC3** Danh sách và chi tiết có đủ đang tải, lỗi có nút thử lại, rỗng hoặc không tìm thấy; chỉ hiện sáu
  trường của BR6; tổng số lấy từ `total`.
- [ ] **AC4** Nút Khóa chỉ hiện với tài khoản `ACTIVE`, không phải chính mình, không có vai `ADMIN`; tài khoản
  `LOCKED` có Mở khóa; các trường hợp còn lại có câu giải thích.
- [ ] **AC5** Hộp xác nhận nêu: đăng xuất khỏi mọi thiết bị, không đăng nhập được tới khi mở khóa, mở khóa không
  khôi phục phiên cũ. Hủy hoặc Esc trước khi gửi không gọi API. Thành công cập nhật cả chi tiết và danh sách.
- [ ] **AC6** Bấm hoặc Enter liên tiếp chỉ gửi một POST; khóa, mở khóa không tự thử lại; 401, 403, 400, 404,
  409, 422 xử lý theo E3–E7. 403 phải được ghi nhận trước khi mutation về sát nó có thể ghi lại cache,
  kể cả khi React chưa cập nhật giao diện.
- [ ] **AC7** Hộp xác nhận: focus vào Hủy khi mở, Tab và Shift+Tab vòng trong hộp, nền không tương tác, Esc
  đóng, focus về nút đã mở khi hủy và tới thông báo khi xong. Đang xử lý vẫn đóng được hộp mà không hủy thao
  tác. Hết giờ hoặc mất mạng: báo chưa rõ kết quả và cho kiểm lại bằng GET.
- [ ] **AC8** Đổi phiên hủy yêu cầu và xóa dữ liệu quản trị; dữ liệu và kết quả của actor cũ, hay của lần đăng
  nhập trước của cùng tài khoản, không hiện ở phiên mới; dữ liệu giữ chỗ khi chuyển trang không lấy từ actor khác.
- [ ] **AC9** Kiểm trên trình duyệt thật ở 360×740 và 1280×800, phóng 200%, chỉ bàn phím, email dài,
  `prefers-reduced-motion`; ghi rõ API giả hay thật.
- [ ] **AC10** `npm run check`, `npm run build -w apps/web`, docs lint đúng phạm vi và diff đạt; Bảo duyệt phần
  chung, Duy thống nhất mã UC; CI xanh trước khi gộp.

Bổ sung cho Issue #48, **đề xuất**, giữ nguyên AC1–AC10; số AC11–AC15 chờ Duy thống nhất:

- [ ] **AC11** API `GET /api/admin/users` nhận `q`, `status`, `role`, `verified`, `sort` theo BR8–BR10, tìm trên
  toàn bộ dữ liệu; bốn kiểu sắp xếp có tiêu chí phụ `id`; giá trị ngoài hợp đồng, tham số lặp hay `q` quá 254 ký
  tự trả 400; khách và `CUSTOMER` vẫn 401, 403 trước khi tham số được kiểm; chỉ trả sáu trường của BR6.
- [ ] **AC12** Ô tìm gửi sau khoảng 300 ms hay khi nhấn Enter, không gửi mỗi phím, và thay URL chứ không thêm lịch
  sử; đổi bộ lọc, sắp xếp, số dòng (10, 20, 50) về trang 1 và thêm lịch sử để Back quay lại; tải lại trang và quay
  lại từ chi tiết giữ đủ điều kiện; URL sai được chuẩn hóa (E12).
- [ ] **AC13** Phân biệt không có kết quả với chưa có tài khoản; Xóa bộ lọc giữ sắp xếp và số dòng; trang vượt số
  trang có đường về trang hợp lệ và không tự chuyển lặp.
- [ ] **AC14** Kết quả của điều kiện cũ về muộn không hiện và yêu cầu cũ bị hủy; đổi điều kiện không hiện tập cũ
  trong lúc chờ; dữ liệu giữ chỗ chỉ dùng khi cùng actor và cùng điều kiện, chỉ khác trang.
- [ ] **AC15** Khóa, mở khóa ngay trên dòng dùng chung luồng với chi tiết (AC5–AC8): hộp xác nhận, chặn bấm lặp và
  chặn thao tác khác khi đang chạy, hết giờ, 403, đổi phiên; sau khi xong tải lại tập, tổng và trang từ API (E11);
  focus về nút của dòng khi hủy, tới thông báo khi xong.

AC1–AC8 và AC11–AC15 ghi mã trong tên bài ở `apps/web/src/features/account/admin/*.test.ts(x)` và
`apps/api/test/admin-users-filters.http.spec.ts`; AC9 là minh chứng ở kho docs; AC10 là điều kiện gộp.

## Câu hỏi còn treo

- Mã `UC-02.1`, số AC1–AC15 khi PR #26 gộp. [TBD — hỏi Duy]
- Có cần chọn nhiều trạng thái hay vai cùng lúc không; API hiện từ chối tham số lặp. [TBD — hỏi Tài]
- Máy chủ có nên từ chối khóa tài khoản `ADMIN`, hay giữ ít nhất một quản trị viên hoạt động? Đề xuất mở Issue
  riêng; chưa có quyết định hay hạn xử lý. [TBD — hỏi Tài]

## Trình bày bổ sung cho AC9 — Issue #59, đề xuất

- Khung admin có sidebar Espresso, nội dung Ivory và panel trắng; Copper cho nút/focus, giữ token/phông/radius hiện có.
- Header có vị trí hiện tại và đường về cửa hàng; sidebar chỉ chứa Tổng quan, Người dùng, Đơn hàng đã hoạt động.
- Mobile dùng drawer có focus đầu vào Đóng, Tab/Shift+Tab vòng kín, Escape/điều hướng đóng và trả focus.
- Bộ lọc Users thu gọn trên mobile; đóng không xóa điều kiện, không tháo ô nhập đang debounce. Desktop mở mặc định.
- Bảng chuyển thành hàng có nhãn tại 360px; email/ID dài xuống dòng; thao tác chạm tối thiểu 44px.
- Kiểm thử widget hỗ trợ AC9; minh chứng trình duyệt, zoom và keyboard vẫn bắt buộc trước khi nghiệm thu.

Không thay AC1–AC8/AC11–AC15, guard, cache hay policy backend. Đây là yêu cầu trình bày đang triển khai trên nhánh riêng.
