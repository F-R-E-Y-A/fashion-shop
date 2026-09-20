# Dựng và cấu hình hai kho trên GitHub

Sổ tay chạy một lần, dành cho Bảo. Làm xong thì cả nhóm clone về là viết mã được ngay từ Thứ Hai.

Mọi lệnh chạy trong **PowerShell** trừ chỗ ghi rõ là Git Bash. Chạy tuần tự, đừng nhảy cóc: bước sau phụ thuộc bước trước.

---

## 0. Trạng thái trước khi bắt đầu

Đo lúc 20/09/2026 bằng `gh api`:

| Kho trong org `F-R-E-Y-A` | Nội dung | Xử lý |
|---|---|---|
| `docs` | 25 tệp, 7 commit | **Kho tài liệu.** Giữ nguyên, chỉ cần cấu hình ở mục 9 |
| `fashion-shop` | Rỗng | **Kho mã nguồn.** Đẩy mã vào ở mục 2 |
| `diagram-fashion-ecommerce` | Rỗng | Đã chốt xoá. Sơ đồ thuộc kho `docs` theo quy tắc hai kho |

Hai điều cần biết trước, đã kiểm chứng:

**Quyền của Duy và Tài chưa đủ.** Quyền mặc định của thành viên org đang là `read`. Đo từng kho: Duy có `read` trên `fashion-shop` và `write` trên `docs`; Tài có `read` trên cả hai. **Cả hai chưa push được vào kho mã.** Sửa ở mục 5, đừng bỏ qua.

**Khoá nhánh không dùng được, và lý do không như thoạt nghĩ.** Bảo đã có **GitHub Pro** qua chương trình GitHub Education. Nhưng gói cá nhân **chỉ áp cho kho thuộc tài khoản cá nhân**; kho thuộc tổ chức thì theo **gói của tổ chức**, mà `F-R-E-Y-A` đang ở gói Free. Đo được: `gh api orgs/F-R-E-Y-A --jq .plan.name` trả `free`, và thử bật branch protection lẫn ruleset trên `fashion-shop` đều nhận 403. Bốn phương án ở mục 6.

Lưu ý khi tự kiểm: `gh api user --jq .plan` trả `null` **không** chứng minh tài khoản ở gói Free, nó chỉ nghĩa là token thiếu quyền `user` nên GitHub không trả trường đó.

---

## 1. Cấp quyền `workflow` cho GitHub CLI

Token hiện có `gist`, `read:org`, `repo`. Thiếu `workflow` thì GitHub **từ chối cả lần đẩy** khi trong đó có tệp `.github/workflows/`, chứ không phải chỉ bỏ qua tệp đó.

```powershell
gh auth refresh -h github.com -s workflow
```

Lệnh mở trình duyệt, đăng nhập rồi bấm đồng ý. Kiểm lại:

```powershell
gh auth status
```

Dòng `Token scopes` phải có `workflow`. Chưa có thì chạy lại, đừng đi tiếp.

---

## 2. Đẩy kho mã lên, ba nhánh

Vào thư mục kho mã:

```powershell
cd D:\Project\personal\TieuLuanChuyenNganh\fashion-shop
```

Kiểm ba nhánh đang ở đâu:

```powershell
git branch -vv
```

Kỳ vọng: `main` và `develop` cùng ở một commit, `feature/platform` đi trước vài commit.

Hook `pre-push` của nhóm chặn đẩy thẳng vào `main` và `develop`. Kho đang rỗng nên chưa mở pull request được, đây đúng là trường hợp lối thoát đã ghi sẵn trong hook. Bật lên:

```powershell
$env:ALLOW_DIRECT_PUSH = '1'
```

Đẩy hai nhánh chung:

```powershell
git push -u origin main
```

```powershell
git push -u origin develop
```

Tắt lối thoát ngay, để hook bảo vệ trở lại:

```powershell
Remove-Item Env:ALLOW_DIRECT_PUSH
```

