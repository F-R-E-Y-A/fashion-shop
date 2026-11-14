---
title: Quy ước nhánh, commit, pull request và phiếu công việc
updated: 2026-11-01
status: đang dùng
owner: Bảo
---
# Quy ước nhánh và commit

**Chức năng:** Đặt tên nhánh và commit thế nào, gộp pull request theo luật nào, tìm và đóng phiếu công việc ra sao.

## Cây nhánh

```
main                      chỉ chứa bản đã nộp hoặc đã triển khai thật
└── develop               nhánh tích hợp, mọi feature gộp vào đây
    ├── feature/ph-01-product-catalog    một dòng việc, một người; giữ tới khi chủ nhánh xoá
    │   ├── task/catalog-schema        việc con, gộp vào feature cha rồi xóa
    │   └── task/catalog-list-page
    ├── feature/platform               nhánh DÀI HẠN của nền tảng, không xoá
    │   └── task/docs-restructure      việc nền tảng, gộp vào feature/platform rồi xoá
    ├── bugfix/cart-total-sai          sửa lỗi phát hiện lúc duyệt chéo
    └── release/v1.0                   cắt ra khi kết thúc một chặng
```

`hotfix/` cắt thẳng từ `main`, chỉ dùng khi bản đã triển khai bị lỗi nặng.

## Đặt tên

| Loại | Mẫu | Ví dụ |
|---|---|---|
| Dòng việc | `feature/<mã việc viết thường>-<tên ngắn>` | `feature/ph-02-cart` |
| Việc con | `task/<tên ngắn>` | `task/payment-callback-idempotent` |
| Sửa lỗi | `bugfix/<tên ngắn>` | `bugfix/order-total-lech` |
| Phát hành | `release/v<số>` | `release/v1.0` |

Tên viết thường, không dấu, nối bằng gạch ngang.

## Commit

```
<loại>(<mã việc, tuỳ chọn>): <mô tả ngắn, không dấu, không viết hoa đầu, không chấm cuối>
```

Loại dùng: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`, `revert`. Phạm vi viết thường. Hook `commit-msg` (`tools/git/check-commit-msg.mjs`) chặn commit sai dạng.

```
feat(ph-01): them bang bien the san pham theo co va mau
fix(ph-02): sua tong tien gio hang khi bo mot dong hang
docs(ht-01): doi ma use case sang UC-NN.m
```

Commit có phần do AI sinh thêm dòng cuối `Co-Authored-By: <công cụ> <địa chỉ>`, và `AI-Assisted: <phạm vi>` khi phần AI sinh đáng kể. Luật đầy đủ ở `ai-log/README.md` trong [kho docs](https://github.com/F-R-E-Y-A/docs).

**Ngoại lệ đã xảy ra, không phải luật mới:** Bảo dặn ngày 29/09 commit PH-01 đợt 2 không có hai trailer trên (`work/PROMPT-GLM-ph01-dot2.md:16`, workspace ngoài kho mã). Nhật ký W40 vẫn kê khai Claude/Codex bằng transcript, diff và commit. Không suy ra "không dùng AI" từ việc thiếu trailer và không sửa lại lịch sử chỉ để bổ sung dấu.

## Luồng làm một phân hệ

```bash
git switch develop && git pull
git switch -c feature/ph-01-product-catalog

# chẻ việc con nếu thấy cần
git switch -c task/catalog-schema
# ... viết mã ...
git add . && git commit -m "feat(ph-01): them bang san pham va bien the"
git switch feature/ph-01-product-catalog && git merge task/catalog-schema
git branch -d task/catalog-schema

