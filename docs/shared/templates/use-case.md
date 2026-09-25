---
title: Mẫu đặc tả use case
updated: 2026-09-24
status: đang dùng
owner: Duy
---
# Mẫu `features/<module>/use-cases.md`

**Chức năng:** Khung để viết đặc tả các use case của một nhóm `UC-NN`, chép vào thư mục feature sở hữu nhóm đó.

Mỗi feature một tệp `use-cases.md` chứa mọi use case của nhóm mình. Chép khung dưới, xoá phần trong ngoặc nhọn. Mẫu thật: `features/products/use-cases.md` (có từ PH-01).

````markdown
---
title: UC-NN <Tên nhóm> — đặc tả use case
updated: YYYY-MM-DD
status: nháp | đã duyệt
owner: <người sở hữu mã>
---
# UC-NN · <Tên nhóm>

**Chức năng:** <Tác nhân làm được gì trong nhóm này; tối đa 25 từ.>

| | |
|---|---|
| **Người viết đặc tả** | |
| **Người sở hữu mã** | <tên>, module `<module>` |
| **Dòng việc** | <PH-NN làm UC-NN.a, UC-NN.b; phần còn lại chưa giao> |
| **Tác nhân chính** | |
| **Tác nhân phụ** | |

---

## UC-NN.m · <Tên use case>

### Câu chuyện người dùng
Là một **<vai>**, tôi muốn **<làm được gì>**, để **<đạt được điều gì>**.

### Điều kiện trước
<Hệ thống phải ở trạng thái nào thì use case này mới bắt đầu được>

### Điều kiện sau
<Chạy xong thành công thì dữ liệu và trạng thái thay đổi ra sao>

### Luồng chính
| Bước | Tác nhân làm | Hệ thống đáp |
|---|---|---|
| 1 | | |

### Luồng phụ và ngoại lệ
| Mã | Tình huống | Hệ thống xử lý |
|---|---|---|
| E1 | | |

### Quy tắc nghiệp vụ
| Mã | Quy tắc |
|---|---|
| BR1 | |

### Đường dẫn API cần có
<Phương thức, đường dẫn, mục đích, mã lỗi nghiệp vụ. Hình dạng vào ra theo `shared/api.md`; cài xong thì Swagger là nguồn, bảng này chỉ giữ tên.>

### Dữ liệu
<Bảng đụng tới, cột thêm mới, ràng buộc cần có.>

### Tiêu chí chấp nhận
- [ ] **AC1** <Viết sao cho người khác tự kiểm được, không cần hỏi lại>
- [ ] **AC2**

## Câu hỏi còn treo
<Ghi ra thay vì tự đoán. Mang tới buổi họp Chủ Nhật.>
````

Mã `E1`, `BR1`, `AC1` đánh lại từ 1 trong mỗi use case; nhắc từ nơi khác thì ghi đủ `UC-NN.m/AC1`. Tên bài kiểm thử ghi đúng mã đó ([testing.md](../testing.md)).
