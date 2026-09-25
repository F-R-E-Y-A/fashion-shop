# Tài liệu nghiệp vụ: đặt ở đâu, đặt tên thế nào

Thư mục này nằm trong **kho mã**, không nằm trong kho tài liệu. Lý do: đặc tả use case và từ điển dữ liệu phải sửa **cùng lúc** với mã trong một pull request, nếu tách ra hai kho thì chúng lệch nhau sau vài tuần.

## Cái gì để đâu

| Thứ cần nộp | Đặt ở | Ai giữ |
|---|---|---|
| Sơ đồ use case tổng quan | `diagrams/uc-tong-quan.drawio.png` | Duy |
| Danh mục use case, mỗi use case một dòng | `uc-index.md` | Duy |
| Đặc tả từng use case | `uc-NN-ten-ngan.md`, chép từ `uc-template.md` | Người sở hữu phân hệ |
| Sơ đồ quan hệ thực thể | `diagrams/erd-tong-the.drawio.png` | Tài |
| Từ điển dữ liệu, quy ước đặt tên, ràng buộc | `data-model.md` | Tài |
| Sơ đồ hoạt động, sơ đồ tuần tự | `diagrams/<loại>-<tên>.drawio.png` | Người sở hữu luồng đó |

![Sơ đồ quan hệ thực thể HT-02](diagrams/erd-tong-the.drawio.png)

Sơ đồ đặt trong `diagrams/`, mô tả bằng chữ đặt ở tệp `.md` tương ứng và **nhúng ảnh vào đó**:

```markdown
![Sơ đồ quan hệ thực thể](diagrams/erd-tong-the.drawio.png)
```

## Vì sao dùng đuôi `.drawio.png`

Tệp `.drawio.png` **vừa là ảnh PNG thật vừa là tệp nguồn**. Hệ quả:

- GitHub hiện nó ngay trong trang, người duyệt pull request nhìn thấy sơ đồ mà không phải tải về.
- Mở lại bằng draw.io là sửa được tiếp, không cần giữ thêm tệp nguồn riêng.
- Dán thẳng vào báo cáo Word được.

Chỉ một tệp nên **không bao giờ có chuyện ảnh và nguồn lệch nhau**, lỗi rất hay gặp khi giữ `.drawio` và `.png` thành hai tệp.

Dùng công cụ khác thì giữ **cả nguồn lẫn ảnh xuất ra**, cùng tên, ví dụ `erd-tong-the.puml` và `erd-tong-the.png`, và sửa cái nào thì xuất lại cái kia trong cùng pull request.

## Ba luật khi vẽ sơ đồ

**1. Mã trên sơ đồ phải khớp mã trong bảng chia việc.** Bảng dùng `PH-` cho phân hệ chức năng và `HT-` cho hạng mục nền tảng. Bản nháp `uc-diagram-nhap.md` còn dùng mã `UC-` cũ, cần đồng bộ.

**2. Sơ đồ phải khớp mã nguồn.** Rubric TC2.1 mức cao nhất đòi sơ đồ khớp 100% khi hội đồng đối chiếu ngẫu nhiên. Tên bảng trên sơ đồ quan hệ thực thể phải đúng tên trong `prisma/schema/*.prisma`. Đổi lược đồ thì sửa sơ đồ trong cùng pull request.

**3. Một use case một tệp.** Đừng gom nhiều use case vào một tệp dài, vì như vậy hai người sửa hai use case khác nhau sẽ đụng nhau khi gộp.

## Nộp lên bằng cách nào

Từ thư mục kho mã, cắt nhánh từ `develop`:

```powershell
git switch develop ; git pull ; git switch -c feature/ht-02-erd
```

Thêm tệp, commit theo đúng quy ước, đẩy lên rồi mở pull request:

```powershell
git add docs/ba ; git commit -m "docs(ht-02): them so do quan he thuc the va tu dien du lieu"
```

```powershell
git push -u origin feature/ht-02-erd
```

```powershell
gh pr create --base develop --fill
```

Trong phần thân pull request ghi `Closes #<số phiếu>` để gộp xong phiếu tự đóng.

Tên nhánh theo `GIT_FLOW.md`: `feature/<mã viết thường>-<tên ngắn>`.
