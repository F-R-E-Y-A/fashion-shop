---
title: Nhật ký quyết định toàn hệ thống
updated: 2026-09-24
status: đang dùng
owner: Bảo
---
# Nhật ký quyết định toàn hệ thống (chỉ thêm vào cuối)

Quyết định chạm cả nhóm: kiến trúc, công nghệ, cách làm việc, cách tổ chức tài liệu. Quyết định của một feature nằm trong `features/<x>/LOG.md` của feature đó; số `ADR` là một dãy chung cho mọi LOG.

- **Chỉ thêm vào cuối, không sửa mục cũ.** Sai thì thêm mục mới nói mục nào sai ở đâu. Ngoại lệ duy nhất: dòng `Trạng thái` (đề xuất → đã chốt → thay thế bởi → huỷ) và phần `Thực tế` khi có kết quả.
- **Chỉ người đổi trạng thái.** Agent viết mục mới ở trạng thái `đề xuất`.
- **Không có mục lục viết tay**, vì mục lục là phần phải sửa mỗi lần thêm. GitHub tự dựng mục lục từ tiêu đề (nút danh sách ở góc trên tệp); tìm nhanh bằng `grep -n "^## " docs/LOG.md docs/features/*/LOG.md`.
- Khuôn một mục: [shared/templates/LOG-entry.md](shared/templates/LOG-entry.md). Luật đầy đủ: [AGENTS.md](../AGENTS.md).