# xong cả phân hệ
git push -u origin feature/ph-01-product-catalog
# mở pull request vào develop trên GitHub
```

## Luật gộp

- Pull request vào `develop` cần **CI xanh** và **một người duyệt bất kỳ, tự nguyện**; tác giả không tự duyệt pull request của mình.
- Từ 24/10/2026 **bỏ gán người duyệt theo `CODEOWNERS`** ([LOG](../LOG.md#bo-gan-nguoi-duyet)): sau PH-11 ba người cùng chấm nhiều phân hệ đan xen, gán cứng theo thư mục làm dồn người duyệt và chậm tính năng. Ai hiểu ngữ cảnh thì duyệt; bản đồ sở hữu vùng làm việc vẫn ở [README docs](../README.md) mục 1.
- Không đẩy thẳng vào `develop` và `main`. Hook `pre-push` chặn sẵn.
- **Gộp bằng merge commit, không dùng squash.** Squash xoá mọi commit hằng ngày khỏi nhánh chính, mà lịch sử Git ở đồ án này là hồ sơ nộp kèm chứ không chỉ là công cụ. Lý do đầy đủ ở [LOG#adr-005](../LOG.md#adr-005).
- Nhánh đã gộp thì xóa: `task/` sau khi gộp vào nhánh feature cha, `bugfix/` sau khi gộp vào `develop`. An toàn, vì merge commit khiến mọi commit của nhánh thành tổ tiên của nhánh đích.
- **`feature/ph-NN-*` giữ lại sau khi gộp vào `develop`**, chỉ xoá khi chủ dòng việc chủ động yêu cầu ([LOG#adr-045](../LOG.md#adr-045), đề xuất). Việc tiếp theo của dòng việc vẫn đi `task/` vào nhánh đó; trước khi làm tiếp, gộp `develop` ngược lại vào nhánh để không lệch. Agent không tự xoá và không tự mở nhánh `feature/` mới cho việc nhỏ của một dòng việc đã có nhánh.
- **Ngoại lệ: `feature/platform` là nhánh dài hạn**, không xoá. Việc nền tảng làm trên `task/<tên>` tách từ `feature/platform`, gộp vào đó bằng merge commit, rồi mở pull request `feature/platform` → `develop`. Sau mỗi lần gộp vào `develop`, gộp `develop` ngược lại vào `feature/platform` để hai nhánh không lệch. Lý do: [LOG.md](../LOG.md) mục ngày 25/09.
- Pull request vào `feature/platform` (và mọi `feature/**`) **có CI** từ 14/11, nhưng không chặn gộp vì nhánh feature không có ruleset: CI đỏ thì sửa trước khi tự gộp. CI chặn thật ở bước `feature/platform` → `develop`. `Closes #N` cũng chỉ tự đóng Issue ở bước đó, vì GitHub chỉ đóng khi gộp vào nhánh mặc định.

## Hai cách đọc lịch sử

```bash
git log --first-parent --oneline develop   # chi cac moc viec lon, dung khi bao cao tien do
git log --oneline develop                  # toan bo commit hang ngay, dung khi soi qua trinh
git log --graph --oneline --all            # hinh dang nhanh
```

## Phiếu công việc: ở đâu, số mấy, đóng thế nào

### Tìm phiếu của mình ở đâu

Phiếu công việc là **GitHub Issues**, nằm ở tab **Issues** trên trang kho mã:

`https://github.com/F-R-E-Y-A/fashion-shop/issues`

Ba cách tìm nhanh phiếu của mình:

| Cách | Làm gì |
|---|---|
| Trên web | Tab **Issues**, bấm bộ lọc **Assignee** rồi chọn tên mình |
| Trên web, xem cả sprint | Tab **Issues**, bấm **Milestones**, chọn sprint đang chạy |
| Dòng lệnh | `gh issue list -R F-R-E-Y-A/fashion-shop --assignee @me` |

Xem chi tiết một phiếu: `gh issue view 3 -R F-R-E-Y-A/fashion-shop`

### Số phiếu lấy ở đâu

Số nằm ngay cạnh tiêu đề, dạng `#3`, và cũng là số cuối trong địa chỉ:

```
https://github.com/F-R-E-Y-A/fashion-shop/issues/3
                                                 ↑ so phieu
```

### Đóng phiếu bằng cách nào

**Viết `Closes #<số>` vào phần thân pull request.** Không cần viết vào từng commit.

Khi pull request được gộp vào `develop`, GitHub **tự đóng** phiếu đó và nối hai thứ lại với nhau, nên về sau mở phiếu ra là thấy ngay pull request nào đã làm xong nó.

```bash
gh pr create --base develop --title "PH-01: trung bay san pham" --body "Closes #6

Lam duoc gi: ..."
```

Quên lúc tạo thì sửa sau cũng được, bằng cách bấm **Edit** ở phần mô tả pull request rồi thêm dòng đó vào.

Kiểm xem đã nối chưa: mở pull request, cột bên phải mục **Development** phải hiện tên phiếu. Hoặc chạy:

```bash
gh pr view 2 -R F-R-E-Y-A/fashion-shop --json body --jq '.body' | grep -i "closes #"
```

**Vì sao cách này chạy được ở kho của nhóm.** GitHub chỉ tự đóng phiếu khi pull request được gộp vào **nhánh mặc định**. Nhánh mặc định của kho này đã đặt là `develop`, đúng nhánh mà mọi pull request nhắm tới, nên cơ chế hoạt động. Nếu để mặc định là `main` thì gộp vào `develop` sẽ không đóng phiếu nào cả.

### Từ khoá nào dùng được

`Closes`, `Close`, `Closed`, `Fixes`, `Fix`, `Fixed`, `Resolves`, `Resolve`, `Resolved` đều được, viết hoa hay thường không quan trọng. Nhóm dùng thống nhất **`Closes`** cho phân hệ và **`Fixes`** cho sửa lỗi.

Nối nhiều phiếu thì mỗi phiếu một từ khoá, viết `Closes #3, closes #4`. Viết `Closes #3, #4` chỉ đóng được phiếu đầu.

### Muốn nhắc tới phiếu mà không đóng nó

Viết `#3` trơn, không kèm từ khoá. Dùng khi công việc mới xong một phần.

## Sprint và milestone

Mỗi sprint là một milestone trên GitHub, tên theo tuần, ví dụ `S2 · 21/09 - 27/09`. Phiếu công việc gắn vào milestone tương ứng để nhìn ra tiến độ tuần mà không cần mở bảng kế hoạch.
