---
title: Mẫu một mục trong LOG.md
updated: 2026-09-24
status: đang dùng
owner: Bảo
---
# Mẫu một mục trong `LOG.md`

**Chức năng:** Hai khung để chép vào cuối một LOG: mục *thay đổi* (có commit, có số đo) và mục *quyết định* (có phương án, có trạng thái).

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

### Kết quả mong đợi → thực tế
Mong đợi: <lệnh hoặc chỉ số kiểm, khi nào kiểm>.
Thực tế: <điền sau; ngày · bằng chứng · khớp không>.

### Điều kiện xem lại
<sự kiện nào thì mở lại quyết định này>
```

Số `NNN` là một dãy chung cho mọi LOG: `grep -rhoE "adr-[0-9]{3}" docs | sort | tail -1` rồi cộng một. Hai pull request cùng lấy một số thì người gộp sau đổi số của mình; `npm run docs:lint` báo số trùng.

Trạng thái đi theo thứ tự **đề xuất → đã chốt → thay thế bởi ADR-MMM → huỷ**. Chỉ người đổi trạng thái; agent chỉ viết `đề xuất`. Muốn đổi một quyết định đã chốt thì thêm mục mới, rồi sửa đúng dòng `Trạng thái` của mục cũ thành `thay thế bởi ADR-MMM`.