Đẩy nhánh làm việc. Lệnh này **không** cần lối thoát; hook sẽ chạy kiểm kiểu hai workspace trước khi đẩy, mất khoảng một phút:

```powershell
git push -u origin feature/platform
```

**Nếu báo `refusing to allow an OAuth App to create or update workflow`** thì mục 1 chưa ăn. Quay lại mục 1.

---

## 3. Cấu hình kho mã

Đặt `develop` làm nhánh mặc định, để pull request tự nhắm đúng đích và ai clone về cũng đứng sẵn ở nhánh tích hợp:

```powershell
gh repo edit F-R-E-Y-A/fashion-shop --default-branch develop
```

Chỉ cho phép gộp kiểu **merge commit**, và tự xoá nhánh sau khi gộp:

```powershell
gh repo edit F-R-E-Y-A/fashion-shop --enable-merge-commit=true --enable-squash-merge=false --enable-rebase-merge=false --delete-branch-on-merge=true
```

**Vì sao merge commit chứ không phải squash.** Squash gom cả nhánh thành một commit mới, nên mọi commit hằng ngày biến mất khỏi `develop`. Với đồ án này đó là mất bằng chứng, vì rubric đòi kho mã có đủ lịch sử commit suốt kỳ, và tài liệu của nhóm đang trích dẫn mã commit để đối chiếu. Lý do đầy đủ cùng số đo ở `../adr/adr-005-merge-commit.md`.

Merge commit giữ được cả hai góc nhìn, không mất gì:

```powershell
git log --first-parent --oneline develop
```

Cho ra danh sách các mốc việc lớn, đúng thứ cần khi báo cáo tiến độ.

```powershell
git log --oneline develop
```

Cho ra toàn bộ commit hằng ngày kèm ngày thật, đúng thứ cần khi hội đồng soi quá trình làm việc.

Tự xoá nhánh sau khi gộp vẫn an toàn: merge commit khiến mọi commit của nhánh trở thành tổ tiên của `develop`, nên xoá tên nhánh đi không mất commit nào.

Thêm mô tả và chủ đề cho kho:

```powershell
gh repo edit F-R-E-Y-A/fashion-shop --description "Website thuong mai dien tu thoi trang - Tieu luan chuyen nganh - ma nguon" --add-topic tlcn --add-topic nestjs --add-topic react --add-topic postgresql
```

---

## 4. Nhãn phân loại và milestone theo sprint

Chạy trong **Git Bash**, không phải PowerShell:

```bash
bash tools/github/bootstrap-repo.sh F-R-E-Y-A/fashion-shop
```

Nếu PowerShell không tìm thấy `bash`, gọi thẳng:

```powershell
& "C:\Program Files\Git\bin\bash.exe" tools/github/bootstrap-repo.sh F-R-E-Y-A/fashion-shop
```

Script tạo 7 nhãn và 10 milestone từ S2 tới S11, hạn mỗi milestone là Chủ Nhật họp giảng viên. Milestone là thứ cho phép mở tab Issues ra là thấy tuần này còn nợ gì, không cần mở bảng kế hoạch.

Kiểm lại:

```powershell
gh label list -R F-R-E-Y-A/fashion-shop
```

```powershell
gh api repos/F-R-E-Y-A/fashion-shop/milestones --jq '.[] | "\(.title) — han \(.due_on[0:10])"'
```

---

## 5. Cấp quyền cho Duy và Tài

**Bắt buộc.** Hiện cả hai chỉ có `read` trên kho mã, tức là clone được nhưng **không push được**.

```powershell
gh api -X PUT repos/F-R-E-Y-A/fashion-shop/collaborators/DuyPhan422 -f permission=push
```

```powershell
gh api -X PUT repos/F-R-E-Y-A/fashion-shop/collaborators/KickHuynh -f permission=push
```

```powershell
gh api -X PUT repos/F-R-E-Y-A/docs/collaborators/KickHuynh -f permission=push
```

