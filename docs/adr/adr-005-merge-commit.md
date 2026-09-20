# ADR-005. Gộp pull request bằng merge commit, không dùng squash

- **Ngày**: 20/09/2026
- **Trạng thái**: Đã chốt
- **Người quyết định**: Bảo, sau khi phản biện cấu hình ban đầu

## Bối cảnh

Cấu hình ban đầu của kho mã đặt squash làm cách gộp duy nhất, với ba lý do nghe hợp lý: lịch sử `develop` đọc như danh sách việc đã xong; hai bạn không cần biết `git rebase -i`; và gỡ một phân hệ hỏng chỉ mất một lệnh `git revert`.

Bảo đặt lại câu hỏi: lịch sử sạch đến mức mỗi tuần chỉ có ba commit thì **có đáng ngờ không**, khi hội đồng cần thấy quá trình làm việc, và khi tài liệu của nhóm đang trích dẫn mã commit để đối chiếu?

Câu hỏi đó đúng, và nó phơi ra một khiếm khuyết thật.

## Khiếm khuyết đã đo được

**Squash xoá commit hằng ngày khỏi nhánh chính.** Dựng một kho thử mô phỏng một tuần làm việc của một người, năm commit từ 22/09 tới 26/09, rồi gộp theo hai cách:

| Cách gộp | Số commit còn thấy trên `develop` | Ngày làm việc |
|---|---|---|
| Squash | 1 | Chỉ còn ngày gộp là 27/09 |
| Merge commit | 6 | Giữ nguyên 22, 23, 24, 25, 26/09 |

**Tài liệu của nhóm sẽ trỏ vào commit không còn tồn tại.** Sổ lỗi AI trong kho tài liệu đang trích dẫn ba mã commit tổng cộng chín lần: `44e3d57` ba lần, `c9a015a` bốn lần, `6a5e623` hai lần. Cả ba đều nằm trên nhánh `feature/platform`, chưa có trên `develop`. Squash sẽ gom chúng thành một commit mang mã hoàn toàn mới.

Commit gốc không mất hẳn, GitHub vẫn giữ chúng gắn với pull request. Nhưng `git clone` **không** tải các tham chiếu đó về. Hệ quả: hội đồng clone kho mã rồi chạy `git show c9a015a` sẽ không tìm thấy, trong khi tài liệu nộp kèm khẳng định mã đó tồn tại.

Rubric gọi tình huống này là **quy tắc chặn G4**: kê khai trong nhật ký sử dụng AI mâu thuẫn với lịch sử Git, tiêu chí TC2.3 nhận 0 điểm và kích hoạt quy trình xác định đạo văn ở Mục 6. Đây là rủi ro nặng nhất mà một lựa chọn cấu hình có thể gây ra.

## Quyết định

Gộp pull request bằng **merge commit**. Tắt hẳn squash và rebase trên cả hai kho.

```
gh repo edit <kho> --enable-merge-commit=true --enable-squash-merge=false --enable-rebase-merge=false --delete-branch-on-merge=true
```

Hai góc nhìn vào cùng một lịch sử, chọn bằng một tham số:

```bash
git log --first-parent --oneline develop   # danh sach moc viec lon
git log --oneline develop                  # toan bo commit hang ngay
```

## Lý do

**Không mất gì so với squash.** Ba lý do ban đầu đều được giữ nguyên:

| Lý do ban đầu | Merge commit có đáp ứng không |
|---|---|
| Lịch sử `develop` đọc như danh sách việc đã xong | Có. `git log --first-parent` cho đúng góc nhìn đó, đã kiểm |
| Hai bạn không cần biết `git rebase -i` | Có. Merge commit cũng không đòi rebase. Lý do này vốn không phân biệt hai cách |
| Gỡ một phân hệ hỏng bằng một lệnh | Có. `git revert -m 1 <mã merge commit>` gỡ trọn cả nhánh, đã kiểm, mã thoát 0 |

**Được thêm ba thứ.** Ngày làm việc thật được giữ, nên chỉ số "tỷ lệ tuần có commit" phản ánh đúng quá trình. Mã commit trích trong tài liệu vẫn hợp lệ sau khi gộp. Và người đọc thấy được một phân hệ được làm trong bao nhiêu ngày, theo thứ tự nào.

**Nguyên tắc rút ra, áp cho cả dự án:** thứ gì là bằng chứng thì không được tối ưu cho đẹp. Lịch sử Git ở đồ án này không chỉ là công cụ của người viết mã, nó là hồ sơ nộp kèm. Làm nó gọn bằng cách xoá bớt là làm hỏng chính thứ nó phải chứng minh.

## Hệ quả

Chấp nhận:

- `git log develop` không còn phẳng, các commit của ba người đan xen theo ngày. Đổi lại có `--first-parent` khi cần gọn, và `--graph` khi cần thấy hình dạng nhánh.
- Số commit trên `develop` sẽ lên tới hàng trăm vào cuối kỳ. Đó là con số đúng, không phải con số xấu.

Được lại:

- Mọi mã commit trích trong tài liệu vẫn tra được sau khi gộp, bằng một lần `git clone` bình thường.
- Chỉ số tuần có commit và độ trải đều của công việc đo được trực tiếp trên nhánh chính.

Vẫn an toàn khi xoá nhánh sau khi gộp: merge commit khiến mọi commit của nhánh thành tổ tiên của `develop`, nên xoá tên nhánh không mất commit nào. Khác hẳn trường hợp squash.

## Phương án đã cân nhắc và bỏ

| Phương án | Vì sao bỏ |
|---|---|
| Squash cho mọi pull request | Xoá commit hằng ngày khỏi nhánh chính, làm hỏng mã commit đã trích trong tài liệu, rơi vào quy tắc chặn G4 |
| Bật cả squash lẫn merge commit, ai thích dùng gì thì dùng | Ba người sẽ chọn khác nhau, lịch sử thành nửa nọ nửa kia, và không ai biết mã commit nào còn hợp lệ |
| Rebase rồi gộp nhanh | Giữ được commit nhưng viết lại toàn bộ mã commit của chúng, tức là phá đúng thứ ADR này muốn bảo vệ. Lại còn đòi hai bạn thạo rebase |
| Squash nhưng giữ lại nhánh, không xoá | Commit vẫn còn nhưng nằm ngoài nhánh chính, muốn tìm phải biết trước tên nhánh. Cuối kỳ có hơn ba mươi nhánh treo |
