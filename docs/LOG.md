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

**Loại:** quyết định · **Phạm vi:** toàn bộ `docs/`, `AGENTS.md`, mẫu pull request và Issue, chú thích mã trỏ tới tài liệu · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** nhánh `task/docs-restructure` gộp vào `feature/platform`

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

**Loại:** thay đổi · **Phạm vi:** hệ mã trong [ADR-006](#adr-006), toàn bộ tài liệu và chú thích mã · **Commit:** cùng nhánh `task/docs-restructure` gộp vào `feature/platform`

Báo cáo tuần của Bảo ngày 24/09 đánh số ba dòng việc tuần S2 là **PH-01 Khám phá sản phẩm** (Bảo), **PH-02 Giỏ hàng** (Duy), **PH-03 Xác thực và nạp dữ liệu sản phẩm** (Tài). ADR-006 viết `PHn` theo tiêu đề Issue ngày 20/09 (`PH1`–`PH3`, cùng thứ tự). Từ nay mã việc viết `PH-NN`; phạm vi commit viết thường `feat(ph-01)`; nhánh `feature/ph-01-<tên>`.

Chữ `PH` từng mang ba nghĩa, nên phải ghi rõ để tránh nhầm:

| Nguồn | PH-01 là | PH-03 là |
|---|---|---|
| Bảng phân hệ cũ trong `ke-hoach/PhanCongCongViec.md` §3.1.4 (kho docs) | Tài khoản và xác thực | Khám phá sản phẩm |
| Danh mục use case của Duy, pull request #9 (đổi thành `UC-NN.m` khi gộp) | Tài khoản và xác thực | Khám phá sản phẩm |
| **Báo cáo tuần 24/09, dùng từ nay** | **Khám phá sản phẩm** | **Xác thực và nạp dữ liệu** |

Phạm vi PH-02 tuần này chỉ còn bảng giỏ và dòng giỏ với thêm, sửa số lượng, xoá; bỏ giỏ khách vãng lai và gộp giỏ khi đăng nhập. Hệ quả: giỏ chỉ dành cho người đã đăng nhập, nên PH-02 cần `AuthGuard` của PH-03 ngay trong tuần.

Còn lại, không chặn: đổi tiêu đề và phạm vi Issue #6, #7, #8 cho khớp; đánh dấu bảng §3.1.4 trong kho docs là đã cũ.

## 2026-09-25 · `feature/platform` là nhánh dài hạn; việc nền tảng đi qua `task/`

**Loại:** thay đổi cách làm việc · **Phạm vi:** [shared/git.md](shared/git.md) mục luật gộp · **Người quyết:** Bảo, 25/09 · **Commit:** nhánh `task/docs-restructure`

Luật cũ ghi "nhánh đã gộp thì xoá" cho mọi nhánh. Bảo chốt giữ `feature/platform` lâu dài vì nền tảng còn sửa nhiều trong các sprint sau: mỗi việc nền tảng là một `task/<tên>` tách từ `feature/platform`, gộp vào đó rồi xoá, và `feature/platform` mở pull request vào `develop` khi có đợt đáng gộp. Kiểm trước khi đổi: kho đang **tắt** tự xoá nhánh khi gộp (`gh api repos/F-R-E-Y-A/fashion-shop` trả `delete_branch_on_merge: false`), nên gộp pull request của `feature/platform` không làm mất nhánh.

Hệ quả đã ghi vào luật: pull request vào `feature/platform` không có CI, vì [ci.yml](../.github/workflows/ci.yml) chỉ chạy cho `develop` và `main`, nên chặn chất lượng dồn về bước `feature/platform` → `develop`; `Closes #N` chỉ tự đóng Issue ở bước đó; sau mỗi lần gộp vào `develop` phải gộp `develop` ngược lại vào `feature/platform` để khỏi lệch.

<a id="adr-026"></a>
## 2026-10-18 · ADR-026 — Giỏ dùng giá/tồn hiện tại, cập nhật website qua SSE trước khi giữ hàng

**Loại:** quyết định · **Phạm vi:** Catalog, Cart, Inventory, web · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

### Hiện trạng

Bảo yêu cầu luồng tham chiếu Shopee: không giữ hàng khi duyệt/thêm giỏ; hết hàng vẫn giữ dòng; chỉ giữ hàng khi chuyển sang payment. Khuyến mãi chờ Duy sửa PR #41, mặc định để trống và giảm 0. Trong phiên, Bảo chọn SSE để cập nhật một chiều bằng thư viện hiện có.

Cart nay gọi hợp đồng Catalog và Inventory trong transaction đang khoá owner ([cart.service.ts:67](../apps/api/src/modules/cart/cart.service.ts#L67)). Giá bán lấy từ biến thể, không dùng giá giả; thiếu dữ liệu kho trả trạng thái chưa biết ([inventory.service.ts:15](../apps/api/src/modules/inventory/inventory.service.ts#L15)). Nguồn code trước thay đổi là commit nền nêu trên.

### Phương án

| Phương án | Được gì | Mất gì |
|---|---|---|
| Poll từ mỗi trình duyệt | Đơn giản | Mỗi tab gửi query lặp ngay cả không có thay đổi |
| **SSE (chọn)** | EventSource, Nest và RxJS sẵn có; tự kết nối lại; một probe chung mỗi API process | Cần stream dài và cấu hình proxy không buffer; cập nhật theo nhịp probe |
| WebSocket | Giao tiếp hai chiều | Thêm quản lý protocol/kết nối cho nhu cầu hiện chỉ server đẩy revision |

Probe theo nhịp trong [catalog-events.service.ts:29](../apps/api/src/modules/products/catalog-events.service.ts#L29), heartbeat ở dòng 45. Chỉ gửi hash công khai; browser refetch query đang mở. Probe dùng polling DB, nên không cam kết tức thời bằng transaction commit. Dừng probe khi không còn subscriber, giữ revision để reconnect sau heartbeat không mất cập nhật.

Cart truyền transaction tuỳ chọn qua public service thay vì gọi connection riêng sau commit: lỗi đọc Catalog rollback thao tác giỏ, tránh client retry cộng lần nữa. Vẫn giữ ownership/advisory lock từ PR #40. Tồn/giá trên giao diện chỉ phục vụ trước checkout; bước đặt đơn cần đọc lại và giữ hàng nguyên tử.

### Kết quả mong đợi → thực tế

Mong đợi: giá list/sale đúng; hết hàng không mất dòng; restock không tự chọn; chỉ tính dòng đã chọn và đủ điều kiện; không tạo reservation; SSE phục hồi sau lỗi; ô khuyến mãi trống. Các trường hợp kiểm tại [cart-live.http.spec.ts](../apps/api/test/cart-live.http.spec.ts), [catalog-events.service.spec.ts](../apps/api/src/modules/products/catalog-events.service.spec.ts), [CartPage.test.tsx](../apps/web/src/features/cart/pages/CartPage.test.tsx) và [StorefrontLiveUpdates.test.tsx](../apps/web/src/app/StorefrontLiveUpdates.test.tsx).

Thực tế: có implementation local; lệnh kiểm, output và SHA của working tree được giữ trong nhật ký phiên ngoài kho mã. Luồng tạo đơn/reservation/payment triển khai tiếp ở [ADR-027](#adr-027); khuyến mãi vẫn chờ Duy.

### Điều kiện xem lại

Khi dữ liệu hoặc tải tăng làm probe chậm, chuyển nguồn sự kiện sang notification/outbox; khi deploy qua proxy cần nghiệm thu buffering và timeout. ADR-025 hiện thuộc PR #41, giữ số này để tránh trùng lúc gộp.

<a id="adr-027"></a>
## 2026-10-18 · ADR-027 — Checkout điều phối đơn/giữ hàng nguyên tử, VNPAY xác nhận tiền qua IPN và query

**Loại:** quyết định · **Phạm vi:** Cart, Orders, Inventory, Payments, Users, Shipping và web · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

### Hiện trạng

Bảo chốt checkout phải đăng nhập; uỷ quyền chọn deadline/ship; yêu cầu làm toàn bộ luồng và tiếp tục bằng fake gateway trên database riêng khi chưa có merchant key. Cart trước đó không giữ hàng. Bảng Order/Payment/Reservation/StockMovement đã tồn tại; migration PH-11 chỉ mở rộng cột/chỉ mục/trạng thái ([migration](../apps/api/prisma/migrations/20261018090000_ph11_checkout_payment/migration.sql)).

### Phương án

| Phương án | Được gì | Mất gì |
|---|---|---|
| Orders gọi Payments, Payments gọi lại Orders | Ít module ban đầu | Vòng phụ thuộc và khó xác định transaction |
| **Checkout orchestrator + service sở hữu bảng (chọn)** | Chung SQL transaction; public boundary; kiểm được tranh mua và rollback | Thêm module điều phối; mọi caller ghi kho phải tuân thứ tự lock |
| Giữ transaction mở tới lúc khách trả tiền | Ý tưởng commit toàn luồng trong một lần | Không phù hợp ngân hàng ngoài DB và thời gian khách thao tác |

Giữ Cart → Order → Inventory, variant được sắp xếp; idempotency tạo đơn lấy khoá key trước Cart. Preview không giữ hàng; fingerprint gồm giá/lượng/địa chỉ/ship, thay đổi phải xác nhận lại ([checkout.service.ts:27](../apps/api/src/modules/checkout/checkout.service.ts#L27), [create:75](../apps/api/src/modules/checkout/checkout.service.ts#L75)).

Giữ hàng 15 phút từ xác nhận sang payment, không gia hạn refresh/retry. Phí nội địa mặc định 30.000đ, miễn từ 500.000đ tiền hàng sau giảm giá; đây là chính sách Freya theo uỷ quyền, không khẳng định giống nội bộ Shopee. Promo tạm trống/giảm 0. Seed dùng zone/rate đã có, không tự nạp tồn kho giả.

VNPAY REST/JSON trước; không thêm SOAP khi chưa có yêu cầu interoperability/rubric cụ thể. URL ký local; callback/query ngoài transaction SQL xác thực HMAC và identity trước settlement. Thành công chốt kho một lần, dọn đúng lượng giỏ; hết hạn nhả hold. Nhận tiền muộn hoặc nhiều lần vào PAYMENT_REVIEW, giữ sự thật tài chính và không tự bán vượt tồn ([settlement.service.ts:41](../apps/api/src/modules/checkout/settlement.service.ts#L41)).

Worker quét từ DB, claim query có điều kiện để các replica không gọi dồn; không cần thêm Job/Outbox khi các bước ghi hiện nằm cùng PostgreSQL transaction. Query nền trong 24h, đơn cũ có thao tác đối soát; chưa có refund tự động hoặc dashboard xử lý ngoại lệ ([payments.service.ts:90](../apps/api/src/modules/payments/payments.service.ts#L90)).

### Kết quả mong đợi → thực tế

Mong đợi: tranh đơn vị cuối một người giữ được; request/IPN lặp không ghi thu/trừ kho lặp; lỗi giữa chừng rollback; timeout không charge mới; restart phục hồi bằng query; return URL không tự nhận tiền. [HTTP PostgreSQL](../apps/api/test/checkout-payment.http.spec.ts), [web](../apps/web/src/features/checkout/checkout.test.tsx), [adapter](../apps/api/src/modules/payments/vnpay.service.spec.ts).

Thực tế: implementation local và test fixture có; lệnh/output/SHA trong nhật ký ngoài repo. Chưa có merchant key nên chưa nghiệm thu VNPAY thật. Hướng dẫn [setup](features/payments/setup.md).

### Điều kiện xem lại

Khi ghép voucher/carrier, thay ngưỡng/fí hoặc cần refund tự động, cập nhật quote/state machine và kiểm hồi quy. Khi tải tăng hoặc cần worker luôn chạy dù API ngủ, tách scheduler vận hành; vẫn dùng dữ liệu/claim bền vững và không giữ DB transaction qua HTTP.

## 2026-10-18 · PH-11 — buộc UTC cho PostgreSQL session khi dùng PrismaPg

**Loại:** sửa lỗi hạ tầng · **Phạm vi:** API, seed, script, crawler · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

Đối chiếu SQL trực tiếp trong nghiệm thu browser phát hiện hold nhìn qua Prisma còn hạn nhưng epoch thật trong PostgreSQL đã hết. Adapter đang cài định dạng Date bằng giờ UTC không kèm offset, và đọc timestamptz bằng thay offset thành UTC (`node_modules/@prisma/adapter-pg/dist/index.mjs:274`, `:353`); Docker đặt timezone Asia/Ho_Chi_Minh (`docker-compose.yml:16`). Có báo cáo cùng cơ chế ở [Prisma issue 28629](https://github.com/prisma/orm/issues/28629).

Buộc `timezone=UTC` qua connection startup options ở [connection.ts:2](../apps/api/src/infra/prisma/connection.ts#L2), dùng chung cho mọi PrismaPg constructor. Giữ các option khác của URL; thêm UTC cuối để không bị option timezone trước đó ghi đè. Không đổi timezone hiển thị của web hoặc định dạng GMT+7 gửi VNPAY. Docker runtime chép helper source để seed chạy bằng tsx vẫn dùng được.

Bài HTTP tạo đơn so sánh `EXTRACT(EPOCH FROM expires_at - CURRENT_TIMESTAMP)` với deadline thực, không chỉ roundtrip Date qua Prisma ([checkout-payment.http.spec.ts](../apps/api/test/checkout-payment.http.spec.ts)). Timestamp legacy không tự sửa khi chưa biết nguồn; theo [ND-16](TECH_DEBT.md). Không dùng ALTER DATABASE hoặc chỉnh toàn bộ dữ liệu để che lỗi kết nối.

<a id="adr-028"></a>
## 2026-10-18 · ADR-028 — Hai payment adapter chung settlement, HTTPS tunnel cho nghiệm thu local

**Loại:** quyết định · **Phạm vi:** Payments, Checkout, web và công cụ dev · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

### Hiện trạng

Bảo yêu cầu chuẩn bị cả VNPAY/MoMo và chọn HTTPS tunnel để thử local trước. VNPAY tạo URL bằng chữ ký local; MoMo cần POST tạo giao dịch. SQL transaction không bao trùm máy chủ gateway bên ngoài. Contract hiện tại ở [payment-gateway.ts:23](../apps/api/src/modules/payments/payment-gateway.ts#L23), MoMo network ở [momo.adapter.ts:98](../apps/api/src/modules/payments/momo.adapter.ts#L98).

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược |
|---|---|---|---|
| Nhánh if theo gateway trong mọi bước checkout | Ít lớp khởi đầu | Lặp xác thực/settlement, đổi gateway chạm nghiệp vụ kho | Có, cần gom logic |
| **Strategy contract + Adapter + Registry (chọn)** | Chuẩn hoá event, chia sẻ kho/đơn/đối soát; thêm cổng có ranh giới rõ | Thêm adapter và registry; phải kiểm contract từng cổng | Có |
| Tách payment thành service ngoài / thêm SOAP | Ranh giới deployment riêng | Thêm network/ops, chưa giải quyết atomicity ngoài PostgreSQL | Tốn công tích hợp lại |

Chọn contract chung để giữ settlement một nơi; adapter chịu trách nhiệm chữ ký, identity và protocol của từng gateway. VNPAY giữ HMAC-SHA512; MoMo IPN dùng HMAC-SHA256; query MoMo trả event sau HTTPS allowlist và correlation checks vì hợp đồng query không công bố chữ ký response. Chỉ resultCode 0 chốt thành công, 9000 còn chờ ([registry:7](../apps/api/src/modules/payments/gateway-registry.ts#L7), [MoMo query:187](../apps/api/src/modules/payments/momo.adapter.ts#L187), [settlement:71](../apps/api/src/modules/checkout/settlement.service.ts#L71)).

Persist init intent trong PaymentTransaction hiện có cùng đơn/hold; sau commit mới gọi MoMo. Timeout giữ PENDING; replay cùng payload/requestId/reference, kể cả cấu hình URL đã đổi. Claim hạn chế gọi đồng thời, worker/query phục hồi khi mất IPN. Không thêm bảng hoặc dependency ([payments.service.ts:63](../apps/api/src/modules/payments/payments.service.ts#L63), [launchLatest:142](../apps/api/src/modules/payments/payments.service.ts#L142)). Đổi gateway trên một đơn đang chờ bị từ chối để tránh hai cổng cùng thu tiền.

Một Quick Tunnel tới Vite, proxy `/api` tới API; cùng public origin cho login và return. Script kiểm SHA256 binary cloudflared chính thức, lưu state ngoài repo và cập nhật URL `.env` nhưng giữ key. Chấp nhận URL thay đổi và không có SLA. [Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) không hỗ trợ SSE ở Quick Tunnel; web fallback polling, localhost vẫn SSE ([vite.config.ts:26](../apps/web/vite.config.ts#L26), [payment-tunnel.mjs:82](../tools/dev/payment-tunnel.mjs#L82), [fallback:42](../apps/web/src/app/StorefrontLiveUpdates.tsx#L42)).

### Kết quả mong đợi → thực tế

Mong đợi: cả hai cổng dùng cùng giữ hàng/settlement; MoMo HTTP ngoài SQL, callback lặp không bán hai lần, timeout replay nhất quán và query phục hồi. Các ca ở [HTTP MoMo](../apps/api/test/checkout-momo.http.spec.ts), [adapter MoMo](../apps/api/src/modules/payments/momo.adapter.spec.ts), [checkout web](../apps/web/src/features/checkout/checkout.test.tsx), [SSE fallback](../apps/web/src/app/StorefrontLiveUpdates.test.tsx). Lệnh/output/SHA lưu trong nhật ký ngoài repo; chưa có key để nghiệm thu gateway thật.

### Điều kiện xem lại

Khi cần domain cố định/SSE public hoặc staging ổn định, chuyển sang named tunnel hoặc deployment thật. Khi thêm gateway mới, mở rộng code/DTO/registry và contract tests; không nhân bản settlement. Khi cần refund/đối soát vận hành, thiết kế nghiệp vụ riêng trước khi quảng bá sẵn sàng production.

<a id="adr-029"></a>
## 2026-10-19 · ADR-029 — Mỗi khách một đơn giữ hàng, link cổng hết hạn trước hold 3 phút, tồn nhập bằng CSV kiểm kê

**Loại:** quyết định · **Phạm vi:** Checkout, Orders, Payments, Inventory, web · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** chưa commit, nền `e7d419437ccfaba8016336b614d9ba820735d518`.

### Hiện trạng

Rà soát end-to-end PH-11 ngày 19/10 thấy ba chỗ hở. (1) Chống trùng đơn chỉ so fingerprint, nên đổi địa chỉ hoặc số lượng là tạo được đơn chờ thứ hai cùng giữ hàng; trả cả hai thì mua trùng. (2) VNPAY URL hết hạn đúng lúc hold hết hạn ([vnpay.service.ts:73](../apps/api/src/modules/payments/vnpay.service.ts#L73)): trả tiền ở phút cuối mà IPN đến trễ thì rơi vào `PAYMENT_REVIEW`, phải hoàn tiền tay. (3) `select count(*) from inventory` trên `fashion_shop` trả `0`, và mã không có đường nào ghi `quantityOnHand` ngoài SALE, nên trên app thật không checkout được. Kèm theo: filter lỗi chỉ lấy mã từ field `error` ([all-exceptions.filter.ts:46](../apps/api/src/common/filters/all-exceptions.filter.ts#L46)); `QUOTE_CHANGED` viết vào `code` nên bị mất.

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược |
|---|---|---|---|
| Tạo đơn mới thì tự huỷ đơn chờ cũ | Khách không phải thao tác | VNPAY URL tạo local, không biết khách đang trả đơn cũ hay không; huỷ xong tiền vẫn về thì sinh `PAYMENT_REVIEW` | Có |
| **Chặn đơn thứ hai, chỉ dẫn về đơn chờ (chọn)** | Không bao giờ hai đơn cùng giữ hàng và cùng thu tiền | Khách phải tự tiếp tục hoặc huỷ đơn cũ | Có |
| **Link cổng hết hạn sớm 3 phút so với hold (chọn)** | IPN/query trễ vẫn chốt được khi hàng còn giữ | Khách còn 12 thay vì 15 phút để trả | Có, đổi một hằng số |
| **Script CSV kiểm kê `sku,quantity` (chọn)** | Dùng được ngay; ghi ADJUSTMENT truy vết; cùng khoá variant với Checkout | Chưa có UI quản trị kho | Có |
| Seed số tồn mẫu | Demo nhanh | Trái luật module Inventory: không sinh tồn giả trên DB đang dùng | Có, nhưng làm bẩn dữ liệu |

**Chọn chặn + đệm + CSV.** `orders.pending()` trả đơn chờ còn hạn của khách ([orders.service.ts:51](../apps/api/src/modules/orders/orders.service.ts#L51)). Cùng fingerprint và cùng cổng thì trả lại đơn đó như cũ; khác thì 409 `PENDING_ORDER_EXISTS` ([checkout.service.ts:117](../apps/api/src/modules/checkout/checkout.service.ts#L117)). Preview trả `pendingOrder` để web khoá nút xác nhận và dẫn về đơn ([CheckoutPage.tsx:157](../apps/web/src/features/checkout/CheckoutPage.tsx#L157)). Khoá Cart của khách đã tuần tự hoá các request tạo đơn, nên không cần khoá mới.

`Payment.expiresAt` = hold trừ 3 phút, dùng cho cả `vnp_ExpireDate` lẫn việc ẩn link; thử lại khi còn dưới 1 phút trả 409 ([payments.service.ts:45](../apps/api/src/modules/payments/payments.service.ts#L45)). Web đếm ngược theo hạn link. MoMo chưa truyền hạn sang cổng; vẫn ẩn link theo `expiresAt`, phải kiểm lại khi có key.

`npm run stock:import -w apps/api -- --file=<csv> [--dry-run]` gọi `applyStockCounts`: tất cả hoặc không dòng nào, từ chối SKU lạ hoặc số nhỏ hơn lượng đang giữ ([stock-count.ts:54](../apps/api/src/modules/inventory/stock-count.ts#L54)). Mã lỗi `QUOTE_CHANGED` chuyển sang field `error` để tới được client.

Nghiệm thu trên app ngày 19/10 lộ thêm một chỗ: QueryDR lỗi đường truyền vẫn bị tính là đã query, nên đơn đã trả tiền phải chờ thêm 305 giây. Nay lỗi đường truyền chỉ lùi claim 30 giây ([settlement.service.ts:124](../apps/api/src/modules/checkout/settlement.service.ts#L124)); mã phản hồi QueryDR không dùng được được ghi log.

### Kết quả mong đợi → thực tế

Mong đợi: [checkout-payment.http.spec.ts](../apps/api/test/checkout-payment.http.spec.ts) có hai ca mới (đệm hạn, một đơn chờ kể cả 5 request đua); [inventory-stock-count.http.spec.ts](../apps/api/test/inventory-stock-count.http.spec.ts), [stock-count.spec.ts](../apps/api/src/modules/inventory/stock-count.spec.ts) và [checkout.test.tsx](../apps/web/src/features/checkout/checkout.test.tsx) xanh.
Thực tế: điền khi có commit; lệnh và output của phiên lưu ngoài repo.

### Điều kiện xem lại

Duy làm UI/API nhập kho thì `applyStockCounts` thành lõi dùng chung hoặc bị thay. Đo được IPN VNPAY trễ hơn 3 phút thì tăng đệm. Có guest checkout hoặc giỏ nhiều đơn song song thì xét lại luật một đơn chờ.

<a id="adr-030"></a>
## 2026-10-20 · ADR-030 — Nhả hold thì chọn lại món của đơn trong giỏ; preview chỉ ra đơn đang chờ

**Loại:** quyết định · **Phạm vi:** Checkout (Bảo), Cart (Duy) · **Trạng thái:** đề xuất · **Người quyết:** Bảo, Duy review Cart · **Commit:** (điền khi thi hành)

### Hiện trạng

Hold của đơn chờ trừ vào tồn khả dụng, kể cả với chính khách giữ hàng. Giữ đơn vị cuối thì mọi lần đọc giỏ thấy `OUT_OF_STOCK` và lưu bỏ chọn bền vững ([cart.service.ts:137](../apps/api/src/modules/cart/cart.service.ts#L137)). Kiểm trên Chrome ngày 20/10 với DB E2E: hủy đơn xong, món vẫn bị bỏ chọn, Checkout báo "Chọn sản phẩm đủ tồn kho" và không có lối ra; còn lúc đơn đang chờ thì preview báo đúng câu đó thay vì chỉ ra đơn chờ.

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Cart trừ reservation của chính chủ giỏ khỏi tồn khả dụng | Gốc rễ: giỏ không báo hết hàng với người đang giữ | Cart phải biết đơn/reservation của chủ, đổi hợp đồng Inventory, chạm nhiều test của Duy | Được, nhưng tốn |
| **B. Nhả hold thì `cart.reselectReleased`; preview có đơn chờ mà giỏ không đặt được thì 409 `PENDING_ORDER_EXISTS` kèm mã đơn (chọn)** | Hai điểm khách thật sự gặp được sửa, cùng transaction và khoá giỏ hiện có | Trong lúc giữ, trang giỏ vẫn hiện hết hàng với chính khách | Được: bỏ một lời gọi và một nhánh catch |
| Không làm gì | Không đổi mã | Khách hủy đơn phải tự tick lại; Checkout cụt đường khi đang giữ đơn vị cuối | — |

**Chọn B** vì sửa đúng hai đường cụt đã thấy trên trình duyệt mà không đổi hợp đồng Inventory của Duy. Trade-off chấp nhận: trạng thái hết hàng giả trên trang giỏ trong lúc giữ vẫn còn, ghi trong [README Cart](features/cart/README.md).

### Kết quả mong đợi → thực tế

Mong đợi: test HTTP `hủy đơn giữ đơn vị cuối thì món được chọn lại trong giỏ` xanh; trên Chrome hủy đơn xong món được chọn, Checkout có đơn chờ hiện mã đơn và link "Xem đơn đang chờ".
Thực tế: điền khi có commit; lệnh và output của phiên lưu ngoài repo.

### Điều kiện xem lại

Duy làm phương án A trong Cart/Inventory thì bỏ `reselectReleased` và nhánh 409 của preview.
