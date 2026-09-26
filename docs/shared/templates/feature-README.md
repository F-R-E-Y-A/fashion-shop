---
title: Mẫu README của một feature
updated: 2026-09-24
status: đang dùng
owner: Bảo
---
# Mẫu `features/<module>/README.md`

**Chức năng:** Khung cửa vào của một feature: giải quyết việc gì, phạm vi tuần này, dữ liệu, API, giao diện, kiểm thử, trạng thái hôm nay.

Chép khung dưới khi bắt đầu một feature mới, cùng lúc tạo `LOG.md` trống có frontmatter. Mẫu đầy đủ: [features/products/README.md](../../features/products/README.md). Phần nào chưa có thì ghi "chưa làm", đừng bỏ trống mục.

````markdown
---
title: <Tên feature> — bản đồ
updated: YYYY-MM-DD
status: đang làm | đang dùng
owner: <ai>
---
# <Tên feature>

**Chức năng:** Cửa vào duy nhất của <feature>: giải quyết việc gì, phạm vi, dữ liệu, API, giao diện, kiểm thử và trạng thái hôm nay.

| | |
|---|---|
| **Người sở hữu** | <tên> · module `apps/api/src/modules/<x>` · `apps/web/src/features/<x>` · bảng trong `prisma/schema/<tệp>.prisma` |
| **Dòng việc** | <PH-NN (Issue #N, nhánh `feature/...`), sprint> |
| **Use case** | <UC-NN.a, UC-NN.b trong [use-cases.md](use-cases.md)> |

## Giải quyết việc gì
<2–4 câu: ai dùng, để làm gì, xong là thấy gì.>

## Phạm vi sprint này
| Hạng mục | Use case / tiêu chí | Phải có hay có thể trượt |
|---|---|---|

## Dữ liệu
<Bảng của mình, quan hệ với bảng người khác. Quyết định mô hình: LOG#adr-NNN.>

## API
<Đường dẫn mới đề xuất, theo shared/api.md. Cài xong thì xoá khỏi đây, Swagger là nguồn.>

## Hợp đồng với phân hệ khác
<Hàm công bố ở README của module trong mã; ở đây chỉ ghi ai chờ gì, hạn nào.>

## Giao diện
<Trang, đường dẫn trang, thành phần, trạng thái. Chuẩn chung ở shared/design.md, chỉ ghi phần riêng.>

## Kiểm thử và nghiệm thu
| Tiêu chí | Bài kiểm thử | Kết quả |
|---|---|---|

## Trạng thái hôm nay (YYYY-MM-DD)
<Cái gì đã chạy, ở môi trường nào, commit nào; cái gì đang chặn.>

## Còn mở
<Câu hỏi và nợ, kèm người trả lời.>
````