Năm mục đầu là năm tệp `docs/adr/adr-00N-*.md` cũ, chuyển nguyên văn ngày 24/09 theo [ADR-006](#adr-006); bản gốc đọc được ở commit `85a9d93`, link trong từng mục.

---

<a id="adr-001"></a>
## 2026-09-14 · ADR-001 — Dựng một khối module hóa, không dựng microservices

**Loại:** quyết định · **Phạm vi:** toàn hệ thống · **Trạng thái:** đã chốt · **Người quyết:** Cả nhóm, Bảo đề xuất · **Nguồn:** [docs/adr/adr-001-modular-monolith.md tại 85a9d93](https://github.com/F-R-E-Y-A/fashion-shop/blob/85a9d93/docs/adr/adr-001-modular-monolith.md), chuyển nguyên văn vào đây ngày 24/09

### Bối cảnh

Ba sinh viên, mười một tuần, mỗi người khoảng mười hai giờ một tuần vì ban ngày đi thực tập. Yêu cầu chấm gồm nghiệp vụ đầy đủ, tài liệu tốt, triển khai thật và thanh toán qua cổng thử nghiệm.

Ba người cần làm song song mà không giẫm chân nhau. Đây là lý do người ta hay nghĩ tới microservices.

### Quyết định

Dựng **một ứng dụng duy nhất, chia thành module có ranh giới rõ**. Mỗi phân hệ là một thư mục trong `apps/api/src/modules`, có controller, service và bảng dữ liệu riêng. Module gọi nhau bằng cách tiêm service, không gọi qua mạng.

### Lý do

Ranh giới giữa ba người là thứ chúng tôi cần, còn tách tiến trình thì không. Module của NestJS cho ranh giới đó ngay trong ngôn ngữ, thêm tệp `CODEOWNERS` là pull request chạm vào thư mục người khác tự động đòi người đó duyệt.

Microservices trả ranh giới đó với giá quá đắt cho quy mô này: phải dựng nhiều tiến trình, nhiều cơ sở dữ liệu, xử lý giao dịch phân tán, dựng hạ tầng theo dõi tương quan giữa các dịch vụ. Với mười hai giờ một tuần, phần lớn thời gian sẽ đổ vào hạ tầng thay vì vào nghiệp vụ mà hội đồng chấm.

Chọn một khối cũng giữ được đường lùi. Module nào về sau cần tách thì đã có sẵn ranh giới để tách.

### Hệ quả

Chấp nhận:

- Cả hệ thống lên xuống cùng nhau. Một lỗi nặng làm sập cả ứng dụng, nên phần chịu lỗi ở tuần 10 phải làm cho tử tế.
- Ba người dùng chung một cơ sở dữ liệu, nên phải có luật quyền sở hữu bảng, xem `docs/CONTRIBUTING.md`.

Được lại:

- Một lệnh chạy được cả hệ thống trên máy cá nhân.
- Gọi giữa các phân hệ là gọi hàm, có kiểm kiểu lúc biên dịch, không phải gọi mạng có thể hỏng.
- Một giao dịch cơ sở dữ liệu bao được nhiều bảng, nên không cần tới các mẫu bù trừ phức tạp.

### Phương án đã cân nhắc và bỏ

| Phương án | Vì sao bỏ |
|---|---|
| Microservices | Chi phí hạ tầng vượt xa lợi ích ở quy mô ba người, mười một tuần |
| Một khối không chia module | Không có gì ép ranh giới, ba người sẽ viết chồng lên nhau từ tuần thứ tư |
| Mỗi người một ứng dụng riêng | Không ghép được thành một sản phẩm để demo |

---

<a id="adr-002"></a>
## 2026-09-14 · ADR-002 — Dùng PostgreSQL làm cơ sở dữ liệu duy nhất

**Loại:** quyết định · **Phạm vi:** toàn hệ thống · **Trạng thái:** đã chốt · **Người quyết:** Cả nhóm · **Nguồn:** [docs/adr/adr-002-postgresql-duy-nhat.md tại 85a9d93](https://github.com/F-R-E-Y-A/fashion-shop/blob/85a9d93/docs/adr/adr-002-postgresql-duy-nhat.md), chuyển nguyên văn vào đây ngày 24/09

### Bối cảnh

Hội đồng chấm rất kỹ sơ đồ quan hệ thực thể, nên bắt buộc phải có cơ sở dữ liệu quan hệ. Câu hỏi đặt ra là có cần thêm MongoDB cho phần dữ liệu sản phẩm nhiều thuộc tính và phần dữ liệu thu thập được hay không.

### Quyết định

Chỉ dùng **PostgreSQL**. Không thêm MongoDB.

### Lý do

Thứ được cho là điểm mạnh của MongoDB ở đây là lưu dữ liệu hình dạng không cố định. Postgres làm được việc đó bằng kiểu `JSONB` kèm chỉ mục `GIN`, mà vẫn giữ nguyên ràng buộc khóa ngoại và giao dịch cho phần còn lại.

Thêm một cơ sở dữ liệu thứ hai thì phải đồng bộ hai nơi, và sơ đồ quan hệ thực thể sẽ thủng một mảng, đúng chỗ hội đồng nhìn kỹ nhất.

Phần tìm kiếm sau này dùng Meilisearch, nhưng đó là **chỉ mục dẫn xuất**, dựng lại được từ Postgres bất cứ lúc nào, không phải nơi lưu trữ gốc. Nguồn sự thật vẫn chỉ có một.

### Hệ quả

Chấp nhận:

- Dữ liệu thu thập thô phải nằm trong một schema riêng tên `staging`, tách khỏi bảng nghiệp vụ.
- Truy vấn trên `JSONB` phải có chỉ mục đúng, nếu không sẽ chậm. Phần đo và tối ưu nằm ở HT-08 tuần 9.

Được lại:

- Một sơ đồ quan hệ thực thể duy nhất, đầy đủ, đúng thứ hội đồng đòi.
- Một giao dịch bao được nhiều bảng, cần thiết cho luồng đặt hàng và thanh toán.
- Một chỗ để sao lưu và phục hồi, việc của HT-08 tuần 10 nhẹ đi.

---

<a id="adr-003"></a>
## 2026-09-14 · ADR-003 — Máy chủ chạy NestJS dạng ESM, Prisma 7 dùng adapter

**Loại:** quyết định · **Phạm vi:** toàn hệ thống · **Trạng thái:** đã chốt · **Người quyết:** Bảo · **Nguồn:** [docs/adr/adr-003-nestjs-esm-prisma7.md tại 85a9d93](https://github.com/F-R-E-Y-A/fashion-shop/blob/85a9d93/docs/adr/adr-003-nestjs-esm-prisma7.md), chuyển nguyên văn vào đây ngày 24/09

### Bối cảnh

Khi dựng khung tuần 1, hai phiên bản thư viện mới buộc phải đổi cách viết so với phần lớn hướng dẫn đang có trên mạng. Ghi lại đây để hai bạn không mất thời gian tra rồi làm theo bài cũ.

### Ba điều đã đổi

**Một. NestJS 12 chỉ còn bản ESM.** Gói `@nestjs/common` khai báo `"type": "module"`, không còn chạy được kiểu CommonJS. Hệ quả trong mã của chúng ta:

- `apps/api/package.json` có `"type": "module"`.
- `tsconfig.json` đặt `module` và `moduleResolution` đều là `node16`.
- **Mọi import tương đối phải ghi đuôi `.js`**, kể cả khi tệp thật là `.ts`. Ví dụ `import { ProductsService } from './products.service.js'`. Nhìn lạ nhưng đây là luật của ESM, không phải gõ nhầm.

**Hai. Prisma 7 không nhận `url` trong khối `datasource` nữa.** Đường kết nối tách làm hai chỗ:

- Lệnh dòng lệnh như `migrate`, `db seed`, `studio` đọc `prisma.config.ts`.
- Ứng dụng lúc chạy nhận một adapter, ở đây là `PrismaPg`, xem `src/common/prisma/prisma.service.ts`.

**Ba. Prisma Client sinh ra mã TypeScript vào `src/generated/prisma`,** không nằm trong `node_modules` như trước. Thư mục này không đưa lên git, ai kéo mã về phải chạy `npm run db:generate` một lần. Bước này đã nằm sẵn trong `npm run setup` và trong CI.

### Vài chỗ nhỏ đã chốt kèm

- **Phiên bản ghim.** Thẻ `latest` của Prisma trên npm đang trỏ vào bản thử nghiệm 8.0.0-rc, nên `prisma` ghim đúng 7.10.0 cho khớp `@prisma/client`. TypeScript ghim dải `~6.0.2` vì công cụ dựng của Nest 12 dùng TypeScript 6; để npm tự chọn sẽ ra TypeScript 7 và hai trình biên dịch sẽ cho kết quả khác nhau.
- **`tsx` chỉ dùng cho tệp seed.** Node 24 chạy thẳng TypeScript được, nhưng không tự đổi đuôi `.js` trong import thành `.ts`, mà mã Prisma sinh ra lại viết như vậy. `tsx` xử lý đúng chỗ đó. Mã ứng dụng không dùng `tsx`, vẫn dựng bằng `nest build`.
- **Cổng chạy.** API ở 3001 và giao diện ở 5174, lệch khỏi mặc định 3000 và 5173 vì hai cổng đó đang bị ứng dụng khác trên máy chiếm. Đổi trong `.env` và `apps/web/vite.config.ts` nếu máy bạn khác.

### Hệ quả

Chấp nhận: hướng dẫn NestJS và Prisma tìm thấy trên mạng phần lớn viết cho bản cũ, chép nguyên vào sẽ lỗi. Khi bí thì đọc module mẫu `products` trước, đó mới là mẫu đúng của dự án này.

Được lại: đứng trên bản hiện hành, không phải nâng cấp giữa chừng khi đang chạy nước rút.

---

<a id="adr-004"></a>
## 2026-09-19 · ADR-004 — Ép ranh giới và chất lượng bằng máy, không bằng lời nhắc

**Loại:** quyết định · **Phạm vi:** toàn hệ thống · **Trạng thái:** đã chốt · **Người quyết:** Bảo · **Nguồn:** [docs/adr/adr-004-co-che-chat-luong.md tại 85a9d93](https://github.com/F-R-E-Y-A/fashion-shop/blob/85a9d93/docs/adr/adr-004-co-che-chat-luong.md), chuyển nguyên văn vào đây ngày 24/09

### Bối cảnh

Từ Thứ Hai 21/09, ba người cùng viết mã vào một kho, mỗi người khoảng mười hai giờ một tuần, trong mười một tuần. Ba luật làm việc đã được viết ra từ 13/09 trong `CONTRIBUTING.md`: một phân hệ do một người làm trọn, không ai ghi vào bảng của người khác, controller không gọi thẳng Prisma.

Vấn đề là ba luật đó tồn tại dưới dạng **lời nhắc trong tài liệu**. Tới tuần thứ tư, khi ai cũng vội, lời nhắc trong tài liệu thua đường tắt trong mã.

Thêm một ràng buộc nữa: rubric của khoa chấm 25 trên 100 điểm cho những thứ chỉ tích luỹ được theo thời gian, gồm nhật ký AI đối chiếu với commit, tỷ lệ tuần có commit, tỷ lệ thay đổi qua pull request có duyệt, số chặng trong pipeline, số lần triển khai tự động. Những con số này không nhồi được vào tuần cuối.

### Quyết định

**Mọi luật nào máy kiểm được thì máy kiểm, ngay trong sprint 1.** Cụ thể:

1. **Luật ranh giới viết thành luật ESLint cục bộ** trong `tools/eslint/boundaries.mjs`, thông báo lỗi bằng tiếng Việt chỉ thẳng luật nào bị phạm.
2. **Chính luật đó có bộ kiểm riêng**, `tools/eslint/verify-boundaries.mjs`, chạy trong CI.
3. **Kiểm thử hai tầng có khuôn mẫu sẵn** để chép: đơn vị với Prisma giả, và qua HTTP thật trên Postgres riêng.
4. **CI sáu chặng** chặn gộp: định dạng và lint, kiểm kiểu và dựng, kiểm thử đơn vị, migration và kiểm thử HTTP, quét bí mật và thư viện, dựng image rồi chạy thử.
5. **Hook ở máy** chặn commit sai quy ước và chặn đẩy thẳng vào nhánh chung.
6. **Nhật ký AI nằm trong kho**, mỗi commit có phần AI sinh mang dòng `AI-Assisted`, tra được bằng `git log --grep`.

### Lý do

Ranh giới là thứ duy nhất cho phép ba người viết song song mà không chờ nhau. Ép nó ở khâu duyệt pull request nghĩa là phát hiện sau khi mã đã viết xong, lúc đó sửa rất đắt và người duyệt ngại nói. Ép ở khâu lint nghĩa là biết ngay khi vừa gõ, lúc đó sửa là hai phút.

Bộ kiểm cho chính luật ranh giới nghe có vẻ thừa, nhưng một luật lint âm thầm hỏng thì tệ hơn là không có luật: cả nhóm vẫn tin rằng ranh giới đang được giữ. Tám trường hợp trong bộ kiểm là tám điều đã kiểm chứng tự tay, không phải giả định.

Nhật ký AI để trong kho thay vì trên Notion vì rubric đòi **đối chiếu được với lịch sử commit**. Bằng chứng phải nằm cùng chỗ với thứ nó chứng minh.

Về nguyên tắc chung, mượn đúng một câu để tự nhắc: **gọn trước, luôn sẵn sàng mở rộng.** Cơ chế thì xong sớm vì ba người sẽ chép nó suốt mười một tuần. Dịch vụ thì đến đúng tuần mà phân hệ sở hữu nó cần tới.

### Hệ quả

Chấp nhận:

- Mỗi pull request phải qua sáu chặng, mất vài phút. Đổi lại lỗi bị bắt ở máy CI chứ không ở buổi ghép Chủ Nhật.
- Luật ranh giới là mã tự viết nên phải tự bảo trì. Đã trả giá đó có ý thức: một luật cục bộ 150 dòng rẻ hơn kéo về một plugin lớn rồi phải uốn cấu hình theo nó.
- Thêm một phân hệ tốn thêm vài dòng cấu hình: một dòng trong `app.module.ts`, một dòng trong `routes.tsx`, một tệp `index.ts`, vài dòng trong `CODEOWNERS`.

Được lại:

- Người mới đọc thông báo lỗi là biết phạm luật nào, không phải đi hỏi.
- Bốn con số rubric chấm bắt đầu được đếm từ tuần đầu chứ không phải tuần cuối.
- Khi tách phân hệ thành dịch vụ riêng về sau, ranh giới đã được giữ sạch suốt quá trình nên việc tách là chuyện cắt theo đường đã vạch.

### Phương án đã cân nhắc và bỏ

| Phương án | Vì sao bỏ |
|---|---|
| Chỉ ghi luật trong `CONTRIBUTING.md`, tin nhau | Đây là hiện trạng từ 13/09. Không có gì ngăn đường tắt vào tuần bận |
| Dùng plugin `eslint-plugin-boundaries` có sẵn | Cấu hình theo mô hình thẻ và loại của nó, không khớp mô hình "một phân hệ một người"; thông báo lỗi tiếng Anh chung chung, không chỉ được luật nào của nhóm bị phạm |
| Tách mỗi phân hệ thành một gói riêng trong `packages/` để ép ranh giới bằng ranh giới gói | Đúng về cơ chế nhưng quá nặng cho ba người: mỗi gói một `package.json`, một `tsconfig`, một nhịp dựng. Để dành cho lúc thật sự có ứng dụng thứ hai |
| Chạy SonarQube hoặc SonarCloud để phân tích tĩnh | Kho riêng tư nên bản miễn phí không dùng được; ESLint cộng báo cáo độ phủ đã phủ đúng những chỉ số rubric hỏi |
| Đặt ngưỡng độ phủ kiểm thử ngay bây giờ | Chưa có mã nghiệp vụ thì con số chỉ là hình thức. Xuất báo cáo trước, ngưỡng do Duy chốt ở S2 |

---

<a id="adr-005"></a>
## 2026-09-20 · ADR-005 — Gộp pull request bằng merge commit, không dùng squash

**Loại:** quyết định · **Phạm vi:** toàn hệ thống · **Trạng thái:** đã chốt · **Người quyết:** Bảo, sau khi phản biện cấu hình ban đầu · **Nguồn:** [docs/adr/adr-005-merge-commit.md tại 85a9d93](https://github.com/F-R-E-Y-A/fashion-shop/blob/85a9d93/docs/adr/adr-005-merge-commit.md), chuyển nguyên văn vào đây ngày 24/09

### Bối cảnh

Cấu hình ban đầu của kho mã đặt squash làm cách gộp duy nhất, với ba lý do nghe hợp lý: lịch sử `develop` đọc như danh sách việc đã xong; hai bạn không cần biết `git rebase -i`; và gỡ một phân hệ hỏng chỉ mất một lệnh `git revert`.

Bảo đặt lại câu hỏi: lịch sử sạch đến mức mỗi tuần chỉ có ba commit thì **có đáng ngờ không**, khi hội đồng cần thấy quá trình làm việc, và khi tài liệu của nhóm đang trích dẫn mã commit để đối chiếu?

Câu hỏi đó đúng, và nó phơi ra một khiếm khuyết thật.

### Khiếm khuyết đã đo được

**Squash xoá commit hằng ngày khỏi nhánh chính.** Dựng một kho thử mô phỏng một tuần làm việc của một người, năm commit từ 22/09 tới 26/09, rồi gộp theo hai cách:

| Cách gộp | Số commit còn thấy trên `develop` | Ngày làm việc |
|---|---|---|
| Squash | 1 | Chỉ còn ngày gộp là 27/09 |
| Merge commit | 6 | Giữ nguyên 22, 23, 24, 25, 26/09 |

**Tài liệu của nhóm sẽ trỏ vào commit không còn tồn tại.** Sổ lỗi AI trong kho tài liệu đang trích dẫn ba mã commit tổng cộng chín lần: `44e3d57` ba lần, `c9a015a` bốn lần, `6a5e623` hai lần. Cả ba đều nằm trên nhánh `feature/platform`, chưa có trên `develop`. Squash sẽ gom chúng thành một commit mang mã hoàn toàn mới.

Commit gốc không mất hẳn, GitHub vẫn giữ chúng gắn với pull request. Nhưng `git clone` **không** tải các tham chiếu đó về. Hệ quả: hội đồng clone kho mã rồi chạy `git show c9a015a` sẽ không tìm thấy, trong khi tài liệu nộp kèm khẳng định mã đó tồn tại.

Rubric gọi tình huống này là **quy tắc chặn G4**: kê khai trong nhật ký sử dụng AI mâu thuẫn với lịch sử Git, tiêu chí TC2.3 nhận 0 điểm và kích hoạt quy trình xác định đạo văn ở Mục 6. Đây là rủi ro nặng nhất mà một lựa chọn cấu hình có thể gây ra.

### Quyết định

Gộp pull request bằng **merge commit**. Tắt hẳn squash và rebase trên cả hai kho.

```
gh repo edit <kho> --enable-merge-commit=true --enable-squash-merge=false --enable-rebase-merge=false --delete-branch-on-merge=true
```

Hai góc nhìn vào cùng một lịch sử, chọn bằng một tham số:

```bash
git log --first-parent --oneline develop   # danh sach moc viec lon
git log --oneline develop                  # toan bo commit hang ngay
```

### Lý do

**Không mất gì so với squash.** Ba lý do ban đầu đều được giữ nguyên:

| Lý do ban đầu | Merge commit có đáp ứng không |
|---|---|
| Lịch sử `develop` đọc như danh sách việc đã xong | Có. `git log --first-parent` cho đúng góc nhìn đó, đã kiểm |
| Hai bạn không cần biết `git rebase -i` | Có. Merge commit cũng không đòi rebase. Lý do này vốn không phân biệt hai cách |
| Gỡ một phân hệ hỏng bằng một lệnh | Có. `git revert -m 1 <mã merge commit>` gỡ trọn cả nhánh, đã kiểm, mã thoát 0 |

**Được thêm ba thứ.** Ngày làm việc thật được giữ, nên chỉ số "tỷ lệ tuần có commit" phản ánh đúng quá trình. Mã commit trích trong tài liệu vẫn hợp lệ sau khi gộp. Và người đọc thấy được một phân hệ được làm trong bao nhiêu ngày, theo thứ tự nào.

**Nguyên tắc rút ra, áp cho cả dự án:** thứ gì là bằng chứng thì không được tối ưu cho đẹp. Lịch sử Git ở đồ án này không chỉ là công cụ của người viết mã, nó là hồ sơ nộp kèm. Làm nó gọn bằng cách xoá bớt là làm hỏng chính thứ nó phải chứng minh.

### Hệ quả

Chấp nhận:

- `git log develop` không còn phẳng, các commit của ba người đan xen theo ngày. Đổi lại có `--first-parent` khi cần gọn, và `--graph` khi cần thấy hình dạng nhánh.
- Số commit trên `develop` sẽ lên tới hàng trăm vào cuối kỳ. Đó là con số đúng, không phải con số xấu.

Được lại:

- Mọi mã commit trích trong tài liệu vẫn tra được sau khi gộp, bằng một lần `git clone` bình thường.
- Chỉ số tuần có commit và độ trải đều của công việc đo được trực tiếp trên nhánh chính.

Vẫn an toàn khi xoá nhánh sau khi gộp: merge commit khiến mọi commit của nhánh thành tổ tiên của `develop`, nên xoá tên nhánh không mất commit nào. Khác hẳn trường hợp squash.

### Phương án đã cân nhắc và bỏ

| Phương án | Vì sao bỏ |
|---|---|
| Squash cho mọi pull request | Xoá commit hằng ngày khỏi nhánh chính, làm hỏng mã commit đã trích trong tài liệu, rơi vào quy tắc chặn G4 |
| Bật cả squash lẫn merge commit, ai thích dùng gì thì dùng | Ba người sẽ chọn khác nhau, lịch sử thành nửa nọ nửa kia, và không ai biết mã commit nào còn hợp lệ |
| Rebase rồi gộp nhanh | Giữ được commit nhưng viết lại toàn bộ mã commit của chúng, tức là phá đúng thứ ADR này muốn bảo vệ. Lại còn đòi hai bạn thạo rebase |
| Squash nhưng giữ lại nhánh, không xoá | Commit vẫn còn nhưng nằm ngoài nhánh chính, muốn tìm phải biết trước tên nhánh. Cuối kỳ có hơn ba mươi nhánh treo |

---

## 2026-09-24 · Hai chỗ trong ADR-003 và ADR-004 không còn đúng với mã

**Loại:** đính chính · **Phạm vi:** ADR-003, ADR-004 · **Commit:** cùng pull request với [ADR-006](#adr-006)

Hai mục trên chuyển nguyên văn nên giữ nguyên chữ; chỗ lệch ghi ở đây theo luật "sai thì thêm mục mới".

| Mục | Viết gì | Thật ra | Bằng chứng |
|---|---|---|---|
| ADR-003, phần "Hai" | Adapter ở `src/common/prisma/prisma.service.ts` | Ở `apps/api/src/infra/prisma/prisma.service.ts`, dời từ bản 0.3 | [c9a015a](https://github.com/F-R-E-Y-A/fashion-shop/commit/c9a015a); [features/platform/LOG.md](features/platform/LOG.md) mục 19/09 |
| ADR-004, quyết định 6 | Nhật ký AI nằm trong kho mã; commit đánh dấu bằng dòng `AI-Assisted` | Nhật ký AI nằm ở kho docs từ khi tách hai kho 19/09. Dấu **bắt buộc** là `Co-Authored-By:`, còn `AI-Assisted:` chỉ là ghi chú phạm vi | `ai-log/README.md` trong [kho docs](https://github.com/F-R-E-Y-A/docs), commit `cf1ca1a` của kho đó |

Phần lý do của ADR-004 (bằng chứng phải nằm cùng chỗ thứ nó chứng minh) vẫn đứng: kho docs đối chiếu được với lịch sử commit của kho mã qua dòng `Co-Authored-By`.

---

<a id="adr-006"></a>
## 2026-09-24 · ADR-006 — Tài liệu theo tính năng, một LOG thay thư mục ADR, và chỉ còn bốn họ mã

**Loại:** quyết định · **Phạm vi:** toàn bộ `docs/`, `AGENTS.md`, mẫu pull request và Issue, chú thích mã trỏ tới tài liệu · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** nhánh `feature/ht-01-docs-restructure`

### Hiện trạng

Đo trên `develop` (`892cf12`), trước khi dời (`git ls-tree`, `wc -l`, `grep -rhoE`):

- 23 tệp `.md`, 2603 dòng; 13 mục ở gốc `docs/`; 4 tệp vượt 300 dòng.
- **Mã trùng nghĩa.** Danh mục use case của Duy dùng `PH-01` cho *Tài khoản*; Issue của sprint S2 dùng `PH1` cho *Trưng bày sản phẩm*. [products/README.md:3](../apps/api/src/modules/products/README.md#L3) ghi `PH-14 (S8)` cho quản trị sản phẩm, trong khi danh mục ghi `PH-14` là *Đổi trả*. Tổng cộng 11 hệ mã sống trong kho: `UC-NN`, `PH-NN(.m)`, `PHn`, `HT-NN`, `ND`, `ADR`, `AC`, `BR`, `E`, `R`, `H`.
- **Lý do nằm rải bốn nơi:** năm tệp `adr/`, `PLATFORM_ROADMAP.md` 424 dòng trộn đánh giá với kế hoạch, bảng "vì sao" trong `README.md` gốc, và các đặc tả.
- **Luật tài liệu nằm trong `docs/README.md`**, không có tệp luật nào mà các agent tự đọc, trong khi nhóm đã dùng ít nhất hai agent khác nhau.
- **Đặc tả lệch mã và lệch Issue:** hình dạng API `{ data, meta }` và `snake_case` so với `toPage()` trong mã; `test-strategy.md` ghi Jest trong khi kho dùng Vitest.

### Tiêu chí, xếp hạng

1. Mỗi nội dung có đúng một chỗ, chỗ khác dẫn link.
2. Ba người sửa tài liệu song song không đụng nhau khi gộp.
3. Hội đồng truy vết được: use case → bài kiểm thử → commit, quyết định → lý do.
4. Ít thứ phải học nhất.

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Mỗi feature một README 7 phần + LOG, thêm `shared/LOG.md`, giữ `adr/` | Ít tệp nhất | README vượt 300 dòng ngay (phần nghiệp vụ của Duy đã 280–386 dòng); `shared/LOG.md` trùng vai `adr/` | Được |
| **B. `shared/` + `features/<module>/` (README, use-cases, LOG), một dãy ADR trong các LOG, bốn họ mã, `AGENTS.md` (chọn)** | Một nơi cho mỗi câu hỏi; tệp của ai nằm trong thư mục của người đó; agent nào cũng đọc cùng một bộ luật | Một lần dời tệp và sửa link; mọi người học lại chỗ để tài liệu | Được, bằng `git mv` ngược |
| C. Giữ cây cũ, chỉ thêm `LOG.md` cạnh `ba/uc-*.md` | Rẻ nhất, không đổi link | Nội dung một feature vẫn rải ở `ba/`, README module, `api-conventions`; mã vẫn trùng nghĩa | Được |
| Không làm gì | Không tốn công | Mã `PH-01` và `PH1` tiếp tục bị hiểu nhầm; lý do tiếp tục rải | — |

**Chọn B.** Thắng ở tiêu chí 1 và 2; tiêu chí 4 thua A một chút vì có thêm `use-cases.md`, chấp nhận vì cắt đặc tả của Duy ra khỏi README là việc lớn hơn nhiều.

Chi tiết đã làm:

- **Cây mới:** gốc `docs/` còn `README` (đọc 15 phút), `LOG`, `CONTRIBUTING`, `TECH_DEBT`; `shared/` giữ quy ước dùng chung; `features/{products,auth,inventory,platform}/`. Dời bằng `git mv` trong một commit riêng không sửa nội dung, để `git log --follow` còn thấy tác giả gốc.
- **Hệ mã còn bốn họ:** việc `PHn` và `HT-NN` (Issue là nguồn), use case `UC-NN.m` cùng `/ACk /BRk /Ek`, quyết định `ADR-NNN` một dãy chung, nợ `ND-NN`. Danh mục use case của Duy (pull request #9, chưa gộp) đang dùng `PH-NN.m`; đổi thành `UC-NN.m` khi Duy sửa pull request hoặc ngay sau khi gộp, không sửa hộ trong nhánh này.
- **Gỡ khỏi kho, đọc lại ở commit `85a9d93`:** năm tệp `adr/` (chuyển nguyên văn lên đầu tệp này), `PLATFORM_ROADMAP.md` (chưng cất vào [features/platform/LOG.md](features/platform/LOG.md) và [README](features/platform/README.md) của nền tảng), `ba/uc-diagram-nhap.md` (bản nháp 13/09 dùng mã `UC-` cũ; sơ đồ thay thế là `uc-tong-quan` trong pull request #9 của Duy).
- **`AGENTS.md` ở gốc kho** giữ mười luật tài liệu và bảng hệ mã; `CLAUDE.md` chỉ trỏ vào đó. Mô hình lấy từ cách làm tài liệu theo tính năng Bảo đang dùng ở nơi làm việc, bỏ phần hợp đồng API viết tay vì dự án này có Swagger sinh từ mã.
- **`tools/docs/lint.mjs`** kiểm frontmatter, dòng Chức năng, trần dòng, link gãy, neo ADR và số ADR trùng. **Chạy tay** bằng `npm run docs:lint`, chưa gắn hook hay CI: nhóm chưa viết tay theo luật này lần nào, tự động hoá trước thì giấu mất chỗ cần hiểu.
- **Chỗ lệch với mã đã sửa trong tài liệu:** mẫu pull request (dấu `Co-Authored-By`), mô tả nhãn `ai-error` trong `tools/github/bootstrap-repo.sh`. Chỗ lệch trong tệp của Duy (`test-strategy.md` ghi Jest, nhãn và nhánh sai) đưa vào review pull request #9.
- **Không chứa pull request #9.** Nhánh dựng từ `develop` (`892cf12`); tệp của Duy vào kho qua chính pull request của Duy, để Duy tự sửa và giữ tên tác giả.

### Kết quả mong đợi → thực tế

Mong đợi: `npm run docs:lint` 0 lỗi; `npm run check` vẫn xanh; ít tệp ở gốc hơn; không còn mã trùng nghĩa.

Thực tế, đo sau khi dời trên cùng nhánh:

| Chỉ số | Trước | Sau |
|---|---|---|
| Tệp `.md` trong `docs/` | 23 | 27 (thêm README và LOG cho bốn feature, ba mẫu, chuẩn giao diện, LOG chung; gỡ 5 ADR, lộ trình, bản nháp) |
| Dòng `.md` trong `docs/` | 2603 | 2556 (lộ trình 424 dòng chưng cất còn một mục LOG; thêm tệp đọc 15 phút) |
| Mục ở gốc `docs/` | 13 | 6 |
| Tệp vượt 300 dòng, không tính LOG | 4 | 2, ghi ở mục Tạm thời của AGENTS.md |
| Hệ mã sống trong kho mã | 11 | 4 họ |
| `npm run docs:lint` | chưa có | 30 tệp đạt, 2 cảnh báo đúng hai tệp Tạm thời |

### Việc còn lại, không chặn gộp

- Pull request #9: Duy đặt tệp theo cây mới (`shared/use-case-index.md`, `shared/diagrams/`, `features/<module>/use-cases.md`), đổi mã `PH-NN.m` thành `UC-NN.m`, xuất lại ảnh draw.io với nhãn mới.
- Tài soát [features/auth/](features/auth/README.md) và [data-model.md](shared/data-model.md).
- Mô tả nhãn `ai-error` trên GitHub vẫn trỏ `docs/ai-log/…`; sửa bằng `gh label edit ai-error -R F-R-E-Y-A/fashion-shop --description "Loi do AI sinh, ghi vao ai-log/hallucinations.md o kho docs"`.

### Điều kiện xem lại

Cuối S4 (11/10). Nếu ba LOG feature đều có mục do chính chủ viết và `docs:lint` sạch mà không ai nhắc, gắn `docs:lint` vào hook `pre-commit` rồi vào CI. Nếu LOG vẫn trống, luật đang quá nặng với ba người, rút bớt.

---

<a id="adr-009"></a>
## 2026-09-24 · ADR-009 — Kiểu riêng của feature viết bằng CSS Modules, token giữ trong một tệp

**Loại:** quyết định · **Phạm vi:** `apps/web`, cả ba người · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi PH1 chuyển trang sản phẩm)

### Hiện trạng

Toàn bộ kiểu nằm trong một tệp [styles.css](../apps/web/src/styles.css), 226 dòng (`wc -l`), chú thích đầu tệp ghi đây là bản 0.1. Tuần này ba người cùng viết giao diện: trang sản phẩm (PH1), trang giỏ hàng (PH2), trang đăng nhập (PH3). Cùng sửa một tệp CSS thì xung đột gộp mỗi tuần, và class `.card` của người này đè class `.card` của người kia mà không ai được báo.

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Tiếp tục một `styles.css` chung | Không học gì mới | Xung đột gộp hằng tuần; đè class âm thầm | — |
| B. Mỗi feature một tệp `.css` thường, class có tiền tố tên feature | Tách tệp, hết xung đột gộp | Tiền tố là lời nhắc, máy không kiểm; quên một lần là đè | Được |
| **C. CSS Modules: `<Tên>.module.css` cạnh thành phần (chọn)** | Vite tự đổi tên class theo tệp nên **không thể** đè nhau; không cài gì, `vite/client` đã khai kiểu | Viết `className={styles.card}` thay vì chuỗi; class cũ phải chuyển dần | Được |
| D. Tailwind | Không phải đặt tên class | Thêm một thư viện và một cách viết cả nhóm phải học giữa sprint | Được nhưng tốn |

**Chọn C**, cùng nguyên tắc với [ADR-004](#adr-004): thứ gì máy ép được thì để máy ép. Token màu, bo góc, phông vẫn ở `styles.css` để có một nguồn; chuẩn dùng ở [shared/design.md](shared/design.md).

### Kết quả mong đợi → thực tế

Mong đợi: tới cuối S2 không có xung đột gộp nào ở tệp CSS; không có mã màu gõ trực tiếp trong tệp `.module.css` (`grep -rn "#[0-9a-fA-F]\{3,6\}" apps/web/src/features` rỗng).
Thực tế: (điền sau Chủ Nhật 27/09).

### Điều kiện xem lại

Nếu nhóm quyết dùng một thư viện thành phần có sẵn cho trang quản trị, xem lại cùng lúc.

---

## 2026-09-24 · Mã dòng việc đổi sang `PH-NN` theo báo cáo tuần

**Loại:** thay đổi · **Phạm vi:** hệ mã trong [ADR-006](#adr-006), toàn bộ tài liệu và chú thích mã · **Commit:** cùng nhánh `feature/ht-01-docs-restructure`

Báo cáo tuần của Bảo ngày 24/09 đánh số ba dòng việc tuần S2 là **PH-01 Khám phá sản phẩm** (Bảo), **PH-02 Giỏ hàng** (Duy), **PH-03 Xác thực và nạp dữ liệu sản phẩm** (Tài). ADR-006 viết `PHn` theo tiêu đề Issue ngày 20/09 (`PH1`–`PH3`, cùng thứ tự). Từ nay mã việc viết `PH-NN`; phạm vi commit viết thường `feat(ph-01)`; nhánh `feature/ph-01-<tên>`.

Chữ `PH` từng mang ba nghĩa, nên phải ghi rõ để tránh nhầm:

| Nguồn | PH-01 là | PH-03 là |
|---|---|---|
| Bảng phân hệ cũ trong `ke-hoach/PhanCongCongViec.md` §3.1.4 (kho docs) | Tài khoản và xác thực | Khám phá sản phẩm |
| Danh mục use case của Duy, pull request #9 (đổi thành `UC-NN.m` khi gộp) | Tài khoản và xác thực | Khám phá sản phẩm |
| **Báo cáo tuần 24/09, dùng từ nay** | **Khám phá sản phẩm** | **Xác thực và nạp dữ liệu** |

Phạm vi PH-02 tuần này chỉ còn bảng giỏ và dòng giỏ với thêm, sửa số lượng, xoá; bỏ giỏ khách vãng lai và gộp giỏ khi đăng nhập. Hệ quả: giỏ chỉ dành cho người đã đăng nhập, nên PH-02 cần `AuthGuard` của PH-03 ngay trong tuần.

Còn lại, không chặn: đổi tiêu đề và phạm vi Issue #6, #7, #8 cho khớp; đánh dấu bảng §3.1.4 trong kho docs là đã cũ.
