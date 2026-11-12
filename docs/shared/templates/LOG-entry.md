---
title: Mẫu một mục trong LOG.md
updated: 2026-09-24
status: đang dùng
owner: Bảo
---
# Mẫu một mục trong `LOG.md`

**Chức năng:** Hai khung để chép vào cuối một LOG: mục *thay đổi* (có commit, có số đo) và mục *quyết định* (có phương án, trạng thái, phản biện, bằng chứng).

`docs/LOG.md` nhận quyết định chạm cả nhóm; `docs/features/<x>/LOG.md` nhận quyết định và thay đổi của một feature. Chỉ thêm vào cuối. Mẫu này chép từ cách làm đã chạy ổn ở một dự án khác của Bảo, rút gọn cho ba người.

## Mục thay đổi

Ghi khi một việc có mã xong và có điều đáng nhớ: số đo trước sau, chỗ lộ ra khi làm, nợ sinh ra. Việc thường ngày thì commit message là đủ, đừng chép sang LOG.

```markdown
## YYYY-MM-DD · <tên việc, một câu>

**Loại:** thay đổi mã | cấu hình | dữ liệu | triển khai · **Phạm vi:** <module, tầng> · **Commit:** [abc1234](https://github.com/F-R-E-Y-A/fashion-shop/commit/abc1234)

<2–5 câu: làm gì, vì sao phải làm, điều gì lộ ra khi làm.>

| Chỉ số (đo bằng lệnh nào) | Trước | Sau |
|---|---|---|
| | | |

Bằng chứng: `lệnh` → kết quả. Nợ sinh ra: `ND-NN`. Tài liệu đã sửa theo: <tệp>.
```

## Mục quyết định

```markdown
<a id="adr-NNN"></a>
## YYYY-MM-DD · ADR-NNN — <tiêu đề là chính quyết định, câu khẳng định>

**Loại:** quyết định · **Phạm vi:** <ai và phần nào bị ảnh hưởng> · **Trạng thái:** đề xuất · **Người quyết:** <ai> · **Commit:** (điền khi thi hành)

### Hiện trạng
<mỗi nhận định kèm đường dẫn:dòng hoặc lệnh đo; suy luận ghi "(suy luận)">

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. … | | | |
| **B. … (chọn)** | | | |
| Không làm gì | | | |

**Chọn B** vì <…>. Trade-off chấp nhận: <…>.

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| Câu hỏi phản biện | <ai hỏi, hỏi gì> | |
| AI gợi ý | <công cụ và bản: gợi ý gì> | giữ · bỏ · sửa |
| AI sai | <sai gì; mã `H-NN` trong sổ lỗi AI ở kho docs> | <ai bắt, bắt bằng gì> |
| Người phản biện | <ai, nói gì> | |

**Kết luận:** <một câu>.
**Bằng chứng:** [<tệp>:<dòng>](https://github.com/F-R-E-Y-A/fashion-shop/blob/<mã-commit>/<đường-dẫn>#L<dòng>) · `lệnh` → kết quả.

### Kết quả mong đợi → thực tế
Mong đợi: <lệnh hoặc chỉ số kiểm, khi nào kiểm>.
Thực tế: <điền sau; ngày · bằng chứng · khớp không>.

### Điều kiện xem lại
<sự kiện nào thì mở lại quyết định này>
```

Số `NNN` là một dãy chung cho mọi LOG: `grep -rhoE "adr-[0-9]{3}" docs | sort | tail -1` rồi cộng một. Hai pull request cùng lấy một số thì người gộp sau đổi số của mình; `npm run docs:lint` báo số trùng.

Trạng thái đi theo thứ tự **đề xuất → đã chốt → thay thế bởi ADR-MMM → huỷ**. Chỉ người đổi trạng thái; agent chỉ viết `đề xuất`. Muốn đổi một quyết định đã chốt thì thêm mục mới, rồi sửa đúng dòng `Trạng thái` của mục cũ thành `thay thế bởi ADR-MMM`.

## Mục Phản biện: ghi gì, không ghi gì

- **Ghi đúng những gì đã xảy ra**, hàng nào không có thì bỏ hàng đó; không bịa cho đủ bảng. Người phản biện có thể là thành viên, giảng viên, hoặc một agent khác.
- **AI sai** là khi AI khẳng định hay đề xuất một điều mà bằng chứng cho thấy sai. Lỗi đáng rút kinh nghiệm thì cấp mã `H-NN` trong `ai-log/hallucinations.md` ở [kho docs](https://github.com/F-R-E-Y-A/docs), ở đây chỉ nhắc mã.
- **Bằng chứng là link theo mã commit đã đẩy**, trỏ tới đúng tệp và dòng (`/blob/<mã>/<tệp>#L<dòng>`), bấm vào là thấy. Commit chưa đẩy thì link trả 404: đẩy xong mới điền.
- **Quyết định cũ đã ghi thì không sửa**: bổ sung phản biện bằng một mục mới ở cuối LOG, nhắc neo `#adr-NNN` của mục cũ.
- Nhật ký tuần ở kho docs viết lại cho dễ đọc và **dẫn link về mục LOG**, không chép nguyên.
