---
title: Nền tảng — nhật ký quyết định và thay đổi
updated: 2026-11-14
status: đang dùng
owner: Bảo
---
# Nền tảng — nhật ký (chỉ thêm vào cuối)

Quyết định chạm cả nhóm (kiến trúc, công nghệ, cách gộp) nằm ở [docs/LOG.md](../../LOG.md). Tệp này ghi những gì riêng của nền tảng: đánh giá, các bản đã qua, số đo. Khuôn một mục: [LOG-entry.md](../../shared/templates/LOG-entry.md).

---

## 2026-09-13 · Dựng khung bản 0.1 (HT-01)

**Loại:** thay đổi mã · **Phạm vi:** toàn kho · **Commit:** [060abea](https://github.com/F-R-E-Y-A/fashion-shop/commit/060abea)

Máy chủ NestJS 12, Prisma 7, React 19, Postgres 17 trong Docker; một module mẫu `products`, khuôn lỗi thống nhất, đặc tả API tự sinh, `CODEOWNERS`, mẫu pull request và một đường ống CI hai chặng. Tái lập được từ số không: ba lệnh ra lại 3 danh mục và 10 sản phẩm.

---

## 2026-09-15 · Đánh giá bản 0.1: thiếu cơ chế, không thiếu tính năng

**Loại:** đánh giá · **Phạm vi:** nền tảng · **Commit:** [6dad157](https://github.com/F-R-E-Y-A/fashion-shop/commit/6dad157) · **Bản đầy đủ:** [PLATFORM_ROADMAP.md tại 85a9d93](https://github.com/F-R-E-Y-A/fashion-shop/blob/85a9d93/docs/PLATFORM_ROADMAP.md), gỡ khỏi kho ngày 24/09 theo [ADR-006](../../LOG.md#adr-006)

Kết luận khi đó: thứ đang thiếu là **cơ chế** mà hai bạn sẽ chép theo từ 21/09, không phải tính năng. Năm phát hiện, xếp theo ảnh hưởng:

| # | Phát hiện | Bằng chứng lúc đó | Kết cục |
|---|---|---|---|
| 1 | CI sẽ đỏ cả hai job: `prisma generate` thiếu `DATABASE_URL`; `migrate deploy` không sinh client nên seed không tìm thấy module | `ci.yml:29-30`, `:69-73` tại `6dad157`; tái hiện `PrismaConfigEnvError` và `ERR_MODULE_NOT_FOUND` trên máy | Sửa ở [44e3d57](https://github.com/F-R-E-Y-A/fashion-shop/commit/44e3d57). **`develop` vẫn còn lỗi này tới khi gộp #2** |
| 2 | Không có kiểm thử và lint, nên mọi module chép theo cũng không có | 0 tệp `*.spec.ts`; thiếu `eslint.config.*`, `vitest.config.*` | Có ở [c9a015a](https://github.com/F-R-E-Y-A/fashion-shop/commit/c9a015a) |
| 3 | Ranh giới chỉ ép ở khâu duyệt; `CODEOWNERS` trỏ thư mục không tồn tại; một `schema.prisma` gán cho Tài | `CODEOWNERS:22-24, 32-33, 43-45` tại `6dad157` | Luật ESLint tự viết, lược đồ tách ba tệp theo chủ, ở `c9a015a` |
| 4 | Chưa có đường ra sản xuất: không Dockerfile, CI không dựng image, chưa có môi trường thử | kiểm kê thư mục | Dockerfile, `compose.prod.yml`, `render.yaml`, `cd-staging.yml` ở `c9a015a`; **môi trường thử chưa nối biến**, xem [README](README.md) |
| 5 | Biến môi trường không được kiểm lúc khởi động; kiểu dữ liệu giao diện gõ tay | `app.module.ts:17-20` tại `6dad157` | Kiểm bằng zod ở `c9a015a`; sinh kiểu từ OpenAPI còn là ND-02 |

Sáu câu hỏi đã đặt ra và cách đã chốt:

| Câu hỏi | Chốt | Ở đâu |
|---|---|---|
| Môi trường thử chạy ở đâu | Render cho máy chủ, Vercel cho giao diện, **tạm**; chuyển Azure sau | [staging.md](staging.md), ND-07 |
| Bộ lint | ESLint + Prettier | `eslint.config.js` |
| Bộ chạy kiểm thử | Vitest, vì Nest 12 chỉ còn ESM | [testing.md](../../shared/testing.md) |
| Hook trước commit | Có, bản nhẹ | `simple-git-hooks` + `lint-staged` |
| Thư viện sinh kiểu từ OpenAPI | Hoãn tới khi hợp đồng ổn định | ND-02 |
| Phục vụ web trong image | nginx | `apps/web/nginx.conf` |

Năm rủi ro đã nêu và kết cục: **R1** Nest 12 quá mới, đóng ngày 19/09 sau khi `npm view <gói> peerDependencies` cho thấy sáu thư viện lõi đều nhận Nest 12, giữ Nest 12 ESM. **R2** hướng dẫn trên mạng viết cho Prisma cũ, xử lý bằng [ADR-003](../../LOG.md#adr-003) và module mẫu. **R3** tuần 1 quá tải, đã qua. **R4** ba người cùng tạo migration, xử lý bằng luật một pull request một migration trong [CONTRIBUTING.md](../../CONTRIBUTING.md) và chặng kiểm lệch lược đồ. **R5** `CODEOWNERS` cần khoá nhánh, còn mở dưới dạng ND-08 và ND-11.

Một đề xuất của bản đánh giá **đã bị bác**: định nghĩa sẵn Redis, Meilisearch, MinIO dưới dạng profile Compose. Bảo chốt ngày 19/09 là không vẽ sẵn dịch vụ nào; `docker-compose.yml` chỉ có Postgres.

---

## 2026-09-19 · Bản 0.2 tới 0.4 xong: cơ chế chất lượng, ranh giới, đường ra sản xuất

**Loại:** thay đổi mã · **Phạm vi:** toàn kho · **Commit:** [44e3d57](https://github.com/F-R-E-Y-A/fashion-shop/commit/44e3d57), [c9a015a](https://github.com/F-R-E-Y-A/fashion-shop/commit/c9a015a)

Luật ESLint ranh giới tự viết kèm bộ kiểm tám trường hợp; lược đồ Prisma tách ba tệp theo chủ; web đổi cây `app/ core/ ui/ features/`; Vitest hai dự án; CI sáu chặng; Dockerfile hai ứng dụng và `compose.prod.yml`; `render.yaml` và `vercel.json`; kiểm biến môi trường bằng zod; ba hook git. Lý do chung ở [ADR-004](../../LOG.md#adr-004).

Kiểm chứng ghi lúc đó, tất cả bằng lệnh: `npm run check` xanh; `npm run test:http` 9/9 trên Postgres thật; `db:drift` trả mã 2 khi cố tình thêm bảng thiếu migration và 0 khi khớp; hai image dựng xong; `compose.prod.yml` từ volume trắng trả `/api/healthz` đúng `gitSha`, `/api/products` total 10.

---

## 2026-09-20 · Cấu hình hai kho GitHub và lượt chạy đầu của workflow gán người duyệt

**Loại:** cấu hình · **Phạm vi:** GitHub · **Commit:** [afffaa6](https://github.com/F-R-E-Y-A/fashion-shop/commit/afffaa6), [5ee862c](https://github.com/F-R-E-Y-A/fashion-shop/commit/5ee862c), [85a9d93](https://github.com/F-R-E-Y-A/fashion-shop/commit/85a9d93)

Nhánh `main`, `develop`; chỉ bật merge commit ([ADR-005](../../LOG.md#adr-005)); nhãn `ph`, `ht`, mức độ lỗi; milestone S1 tới S11. Kho riêng tư gói Free không khoá được nhánh và không tự đọc `CODEOWNERS`, nên có workflow `pr-reviewers.yml` gán thay. Bảy lượt chạy đầu và nợ ND-11 ghi ở [github-setup.md](github-setup.md) mục 6.

---

## 2026-09-25 · Hồ sơ phản biện các mục nền tảng, 15/09 tới 25/09

**Loại:** phản biện, bổ sung · **Phạm vi:** các mục 15/09, 19/09, 20/09 phía trên và việc gộp PR #12 · **Nguồn:** [nhật ký AI tuần 38](https://github.com/F-R-E-Y-A/docs/blob/6d635d2/ai-log/2026-W38.md), [sổ lỗi AI](https://github.com/F-R-E-Y-A/docs/blob/main/ai-log/hallucinations.md)

Phản biện của các quyết định chạm cả nhóm (ADR-004, ADR-005, nhánh dài hạn) nằm ở [docs/LOG.md](../../LOG.md), mục cùng ngày; ở đây chỉ ghi phần riêng của nền tảng.

| Mục | Bên | Nội dung | Kết cục |
|---|---|---|---|
| 15/09 đánh giá | AI gợi ý | Tách mỗi phân hệ thành gói trong `packages/`; định nghĩa sẵn profile Compose cho Redis, Meilisearch, MinIO | Bỏ: Bảo cho là sai cỡ với nhóm ba người, chỉ thêm dịch vụ khi phân hệ cần |
| 19/09 sửa CI | Người phản biện | Bảo yêu cầu tái hiện hai lỗi CI trên máy trước khi sửa, không sửa mò | Giữ: `PrismaConfigEnvError` và `ERR_MODULE_NOT_FOUND` tái hiện được rồi mới vá |
| 19/09 sửa CI | AI sai | H-04 sinh Prisma Client mà thiếu `DATABASE_URL`; H-05 chạy seed khi chưa sinh client | CI trong môi trường trắng bắt được |
| 24/09 PR #9 đỏ | AI kiểm | CI của PR #9 đỏ vì chạy `ci.yml` cũ của `develop`, cùng hai lỗi trên, không phải lỗi của Duy | Ghi vào trạng thái nền tảng; cần một sự kiện mới trên PR để chạy CI bản mới |
| 25/09 PR #11 đỏ | AI kiểm | Chặng 4 đỏ vì `db:drift` thấy chỉ mục `UNIQUE NULLS NOT DISTINCT` viết tay mà Prisma không mô tả; 44 ràng buộc `CHECK` viết tay **không** bị báo lệch | Xác nhận chặng kiểm lệch làm đúng việc; `CHECK` viết tay dùng được |

**Kết luận:** giữ nguyên tắc "cơ chế xong sớm, dịch vụ đến đúng tuần" và luật "tái hiện rồi mới sửa". **Bằng chứng:** [nhật ký tuần 38 dòng 8](https://github.com/F-R-E-Y-A/docs/blob/6d635d2/ai-log/2026-W38.md#L8), [mục 15/09 dòng 48](https://github.com/F-R-E-Y-A/fashion-shop/blob/58f45e9/docs/features/platform/LOG.md#L48), [commit 44e3d57](https://github.com/F-R-E-Y-A/fashion-shop/commit/44e3d57); log CI chặng 4 của PR #11 dòng `Removed unique index on columns (product_id, size, color)`.

## 2026-09-28 · Bỏ Buildx cache khỏi gate image CI

**Loại:** sửa pipeline · **Phạm vi:** `.github/workflows/ci.yml` · **PR:** [#17](https://github.com/F-R-E-Y-A/fashion-shop/pull/17).

CI của PR #17 đã build xong image API nhưng bị hủy khi xuất layer lên GitHub Actions Cache ở bước `Dung image may chu`; bước web build và chạy thử image chưa kịp bắt đầu. Bỏ `cache-from`/`cache-to` ở cả hai image để gate kiểm tra việc build và chạy thật không phụ thuộc cache. Đổi lại, các lượt CI có thể build lâu hơn. Xem lại khi có số đo build ổn định hoặc cache exporter được khắc phục.

## 2026-10-04 · Đối chiếu runtime local và deploy staging

Compose đã có Mailpit và Redis (`docker-compose.yml:28`, `:40`); README cũ nói chưa có Redis/Compose chỉ PostgreSQL đã được sửa. Seed Catalog chỉ nạp bảng tra cứu (`apps/api/prisma/seed/catalog.seed.ts:51`), không hứa máy mới có product mẫu.

`gh run view 37128704142 -R F-R-E-Y-A/fashion-shop --log-failed` đọc ngày 04/10 trả `Chua dat RENDER_DEPLOY_HOOK_URL`. CI thành công không đồng nghĩa CD đã deploy thành công. Blueprint, entrypoint và staging.md có thay đổi local từ phiên trước, chưa commit/push; phiên tổng hợp giữ nguyên chúng. Backup local ghi trong SESSION ngày 03/10 chưa chứng minh restore hoặc backup cloud.

Code-tour sửa hướng dẫn pool thành cấu hình `max` của pg.Pool theo adapter đang cài và tài liệu node-postgres; không thay pool runtime. Các log cũ giữ là lịch sử, không sửa hồi tố trạng thái quyết định.

---

<a id="adr-057"></a>
## 2026-11-12 · ADR-057 — Sao lưu DB môi trường thử bằng script chạy tay: `pg_dump -Fc` trong image `postgres:17-alpine` có sẵn, khôi phục chỉ vào DB trống trong một transaction

**Loại:** quyết định · **Phạm vi:** nền tảng: `tools/db/`, DB `fashion-shop-db` trên Render, runbook [staging.md](staging.md) mục "Dữ liệu và backup" · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi thi hành)

### Hiện trạng
- DB thử là PostgreSQL 17 gói Free ([render.yaml:63-68](../../../render.yaml)). Render Free không có backup hay PITR, DB hết hạn sau 30 ngày ([staging.md](staging.md) mục "Dữ liệu và backup"). Ngày hết hạn: [TBD — Bảo xem trên Render].
- Trước việc này kho không có script sao lưu. Lần nạp catalog ngày 08/11 dùng `pg_dump` và `psql` gõ tay ([staging.md](staging.md) mục 4).
- Kho đang công khai: `gh repo view F-R-E-Y-A/fashion-shop --json visibility` → `PUBLIC` (12/11).
- File dump chứa email và mật khẩu đã băm của người dùng.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Nâng DB lên gói trả phí của Render | Render tự sao lưu; khôi phục theo thời điểm trong 3 ngày (Hobby) hoặc 7 ngày (Pro) | Có phí; PITR ngắn hạn, vẫn cần bản sao ngoài Render để giữ lâu | Dễ |
| B. Workflow GitHub Actions theo lịch chạy `pg_dump`, lưu artifact | Tự chạy, không phụ thuộc máy ai | Thêm secret URL DB vào GitHub. Kho công khai nên artifact phải mã hoá trước khi tải lên (suy luận: người đọc được kho thì tải được artifact), thêm một khoá phải giữ | Dễ |
| **C. Script chạy tay trên máy Bảo (chọn)**: `pg_dump -Fc` trong image đã có; URL nhập qua ô che, vào container bằng `-e TÊN`; ghi `.partial`, đọc lại bằng `pg_restore --list` rồi mới đổi tên; khôi phục chỉ vào DB trống với `--single-transaction --exit-on-error` | Không thêm tài khoản, secret hay gói; không tải gì; file hỏng lộ ra ngay; khôi phục lỗi thì DB đích giữ nguyên | Phụ thuộc người nhớ chạy; mất phần ghi sau lần dump gần nhất; chỉ chạy trên máy có Docker và PowerShell 7 | Dễ: xoá ba tệp `tools/db/` |
| Không làm gì | Không tốn công | DB hết hạn là mất tài khoản thử, đơn thử và dữ liệu nghiệm thu | — |

**Chọn C** vì staging chỉ cần sống tới hết đợt nộp (08/12), dữ liệu nhỏ (1,37 MB trên DB dev cùng cấu trúc ngày 12/11) và ít người ghi; chạy tay ở các mốc là đủ. Trade-off chấp nhận: không có lịch tự động; chỗ còn hở về bí mật trong lúc chạy ghi ở [pg-backup.psm1:88-92](../../../tools/db/pg-backup.psm1#L88).

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| Câu hỏi phản biện | Vì sao không lên lịch tự động? | Kho công khai và file có dữ liệu người dùng: tự động trên GitHub cần thêm mã hoá và khoá. Tới 08/12, chạy tay rẻ hơn; xem "Điều kiện xem lại" |
| AI gợi ý | Claude Code (Opus 5.5, agent nền, 12/11) viết ba tệp `tools/db/` và runbook; phiên chính soát cách truyền bí mật, việc không in URL, link | giữ |
| AI gợi ý | Claude Code (phiên chính, 12/11): lệnh nạp catalog ở staging.md mục 4 đưa URL vào dòng lệnh `docker` qua `-e "DBURL=..."` | sửa: đổi sang `-e DBURL`, docker lấy giá trị từ biến môi trường |

**Kết luận:** Chọn C, chờ Bảo chốt cùng nơi giữ bản mã hoá và DB đích.
**Bằng chứng:** chạy lại ngày 12/11 lúc 16:55 bằng chính các hàm của module, nguồn là DB dev `fashion_shop` (chỉ đọc), đích là DB tạm đã xoá sau đó. Sao lưu 13,2 s: 1,37 MB, 362 mục TOC, 56 bảng, `SourceRows` `products=90, product_variants=339, users=4, orders=22`. Khôi phục 14,1 s, `TargetRows` khớp. Lần hai không `-Force` bị chặn vì DB đích đã có 56 bảng. Diễn tập đầy đủ hơn (role không phải superuser, `-Force`, sai mật khẩu) ở [staging.md](staging.md) mục "Sao lưu và khôi phục bằng script".

### Kết quả mong đợi → thực tế
Mong đợi: có ít nhất một bản sao lưu staging đọc được trước buổi 15/11; khôi phục sang DB mới trước ngày hết hạn với `TargetRows` khớp `SourceRows`.
Thực tế: (điền sau khi Bảo chạy với URL thật).

### Điều kiện xem lại
Staging phải giữ dữ liệu sau 08/12, có dữ liệu không tạo lại được, hoặc có lần quên chạy trước một mốc: chuyển sang A, hoặc B có mã hoá.

<a id="adr-065"></a>
## 2026-11-14 · ADR-065 — Mỗi commit trên develop có một lượt CI riêng; CD ghim commit và không lùi staging

**Loại:** quyết định · **Phạm vi:** `.github/workflows/ci.yml`, `.github/workflows/cd-staging.yml`, `tools/evidence/github-metrics.mjs`; mọi người gộp vào `develop` · **Trạng thái:** đề xuất · **Người quyết:** Bảo · **Commit:** (điền khi thi hành)

### Hiện trạng
- CI giữ một lượt mỗi nhánh và huỷ lượt cũ (`group: ci-${{ github.ref }}`, `cancel-in-progress: true`, `ci.yml:20–22` ở `5cfcf85`). Gộp dồn vào `develop` thì lượt CI của commit giữa bị huỷ, CD của nó bị bỏ qua (`cd-staging.yml:31` chỉ chạy khi CI xanh).
- Đo 14/11 bằng `gh run list -R F-R-E-Y-A/fashion-shop`: 40 lượt CI push `develop` gần nhất có 32 xanh, 8 bị huỷ. CD từ trước tới nay có 10 lượt xanh, 8 bỏ qua, 2 bị huỷ. Đợt 13/11 08:52–08:56 có 4 lần gộp nhưng chỉ 1 lần triển khai.
- CD gọi Render Deploy Hook không kèm commit, nên Render dựng commit mới nhất của `develop`. Commit này có thể chưa chạy xong CI (suy luận từ tài liệu Render: hook nhận `ref` để chỉ định commit, https://render.com/docs/deploy-hooks).
- Script minh chứng tính run bị huỷ là "không xanh" (`github-metrics.mjs:58–59` ở `5cfcf85`).
- Kết quả xanh của PR không hết hạn khi `develop` đổi (ruleset 26305126, `strict_required_status_checks_policy: false`). Quyết định này không sửa chỗ đó.

### Phương án
| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Giữ nguyên, nhóm gộp từng PR một | Không sửa gì | Phụ thuộc kỷ luật; 13/11 đã gộp dồn | — |
| **B. Mỗi commit push có nhóm CI riêng; CD gọi hook kèm `ref`; CD bỏ qua nếu staging đã chạy bản chứa commit này (chọn)** | Mỗi lần gộp có CI và CD riêng; biết lần gộp nào làm đỏ; Render dựng đúng commit đã qua CI; staging không lùi về bản cũ khi CI xanh lệch thứ tự | Thêm phút Actions (kho công khai nên không tính phí, suy luận); nhóm `cd-staging` chỉ giữ một lượt chờ, gộp sát nhau thì CD ở giữa vẫn bị thay | Dễ: trả lại ba khối YAML |
| C. Merge queue | Kiểm cả bản ghép trước khi vào `develop`, gộp lần lượt | Đổi ruleset và cách gộp của cả nhóm; mỗi lần gộp chờ khoảng 10 phút | Dễ |
| D. Bật strict | Kiểm bản ghép trước khi gộp | Mỗi lần cập nhật nhánh mất approve (`dismiss_stale_reviews_on_push`, đã xảy ra ở #89) | Dễ |

**Chọn B** vì sửa được việc nuốt CI/CD và việc dựng nhầm commit mà không đổi cách làm của nhóm. C để sau: ô "Require merge queue" có trong ruleset (Bảo mở Settings → Rules, xem chỉ đọc 14/11). Trade-off chấp nhận: bản ghép vẫn chỉ được kiểm sau khi vào `develop`; giao diện trên Vercel vẫn không chờ CI ([staging.md](staging.md) mục "Ai bấm gì").

### Phản biện
| Bên | Nội dung | Kết cục |
|---|---|---|
| Câu hỏi phản biện | Bảo hỏi gói này có chặn được việc CI cũ gộp vào `develop` rồi mới biết lỗi không | Không: chỉ C hoặc D chặn được; B giúp biết đúng lần gộp nào làm đỏ |
| AI gợi ý | Claude Code (Opus 5.5, 14/11): chỉ bỏ huỷ CI sẽ khiến CD của commit cũ kích Render dựng commit mới nhất chưa qua CI, nên phải ghim `ref`; CI song song có thể xanh lệch thứ tự, nên thêm bước bỏ qua | giữ |

**Kết luận:** Mỗi commit trên `develop` có một lượt CI và một lượt CD riêng, Render dựng đúng commit đã qua CI, staging không lùi về bản cũ.
**Bằng chứng:** [0f94a83](https://github.com/F-R-E-Y-A/fashion-shop/commit/0f94a83) (`ci.yml`), [d47a9c8](https://github.com/F-R-E-Y-A/fashion-shop/commit/d47a9c8) (`cd-staging.yml`), [d6efa20](https://github.com/F-R-E-Y-A/fashion-shop/commit/d6efa20) (script) · `node tools/evidence/github-metrics.mjs --since 2026-09-09` ngày 14/11 → CI xanh 147/182 = 81%, bỏ run bị huỷ 147/167 = 88%; CI trên develop xanh / bị huỷ / tổng = 47 / 8 / 56; 10 lần triển khai tự động, cả 10 trong tuần 09/11; gộp → staging trung vị 15 phút, p90 19 phút.

### Kết quả mong đợi → thực tế
Mong đợi: từ lúc gộp, CI push `develop` không còn lượt `cancelled`; lần gộp trong lúc CI trước còn chạy cho hai lượt CD, mỗi lượt gọi Render với `ref` đúng commit (xem log bước "Goi Render", Render Events); script tách được CD "đã có trong bản mới hơn".
Thực tế: (điền sau lần gộp thử).

### Điều kiện xem lại
CD vẫn bị thay khi gộp sát nhau và làm hụt số lần triển khai, hoặc `develop` đỏ vì bản ghép chưa kiểm: chuyển sang C.

## 2026-11-14 · Không bật merge queue tới 22/11; PR vào `feature/**` có CI

**Loại:** cấu hình · **Phạm vi:** `.github/workflows/ci.yml`, cách gộp vào `develop`, PR `task/` → `feature/` · **Commit:** (điền khi gộp)

Đã thử thêm trigger `merge_group` để bật merge queue cho `develop` ([4292f41](https://github.com/F-R-E-Y-A/fashion-shop/commit/4292f41), PR #121), rồi Bảo bỏ cùng ngày; commit hoàn tác nằm trong cùng PR với mục này. Ruleset 26305126 chưa từng đổi. Số `adr-066` đã ghi ở 4292f41 rồi gỡ, không dùng lại.

Lý do bỏ: merge queue chỉ thêm một thứ so với [ADR-065](#adr-065): kiểm bản ghép trước khi vào `develop`. Hiện nay PR chỉ bị chặn khi có conflict git; `develop` mới hơn mà không conflict thì kết quả CI cũ vẫn được tính (`strict_required_status_checks_policy: false`). Lỗi kiểu này mới xảy ra 1 lần trong 46 lượt CI `develop`. Khi xảy ra, CD không chạy, staging giữ bản cũ đúng, và với ADR-065 biết ngay lần gộp nào gây ra. Cái giá: mỗi PR chờ thêm một lượt CI, bấm → staging từ khoảng 13–15 lên khoảng 23–25 phút, vì CI chạy hai lần trên cùng commit. Cắt được lượt thừa nếu CD chạy theo CI của hàng chờ, nhưng phải sửa CD và cách đo đúng tuần cuối.

| Chỉ số (đo bằng lệnh nào) | Giá trị 14/11 |
|---|---|
| CI xanh, thời gian từ lúc tạo tới lúc xong (`gh run list -w CI -s success -L 30`) | trung bình 9,4 phút (PR, 25 lượt), 10,0 phút (push `develop`, 5 lượt); chặng chậm nhất là 4, 6–11 phút |
| CD xanh (`gh run list -w "CD staging" -s success -L 8`) | 2–5 phút |

Cùng mục: PR vào `feature/**` có CI (việc #56 gói 5), để mã trên nhánh feature được kiểm sớm thay vì chỉ qua hook ở máy. Không chặn gộp vì nhánh feature không có ruleset; mỗi PR task thêm khoảng 10 phút chờ kết quả.

Xem lại khi: `develop` đỏ vì bản ghép thêm lần nữa, hoặc số lần triển khai bị hụt do gộp dồn. Khi đó bật merge queue kèm CD chạy theo CI của hàng chờ. Tài liệu đã sửa theo: [staging.md](staging.md), [git.md](../../shared/git.md).