Duy đã có `write` trên `docs` rồi nên không cần lệnh thứ tư.

Kiểm lại, cả bốn dòng phải ra `write`:

```powershell
foreach ($u in 'DuyPhan422','KickHuynh') { foreach ($r in 'fashion-shop','docs') { "$u $r : " + (gh api "repos/F-R-E-Y-A/$r/collaborators/$u/permission" --jq '.permission') } }
```

Hai bạn sẽ nhận thư mời, phải bấm chấp nhận thì quyền mới có hiệu lực. Nhắc hai bạn kiểm hộp thư.

---

## 6. Bảo vệ nhánh: hiện làm được tới đâu

Bảo đã có GitHub Pro qua Education, nhưng kho thuộc tổ chức thì theo gói của tổ chức, và `F-R-E-Y-A` đang ở gói Free. Bốn phương án:

| Phương án | Được gì | Mất gì |
|---|---|---|
| **A. Giữ nguyên, chỉ ép bằng hook ở máy** | Không tốn gì, làm ngay | Ai cố tình vẫn đẩy thẳng được; luật là thoả thuận cộng với hook |
| **B. Nâng tổ chức lên GitHub Team** | Khoá nhánh thật trên kho của tổ chức | Trả phí theo đầu người mỗi tháng, trừ khi trường có chương trình Campus cấp sẵn |
| **C. Chuyển kho mã về tài khoản cá nhân `Ancuyou`** | Khoá nhánh thật ngay, không tốn thêm đồng nào, vì Pro đã có. Kho riêng tư của Pro vẫn mời được cộng tác viên không giới hạn | Kho không còn nằm dưới tên tổ chức của nhóm |
| **D. Chuyển kho sang công khai** | Khoá nhánh miễn phí ngay | Dữ liệu thu thập và mã bài tập lộ ra ngoài |

**Khuyến nghị: A.** Lý do là rubric **đo kết quả chứ không đo cấu hình**: tiêu chí TC2.4 hỏi "tỷ lệ thay đổi đi qua pull request có review", thứ này đọc từ lịch sử pull request, không đọc từ việc nhánh có được khoá hay không. Nhóm ba người có kỷ luật cộng với hook `pre-push` là đạt được con số đó. Khoá nhánh là tiện, không phải là điểm.

Muốn ép bằng máy thật thì **C rẻ nhất**: không tốn phí, có ngay, và đổi lại chỉ là tên chủ sở hữu kho. Kiểm trước xem trường có chương trình Campus cấp GitHub Team miễn phí cho tổ chức không, ở https://education.github.com/benefits.

### 6b. Bật khoá nhánh sau khi chọn B hoặc C

```powershell
gh api -X PUT repos/F-R-E-Y-A/fashion-shop/branches/develop/protection -f "required_pull_request_reviews[required_approving_review_count]=1" -F "enforce_admins=false" -F "restrictions=null" -F "required_status_checks=null"
```

Sau khi CI đã chạy ít nhất một lần, siết thêm: bắt buộc cả sáu chặng phải xanh mới gộp được. Lấy đúng tên sáu chặng trong `.github/workflows/ci.yml`, mục `name:` của từng job.

---

## 7. Nhánh `feature/` và `task/`: dựng cho sprint 2

### Cây nhánh của nhóm

```
main                          chỉ chứa bản đã phát hành
└── develop                   nhánh tích hợp, mọi feature gộp vào đây
    ├── feature/ph-03-catalog        một phân hệ, một người, một tuần
    │   ├── task/catalog-schema      việc con, sống ở máy người làm
    │   └── task/catalog-list-page
    ├── feature/ph-13-inventory
    └── feature/ph-01-auth
```

