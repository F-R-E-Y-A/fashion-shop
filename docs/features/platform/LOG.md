---
title: Nền tảng — nhật ký quyết định và thay đổi
updated: 2026-09-24
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
