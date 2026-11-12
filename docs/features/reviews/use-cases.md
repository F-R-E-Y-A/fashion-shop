---
title: UC-11 Đánh giá sản phẩm — đặc tả use case
updated: 2026-11-12
status: đề xuất, chờ Bảo duyệt; UC-11.3 là mã mới
owner: Bảo
---
# UC-11 · Đánh giá sản phẩm

**Chức năng:** Khách viết, sửa, xem, bình chọn, báo cáo đánh giá; quản trị duyệt và phản hồi: luồng, luật nghiệp vụ, tiêu chí chấp nhận có phân loại.

| | |
|---|---|
| **Người viết đặc tả** | Bảo cùng Claude Code, 12/11, viết ngược từ mã và bài kiểm thử trên nhánh `feature/ph-01-reviews`. UC-11.1, UC-11.2 theo danh mục của Duy ở [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26) (`46a238c`); **UC-11.3 là mã mới**, chờ Duy thêm vào danh mục |
| **Người sở hữu mã** | Bảo, module `reviews` (đọc `orders`, ghi điểm qua `products`, ảnh qua `uploads`) |
| **Tác nhân** | Khách vãng lai, Khách hàng (đã đăng nhập), Quản trị viên (`ADMIN`) |
| **Dữ liệu** | `reviews`, `review_media`, `review_helpful_votes`, `review_reports`; hai cột điểm trên `products` |
| **Quyết định** | [ADR-054](LOG.md#adr-054) luật đánh giá, [ADR-055](../uploads/LOG.md#adr-055) kho ảnh, [ADR-059](LOG.md#adr-059) khách xoá đánh giá |

Cách đọc: mỗi AC mang loại `thuận`, `âm` hoặc `biên` ([LOG#adr-047](../../LOG.md#adr-047)). AC có chữ "web" kiểm ở `apps/web/src/features/reviews/*.test.tsx`, còn lại kiểm ở `apps/api/test/*reviews*.http.spec.ts`. Ma trận bài nào kiểm AC nào: `npm run evidence:trace -- --uc UC-11`.

---

## UC-11.1 · Đánh giá và nhận xét sản phẩm

Là một **khách hàng đã nhận hàng**, tôi muốn **chấm sao, nhận xét, ghi độ vừa và đăng ảnh thật**, để **người mua sau biết sản phẩm ngoài đời ra sao**.

### Luồng chính
1. Đơn sang `DELIVERED`. Trang đơn hiện nút "Đánh giá N sản phẩm"; tab **Tài khoản → Đánh giá** liệt kê dòng đơn chờ đánh giá kèm hạn.
2. Khách chọn một dòng, chấm 1–5 sao, chọn độ vừa (Chật, Vừa vặn, Rộng), có thể ghi chiều cao, cân nặng, nhận xét, tối đa 5 ảnh, chọn ẩn tên.
3. Mỗi ảnh: web xin phiếu, tải thẳng lên kho ảnh, nhận khoá ảnh ([ADR-055](../uploads/LOG.md#adr-055)).
4. Khách gửi. Máy chủ kiểm quyền, kiểm từng ảnh trên kho, quyết định hiện ngay hay chờ duyệt (BR4), tính lại điểm sản phẩm nếu hiện ngay.
5. Web báo kết quả và chuyển sang tab "Đã đánh giá".
6. Ở tab "Đã đánh giá", khách sửa được một lần (BR5) hoặc xoá (BR9).

### Luồng phụ và ngoại lệ
- **E1** Dòng đơn của người khác hoặc không có: 404 như không tồn tại.
- **E2** Đơn chưa giao, đã hoàn toàn bộ hoặc đã hủy: 422 `REVIEW_NOT_ALLOWED`. Quá hạn: 422 `REVIEW_WINDOW_CLOSED`.
- **E3** Đã đánh giá dòng này: 409 `REVIEW_ALREADY_EXISTS`.
- **E4** Ảnh không thuộc thư mục của mình, chưa tải xong, sai định dạng hay quá 5 MB, gửi trùng: 422 `INVALID_MEDIA`. Kho ảnh lỗi: 503 `UPLOADS_UNAVAILABLE`. Máy chủ chưa bật kho ảnh: web ẩn ô chọn ảnh.
- **E5** Xoá đánh giá của người khác hoặc đã xoá: 404 `REVIEW_NOT_FOUND`. Web coi 404 khi xoá là đã xong (xoá ở tab khác) và tải lại danh sách.

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | Viết được khi dòng đơn là của chính khách, đơn ở `DELIVERED` hoặc `PARTIALLY_REFUNDED`, trong 30 ngày từ lần chuyển `DELIVERED` ([review-policy.ts:7](../../../apps/api/src/modules/reviews/review-policy.ts#L7), [:23](../../../apps/api/src/modules/reviews/review-policy.ts#L23)) |
| BR2 | Một dòng đơn một đánh giá: cột `order_item_id` unique |
| BR3 | Nhận xét tối đa 1500 ký tự, tối đa 5 ảnh, chiều cao 100–230 cm, cân nặng 25–250 kg; CHECK trong migration lặp lại các giới hạn này |
| BR4 | Chữ sạch và không ảnh thì hiện ngay. Có ảnh, hoặc chữ có link, số điện thoại, từ tục thì chờ duyệt ([review-policy.ts:94](../../../apps/api/src/modules/reviews/review-policy.ts#L94)) |
| BR5 | Sửa đúng một lần trong 30 ngày từ lúc viết, không sửa khi đã bị ẩn. Sửa xong duyệt lại theo BR4; thay ảnh thì ảnh cũ vào hàng xoá, worker xoá trên kho theo lô ([ADR-056](../uploads/LOG.md#adr-056)) |
| BR6 | Điểm sản phẩm chỉ tính đánh giá đang hiện, chưa xoá; trung bình làm tròn 2 chữ số |
| BR7 | Ẩn tên: hiện chữ cái đầu và cuối, ví dụ `N*****h`. Trang công khai không bao giờ có email hay mã người dùng |
| BR8 | Ảnh tải lên mà 24 giờ chưa gắn vào đánh giá thì bị xoá khỏi kho; gửi đánh giá kèm ảnh đang bị dọn thì 422, khách tải lại ảnh ([ADR-056](../uploads/LOG.md#adr-056)) |
| BR9 | Khách xoá đánh giá của mình lúc nào cũng được, kể cả bài chờ duyệt hay đã bị ẩn. Xoá mềm: dòng đơn giữ chỗ nên không viết lại được (409); ảnh vào hàng xoá; bài đang hiện thì điểm tính lại trong cùng giao dịch ([ADR-059](LOG.md#adr-059)) |

### Tiêu chí chấp nhận
- **AC1** (thuận) Chỉ dòng đơn đã giao mới đánh giá được; đơn hoàn một phần vẫn viết được, hoàn toàn bộ hoặc đang xét thanh toán (`PAYMENT_REVIEW`) thì 422; danh sách chờ kèm hạn 30 ngày; web: trang đơn mời đánh giá đúng số dòng còn chờ của đơn đó, đơn không còn dòng chờ thì không mời
- **AC2** (thuận) Chữ sạch không ảnh: hiện ngay, điểm sản phẩm cập nhật; mỗi dòng đơn một đánh giá, gửi hai lần cùng lúc cũng chỉ tạo một; bài đã xoá mềm vẫn giữ chỗ dòng đơn (409)
- **AC3** (âm) Dòng đơn của người khác: 404, không lộ dòng đó có tồn tại
- **AC4** (biên) Quá 30 ngày từ lúc giao: hết hạn, không còn trong danh sách chờ
- **AC5** (âm) Ảnh: chỉ ảnh trong thư mục của mình, đã tải xong, đúng định dạng; có ảnh thì chờ duyệt; kho ảnh lỗi khi kiểm thì 503 và không tạo đánh giá
- **AC6** (thuận) Chữ có số điện thoại, link hay từ tục: chờ duyệt thay vì hiện ngay
- **AC7** (biên) Sửa một lần trong hạn: duyệt lại, thay ảnh thì ảnh cũ vào hàng xoá, lần hai bị chặn; sửa đánh giá đang hiện thì điểm tính lại ngay; web: form điền sẵn nội dung cũ, không đổi ảnh thì không gửi trường ảnh; đánh giá bị ẩn hiện lý do và không còn nút sửa
- **AC8** (thuận) Ẩn danh che tên; trang công khai không có email hay mã người dùng
- **AC9** (âm) Dữ liệu sai (sao ngoài 1–5 hoặc số lẻ), kể cả trường lạ (`userId`, `moderationStatus`): 400
- **AC10** (thuận, web) Form kiểm trước khi gửi: chưa chọn sao, ảnh lỗi, ảnh đang tải; ảnh tải thẳng lên kho bằng phiếu, token của cửa hàng không đi sang kho; gửi xong chuyển sang tab "Đã đánh giá" kèm thông báo
- **AC11** (biên) Ảnh tải lên quá 24 giờ chưa gắn bị xoá khỏi kho theo lô tối đa 100 ảnh mỗi lệnh; ảnh mới 23 giờ 59 phút và ảnh đã gắn giữ nguyên; hai lượt dọn chồng nhau không xoá trùng; kho lỗi thì thử lại sau hạn thuê; ảnh đang bị dọn không gắn được (422)
- **AC12** (thuận) Khách xoá đánh giá của mình, kể cả bài chờ duyệt hay đã bị ẩn: gỡ khỏi trang công khai, trang của mình và hàng chờ quản trị; điểm tính lại; ảnh vào hàng xoá; dòng đơn không viết lại được (409), không sửa được (404); xoá đúng lúc quản trị duyệt thì điểm cuối cùng không tính bài đã xoá; web: hỏi lại kèm hậu quả, lỗi mạng thì báo trong hộp và giữ bài, bài đã xoá ở nơi khác (404) thì coi như xong
- **AC13** (âm) Xoá bài của người khác hoặc bài đã xoá: 404 `REVIEW_NOT_FOUND`, không lộ bài có tồn tại; chưa đăng nhập 401; mã sai 400

---

## UC-11.2 · Duyệt và phản hồi đánh giá

Là một **quản trị viên**, tôi muốn **duyệt đánh giá có ảnh hoặc nội dung cần xem, ẩn đánh giá vi phạm và trả lời khách**, để **trang sản phẩm sạch và khách thấy shop có lắng nghe**. Web: `/admin/reviews`.

| Mã | Quy tắc |
|---|---|
| BR1 | Ẩn bắt buộc lý do, tối đa 500 ký tự; người viết thấy lý do ở trang của mình |
| BR2 | Một đánh giá một phản hồi của shop, tối đa 1000 ký tự; gửi lại là sửa |
| BR3 | Mọi thao tác có đổi dữ liệu ghi `audit_logs` (`entity_type = 'REVIEW'`); thao tác không đổi gì thì không ghi |
| BR4 | Duyệt và ẩn gửi kèm `editCount` quản trị đã thấy; khác với hiện tại thì 409 `REVIEW_CHANGED` |
| BR5 | Báo cáo chỉ đánh dấu; quản trị quyết ẩn hay bỏ báo cáo |

### Tiêu chí chấp nhận
- **AC1** (âm) Chỉ `ADMIN`; mọi phản hồi `no-store`; web: 403 thay trang bằng thông báo không đủ quyền, không lộ dữ liệu
- **AC2** (thuận) Hàng chờ duyệt cũ nhất trước; duyệt thì hiện, tính điểm, ghi nhật ký đúng một lần; web: mặc định tab Chờ duyệt, duyệt xong báo và tải lại
- **AC3** (âm) Ẩn kèm lý do: điểm giảm, người viết thấy lý do và không sửa được nữa; ẩn lần hai 409; web: không có lý do thì không gửi
- **AC4** (thuận) Phản hồi của shop hiện trên trang công khai; sửa và gỡ được
- **AC5** (thuận) Lọc hàng bị báo cáo (web chuyển sang mọi trạng thái), xem lý do gần nhất, bỏ báo cáo sai
- **AC6** (thuận) Lọc theo số sao; tìm theo nội dung, email người viết, tên sản phẩm; `%` và `_` tìm đúng chữ
- **AC7** (biên) Khách sửa sau khi quản trị tải trang: duyệt hay ẩn bản cũ 409, không đổi gì; web đóng hộp, cảnh báo, tải lại để đọc bản mới

---

## UC-11.3 · Xem, bình chọn và báo cáo đánh giá (mã mới)

Là **người mua**, tôi muốn **xem điểm, phân bố sao, độ vừa và đánh giá có ảnh; đánh dấu đánh giá hữu ích hoặc báo cáo đánh giá vi phạm**, để **quyết định mua và chọn cỡ**. Web: khu `#danh-gia` cuối trang chi tiết, sao trên thẻ sản phẩm.

| Mã | Quy tắc |
|---|---|
| BR1 | Chỉ hiện đánh giá đã duyệt. Sắp xếp: hữu ích (mặc định), mới nhất, điểm cao, điểm thấp |
| BR2 | Mỗi người một phiếu hữu ích và một báo cáo cho mỗi đánh giá; không tự bình chọn hay báo cáo đánh giá của mình (422 `OWN_REVIEW`) |
| BR3 | Khu đánh giá chỉ tải khi gần vào màn hình, để trang chi tiết không chờ |

### Tiêu chí chấp nhận
- **AC1** (thuận) Tổng hợp: trung bình, phân bố 5 mức, có ảnh, có chữ, độ vừa; khớp điểm trên trang chi tiết và danh sách sản phẩm; web: bấm một mức sao thì lọc, bấm lại thì bỏ lọc
- **AC2** (thuận) Hữu ích: mỗi người một phiếu, bỏ phiếu được, đánh giá chưa duyệt thì 404; danh sách trả `isOwn`, `viewerHasVoted` theo người xem nên có `Cache-Control: no-store`; web: token hết hạn thì làm mới một lần rồi tải lại, đánh giá của mình không có nút bình chọn
- **AC3** (thuận) Báo cáo: đánh dấu cho quản trị, không tự ẩn; báo lại không tính thêm
- **AC4** (âm) Sản phẩm ẩn hoặc slug sai: 404 và 400 như trang chi tiết
- **AC5** (thuận, web) Khách vãng lai: chỉ tải khi mở khu đánh giá, không gửi token; bình chọn dẫn về đăng nhập rồi quay lại đúng trang
- **AC6** (thuận, web) Ảnh trong đánh giá: lưới chỉ tải bản thu nhỏ 160 px; bấm ảnh thì thư viện mở bản lớn
- **AC7** (biên) Chưa có đánh giá đã duyệt, kể cả khi chỉ có bài chờ duyệt hoặc bài duy nhất vừa bị ẩn: tổng hợp đủ 5 mức đều 0, trung bình 0, danh sách rỗng, điểm sản phẩm về 0; web chỉ báo "Chưa có đánh giá nào", không vẽ bảng sao; lọc một mức không có bài thì báo không có đánh giá khớp; bài đã xoá mềm không hiện ở danh sách và tổng hợp

---

## Câu hỏi còn treo
- Nhân viên (`STAFF`) có được duyệt không: chưa có vai này ([TECH_DEBT ND-03](../../TECH_DEBT.md)). `[TBD — hỏi Tài]`
- Đổi trả (`returns`) xong có tự ẩn đánh giá không: hiện không, vì khách vẫn đã dùng sản phẩm. `[TBD — hỏi Duy]`
