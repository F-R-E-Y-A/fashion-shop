# Cây tài liệu

Một quy tắc duy nhất: **tài liệu đi cùng mã nguồn trong cùng một pull request.** Không có chuyện làm xong hết rồi viết tài liệu vào tuần cuối, vì lúc đó không ai nhớ nữa và hội đồng đọc ra ngay.

| Nơi | Chứa gì | Ai giữ |
|---|---|---|
| `ba/uc-template.md` | Khuôn đặc tả use case, chép ra khi viết cái mới | Duy |
| `ba/uc-index.md` | Danh mục toàn bộ use case, một dòng mỗi cái | Duy |
| `ba/uc-NN-*.md` | Đặc tả từng use case, một tệp một use case | Người sở hữu phân hệ đó |
| `ba/data-model.md` | Từ điển dữ liệu và ghi chú ERD | Tài |
| `adr/` | Quyết định kiến trúc, mỗi quyết định một tệp, không sửa lại khi đã chốt | Bảo |
| `test-strategy.md` | Tầng kiểm thử, công cụ, độ phủ, quy trình xử lý lỗi | Duy |
| `CONTRIBUTING.md` | Luật làm việc chung và tám bước thêm một phân hệ | Bảo |
| `GIT_FLOW.md` | Quy ước nhánh, commit, pull request | Bảo |

## Đặt tên tệp use case

`uc-NN-ten-ngan.md`, trong đó `NN` là số thứ tự use case trên sơ đồ.

Lưu ý dễ nhầm: **mã use case trên sơ đồ khác mã dòng việc trong bảng chia việc.** Bảng chia việc dùng `PH-` cho phân hệ chức năng và `HT-` cho hạng mục nền tảng. Một dòng `PH-` có thể chứa vài use case, và một use case có thể trải trên hai dòng. Mỗi tệp đặc tả ghi rõ nó thuộc dòng việc nào ở phần đầu.
