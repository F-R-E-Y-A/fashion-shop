# Quy ước nhánh và commit

## Cây nhánh

```
main                      chỉ chứa bản đã nộp hoặc đã triển khai thật
└── develop               nhánh tích hợp, mọi feature gộp vào đây
    ├── feature/ph-03-catalog          một phân hệ, một người
    │   ├── task/catalog-schema        việc con, gộp vào feature cha rồi xóa
    │   └── task/catalog-list-page
    ├── feature/ht-05-event-platform
    ├── bugfix/cart-total-sai          sửa lỗi phát hiện lúc duyệt chéo
    └── release/v1.0                   cắt ra khi kết thúc một chặng
```

`hotfix/` cắt thẳng từ `main`, chỉ dùng khi bản đã triển khai bị lỗi nặng.

## Đặt tên

| Loại | Mẫu | Ví dụ |
|---|---|---|
| Phân hệ | `feature/<mã viết thường>-<tên ngắn>` | `feature/ph-08-payment` |
| Việc con | `task/<tên ngắn>` | `task/payment-callback-idempotent` |
| Sửa lỗi | `bugfix/<tên ngắn>` | `bugfix/order-total-lech` |
| Phát hành | `release/v<số>` | `release/v1.0` |

Tên viết thường, không dấu, nối bằng gạch ngang.

## Commit

```
<loại>: <mô tả ngắn, không viết hoa đầu, không chấm cuối>
```

Loại dùng: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.

```
feat: them bo loc theo danh muc o trang san pham
fix: sua tong tien gio hang khi bo mot dong hang
docs: bo sung dac ta uc-05 gio hang
```

## Luồng làm một phân hệ

```bash
git switch develop && git pull
git switch -c feature/ph-03-catalog

# chẻ việc con nếu thấy cần
git switch -c task/catalog-schema
# ... viết mã ...
git add . && git commit -m "feat: them bang san pham va bien the"
git switch feature/ph-03-catalog && git merge task/catalog-schema
git branch -d task/catalog-schema

# xong cả phân hệ
git push -u origin feature/ph-03-catalog
# mở pull request vào develop trên GitHub
```

## Luật gộp

- Pull request vào `develop` cần **một người khác duyệt** và **CI xanh**.
- Tệp `CODEOWNERS` tự gán người duyệt theo thư mục. Chạm vào thư mục người khác thì chính họ phải duyệt.
- Không đẩy thẳng vào `develop` và `main`. Bật khóa nhánh trên GitHub ngay tuần đầu.
- Nhánh đã gộp thì xóa, đừng để tồn đọng.

## Sprint và milestone

Mỗi sprint là một milestone trên GitHub, tên theo tuần, ví dụ `S3 · 28/09 - 03/10`. Phiếu công việc gắn vào milestone tương ứng để nhìn ra tiến độ tuần mà không cần mở bảng kế hoạch.
