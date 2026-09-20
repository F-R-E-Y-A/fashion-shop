# Cây tài liệu

Một quy tắc duy nhất: **tài liệu đi cùng mã nguồn trong cùng một pull request.** Không có chuyện làm xong hết rồi viết tài liệu vào tuần cuối, vì lúc đó không ai nhớ nữa và hội đồng đọc ra ngay.

## Kho này giữ gì, kho docs giữ gì

Thư mục này chỉ chứa **tài liệu nói về mã**: quy ước viết mã, quy ước API, cách chạy kiểm thử, quyết định kiến trúc, đặc tả use case. Chúng trích dẫn đường dẫn và số dòng nên phải sống cùng mã, và phải được sửa trong cùng pull request với thay đổi mã.

Kế hoạch, sổ tiến độ, nhật ký AI, minh chứng và báo cáo nộp khoa nằm ở kho riêng: [`F-R-E-Y-A/docs`](https://github.com/F-R-E-Y-A/docs).

Ranh giới để khỏi phải đoán: **tài liệu nào phải sửa cùng lúc với một thay đổi mã thì thuộc kho này.**

## Đọc gì trước

| Bạn là | Đọc theo thứ tự |
|---|---|
| Người mới vào kho | **`CODE_TOUR.md` trước tiên**, rồi `CONTRIBUTING.md` → `GIT_FLOW.md` → module mẫu `apps/api/src/modules/products/README.md` |
| Sắp viết phân hệ đầu tiên | `CODING_CONVENTION.md` → `api-conventions.md` → `testing.md` |
| Muốn hiểu vì sao kiến trúc thế này | `adr/` theo thứ tự số |
| Lo phần chấm điểm | README của [kho docs](https://github.com/F-R-E-Y-A/docs) |

## Bản đồ

| Nơi | Chứa gì | Ai giữ |
|---|---|---|
| **`CODE_TOUR.md`** | **Hướng dẫn đọc cả kho mã: đường đi của một yêu cầu, mỗi tệp làm gì và bỏ đi thì sao, bảy cơ chế và lý do, mười hai câu tự kiểm** | Bảo |
| `CONTRIBUTING.md` | Luật làm việc chung, các bước thêm một phân hệ, quyền sở hữu bảng | Bảo |
| `GIT_FLOW.md` | Quy ước nhánh, commit, pull request | Bảo |
| `CODING_CONVENTION.md` | Quy ước viết mã, phần máy không kiểm được | Bảo |
| `api-conventions.md` | Đường dẫn, phân trang, khuôn lỗi, kiểu dữ liệu | Bảo |
| `testing.md` | Chạy kiểm thử thế nào, viết ở đâu, khuôn nào chép | Bảo |
| `test-strategy.md` | Tầng kiểm thử, độ phủ, quy trình xử lý lỗi | Duy |
| `TECH_DEBT.md` | Nợ kỹ thuật: biết mà cố ý chưa làm, kèm hạn xử lý | Bảo |
| `PLATFORM_ROADMAP.md` | Đánh giá kiến trúc và lộ trình nền tảng theo từng bản | Bảo |
| `adr/` | Quyết định kiến trúc, mỗi quyết định một tệp, không sửa lại khi đã chốt | Bảo |
| `ops/github-setup.md` | Sổ tay dựng và cấu hình hai kho GitHub: quyền, nhánh, nhãn, milestone, pull request đầu tiên | Bảo |
| `ops/staging.md` | Dựng và vận hành môi trường thử | Bảo |
| `ba/uc-template.md` | Khuôn đặc tả use case, chép ra khi viết cái mới | Duy |
| `ba/uc-index.md` | Danh mục toàn bộ use case, một dòng mỗi cái | Duy |
| `ba/uc-NN-*.md` | Đặc tả từng use case, một tệp một use case | Người sở hữu phân hệ |
| `ba/data-model.md` | Từ điển dữ liệu và ghi chú sơ đồ quan hệ thực thể | Tài |
| `ba/uc-diagram-nhap.md` | Bản nháp sơ đồ use case, còn dùng mã `UC-` cũ, cần đồng bộ sang `PH-` | Duy |

## Ba loại tài liệu, đừng trộn

| Loại | Sửa được không | Ví dụ |
|---|---|---|
| Luật và quy ước | Sửa tại chỗ khi luật đổi | `CONTRIBUTING.md`, `CODING_CONVENTION.md` |
| Quyết định | **Không.** Đổi ý thì viết ADR mới, ADR cũ ghi bị thay thế | `adr/` |
| Đặc tả nghiệp vụ | Sửa tại chỗ, đi cùng mã trong một pull request | `ba/` |

Quy tắc phân biệt: **cái gì trả lời "vì sao" thì thuộc ADR.** Tài liệu loại khác cần lý do thì trỏ sang ADR, đừng chép lại, vì hai bản sao sẽ lệch nhau.

## Đặt tên tệp use case

`uc-NN-ten-ngan.md`, trong đó `NN` là số thứ tự use case trên sơ đồ.

Lưu ý dễ nhầm: **mã use case trên sơ đồ khác mã dòng việc trong bảng chia việc.** Bảng chia việc dùng `PH-` cho phân hệ chức năng và `HT-` cho hạng mục nền tảng. Một dòng `PH-` có thể chứa vài use case, và một use case có thể trải trên hai dòng. Mỗi tệp đặc tả ghi rõ nó thuộc dòng việc nào ở phần đầu.