**Luật quan trọng: nhánh `feature/` đẩy lên GitHub, nhánh `task/` thì không.** Nhánh `task/` là cách tự chia nhỏ việc ở máy mình, gộp vào `feature/` cha rồi xoá. Đẩy hết lên chỉ làm rối danh sách nhánh chung mà không ai dùng tới. Trừ khi muốn nhờ người khác xem giúp một việc con còn dở, lúc đó mới đẩy.

### Nhánh feature cho sprint 2: hoãn, chờ chốt lại cách chia

**Chưa tạo nhánh feature nào cho sprint 2.** Bảo đang tính toán lại cách chia dòng việc, nên tạo nhánh bây giờ là tạo thứ có thể phải xoá.

Chốt xong thì mỗi nhánh chỉ tốn một lệnh, cắt thẳng từ `develop` mà không cần chuyển qua lại:

```powershell
git push origin develop:refs/heads/feature/<ma-viet-thuong>-<ten-ngan>
```

Ví dụ `git push origin develop:refs/heads/feature/ph-13-inventory`.

Đặt tên theo `docs/GIT_FLOW.md`: `feature/<mã viết thường>-<tên ngắn>`, không dấu, nối bằng gạch ngang. Mã lấy từ bảng chia việc theo sprint trong kho `docs`.

Sau khi mục 2 xong, kho có đúng ba nhánh. Kiểm lại:

```powershell
git ls-remote --heads origin
```

Kỳ vọng: `main`, `develop`, `feature/platform`.

### Công thức mỗi người dùng hằng ngày

Gửi đoạn này cho Duy và Tài. Bắt đầu một dòng việc:

```powershell
git switch develop; git pull; git switch feature/ph-13-inventory
```

Chia một việc con, làm, rồi gộp ngược vào nhánh feature của mình:

```powershell
git switch -c task/inventory-schema
```

Làm xong việc con đó thì:

```powershell
git add . ; git commit -m "feat(ph-13): them bang ton kho va bien dong kho"
```

```powershell
git switch feature/ph-13-inventory ; git merge task/inventory-schema ; git branch -d task/inventory-schema
```

Xong cả phân hệ thì đẩy và mở pull request:

```powershell
git push -u origin feature/ph-13-inventory
```

```powershell
gh pr create --base develop --fill
```

**Ba điều dễ sai, nói trước cho hai bạn:**

- Commit message phải đúng dạng `<loại>(<phạm vi>): <mô tả>`, chữ đầu không viết hoa, cuối không có dấu chấm. Sai thì hook `commit-msg` chặn ngay, không commit được.
- Chạy `npm run check` trước khi đẩy. Đỏ ở máy thì cũng đỏ trên CI, mà chờ CI mất ba phút.
- Không đẩy thẳng vào `develop`. Hook chặn, và đó là cố ý.

---

## 8. Mở pull request đầu tiên cho HT-01

Phần thân đã soạn sẵn ở `.github/pr-body-ht01.md`:

```powershell
gh pr create --base develop --head feature/platform --title "HT-01: nen tang he thong dung chung, co che chat luong va duong ra san xuat" --body-file .github/pr-body-ht01.md
```

Pull request này kích hoạt **lượt chạy CI đầu tiên**. Xem tiến trình:

```powershell
gh pr checks --watch
```

Xem log một chặng bị đỏ:

```powershell
gh run view --log-failed
```

**Chặng sáu có thể đỏ ở lần đầu**, vì bước dựng image chưa từng chạy trên máy của GitHub bao giờ. Đỏ thì đọc log rồi sửa, đó là việc bình thường và chính là lý do dựng CI từ tuần đầu. Đừng gộp khi còn đỏ.

Gộp khi đã xanh:

```powershell
gh pr merge --merge --delete-branch
```

---

## 9. Cấu hình kho `docs`

Kho này đã có nội dung, chỉ cần chỉnh cấu hình cho khớp.

```powershell
gh repo edit F-R-E-Y-A/docs --description "Tieu luan chuyen nganh - ho so, ke hoach, so tien do, nhat ky AI" --add-topic tlcn --add-topic tai-lieu
```

```powershell
gh repo edit F-R-E-Y-A/docs --enable-merge-commit=true --enable-squash-merge=false --enable-rebase-merge=false --delete-branch-on-merge=true
```

Kho tài liệu **không cần nhánh `develop`**. Ai cũng sửa thẳng trên `main`, vì tài liệu không có cổng chặn tự động nào để mà chờ, và xung đột gộp trên tệp Markdown dễ gỡ hơn nhiều so với mã nguồn. Đây là khác biệt cố ý giữa hai kho.

Đặt lịch nhắc cho cả nhóm: **mỗi Chủ Nhật trước buổi họp**, hai tệp phải được cập nhật trong kho này, đều là điều kiện chặn điểm của rubric:

- `tien-do/SNN.md` cho sprint đang chạy, theo mẫu `tien-do/_mau.md`
- `ai-log/YYYY-Www.md` cho tuần đang chạy, theo mẫu `ai-log/_mau.md`

---

## 10. Kiểm lại toàn bộ

Chạy từng lệnh, đối chiếu với cột kỳ vọng.

```powershell
gh repo view F-R-E-Y-A/fashion-shop --json defaultBranchRef,visibility,mergeCommitAllowed,squashMergeAllowed,deleteBranchOnMerge
```

Kỳ vọng: nhánh mặc định `develop`, riêng tư, `mergeCommitAllowed` là `true`, `squashMergeAllowed` là `false`, tự xoá nhánh sau khi gộp.

```powershell
git ls-remote --heads origin
```

Kỳ vọng: ba nhánh là `main`, `develop`, `feature/platform`. Nhánh feature của sprint 2 tạo sau khi chốt lại cách chia dòng việc.

```powershell
gh pr list -R F-R-E-Y-A/fashion-shop
```

Kỳ vọng: một pull request đang mở cho HT-01.

```powershell
gh run list -R F-R-E-Y-A/fashion-shop --limit 5
```

Kỳ vọng: ít nhất một lượt chạy CI.

```powershell
foreach ($u in 'DuyPhan422','KickHuynh') { foreach ($r in 'fashion-shop','docs') { "$u $r : " + (gh api "repos/F-R-E-Y-A/$r/collaborators/$u/permission" --jq '.permission') } }
```

Kỳ vọng: bốn dòng đều `write`.

**Phép thử cuối cùng, quan trọng nhất.** Clone kho vào một thư mục trắng rồi chạy như người mới:

```powershell
cd $env:TEMP ; git clone https://github.com/F-R-E-Y-A/fashion-shop.git thu-clone ; cd thu-clone
```

```powershell
Copy-Item .env.example .env ; npm run setup
```

Nếu chạy trót lọt và `npm run dev:web` cho thấy 10 sản phẩm thì kho đã sẵn sàng cho cả nhóm. Xong thì xoá thư mục thử đi.

---

## Nếu vướng

| Triệu chứng | Nguyên nhân | Cách gỡ |
|---|---|---|
| `refusing to allow an OAuth App to create or update workflow` | Thiếu quyền `workflow` | Làm lại mục 1 |
| `Khong day thang vao main` | Hook `pre-push` đang làm đúng việc của nó | Đặt `ALLOW_DIRECT_PUSH` nếu thật sự cần, hoặc mở pull request |
| `Permission denied (publickey)` | Chưa có khoá SSH | Dùng HTTPS, `gh` đã cấu hình sẵn thông tin đăng nhập |
| Duy hay Tài báo không push được | Chưa bấm chấp nhận thư mời | Kiểm ở https://github.com/F-R-E-Y-A và trong hộp thư |
| CI đỏ ở chặng dựng image | Lần đầu chạy trên máy của GitHub | `gh run view --log-failed`, đọc rồi sửa, đừng tắt chặng đó |
| `bash` không tìm thấy | PowerShell không có sẵn bash | Gọi thẳng `C:\Program Files\Git\bin\bash.exe` |
