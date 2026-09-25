---
title: Fashion-shop trong 15 phút
updated: 2026-09-24
status: đang dùng
owner: Bảo
---
# Fashion-shop trong 15 phút

**Chức năng:** Đọc một tệp hiểu 80% dự án: sản phẩm, kiến trúc, đường đi một yêu cầu, luật, Git, CI/CD, triển khai, làm một feature, tài liệu ở đâu.

Mỗi mục dưới đây là bản rút gọn, cuối mục có link tới chỗ đầy đủ. Luật cho người và agent: [AGENTS.md](../AGENTS.md).

## 1. Sản phẩm và nhóm

Website bán quần áo: khách xem sản phẩm, chọn cỡ và màu, bỏ vào giỏ, đặt hàng, thanh toán qua cổng thử nghiệm; quản trị quản lý hàng và đơn. Ba người, khoảng 12 giờ mỗi người mỗi tuần, 11 sprint một tuần (milestone S1 tới S11 trên GitHub), họp giảng viên tối Chủ Nhật.

| Người | Làm | Bảng dữ liệu (tệp `prisma/schema/`) |
|---|---|---|
| Bảo | Nền tảng; sản phẩm, danh mục, tìm kiếm, thanh toán, khuyến mãi | `catalog.prisma` |
| Duy | Giỏ hàng, tồn kho, đơn hàng, vận chuyển; kiểm thử đầu cuối | `orders.prisma` |
| Tài | Tài khoản, phân quyền, đánh giá, đổi trả, báo cáo; dữ liệu và sơ đồ quan hệ thực thể tổng | `identity.prisma` |

Hai kho trong tổ chức `F-R-E-Y-A`: **`fashion-shop`** (kho này: mã và tài liệu phải sửa cùng mã) và **[`docs`](https://github.com/F-R-E-Y-A/docs)** (kế hoạch, sổ tiến độ, nhật ký AI, minh chứng, báo cáo nộp khoa).

## 2. Kiến trúc trong một hình

```text
Trình duyệt ──▶ apps/web  React 19 + Vite, TanStack Query        (Vercel)
                   │  fetch JSON, chỉ qua core/http.ts
                   ▼
                apps/api  NestJS 12 ESM, một khối chia module   (Render, Docker)
                   │  Prisma 7, một bể kết nối dùng chung
                   ▼
                PostgreSQL 17
```

**Một khối module hoá, không microservices**: ranh giới giữa ba người là module, không phải tiến trình ([LOG#adr-001](LOG.md#adr-001)). **Một cơ sở dữ liệu duy nhất** ([ADR-002](LOG.md#adr-002)). **Cơ chế xong sớm, dịch vụ đến đúng tuần**: chưa có Redis, hàng đợi hay Meilisearch, thêm vào tuần phân hệ cần ([ADR-004](LOG.md#adr-004), [lộ trình](features/platform/README.md)).

## 3. Một yêu cầu đi qua những gì

Hiểu đường này là hiểu phần lớn kho mã. Ví dụ: mở trang sản phẩm, bấm sang trang 2.

| # | Ở đâu | Chuyện gì xảy ra |
|---|---|---|
| 1 | [app/routes.tsx](../apps/web/src/app/routes.tsx) | Khớp đường dẫn, dựng trang của feature. **Nơi duy nhất ráp các feature** |
| 2 | `features/products/pages/*.tsx` | `useQuery` gọi hàm trong `features/products/api/` |
| 3 | [core/http.ts](../apps/web/src/core/http.ts) | **Nơi duy nhất gọi `fetch`**; lỗi thành `ApiError` |
| 4 | [app.setup.ts](../apps/api/src/app.setup.ts) | Tiền tố `/api`, CORS, `ValidationPipe`, bộ lọc lỗi, gắn một lần cho mọi đường dẫn |
| 5 | `ValidationPipe` | Đổi `"2"` thành `2` theo DTO, trường lạ trả 400 |
| 6 | `modules/products/*.controller.ts` | Nhận DTO sạch, gọi service. Không logic, không Prisma |
| 7 | `modules/products/*.service.ts` | Nghiệp vụ; đếm và lấy dữ liệu trong **một giao dịch** |
| 8 | [page.response.ts](../apps/api/src/common/pagination/page.response.ts) | Gói thành `{ items, total, page, pageSize, totalPages }`; tiền trả **chuỗi** |

Lỗi ở bước 5 tới 7 đều ra một hình dạng JSON qua [all-exceptions.filter.ts](../apps/api/src/common/filters/all-exceptions.filter.ts). Đọc sâu, kèm bảng "bỏ tệp này đi thì sao": [shared/code-tour.md](shared/code-tour.md).

## 4. Ba luật không được phá, máy ép

1. **Một phân hệ do một người làm trọn**, từ bảng tới giao diện, trên một nhánh.
2. **Không ai ghi vào bảng của người khác.** Cần dữ liệu của họ thì gọi hàm họ công bố qua `index.ts`.
3. **Controller không gọi thẳng Prisma**, đi qua service.

ESLint ép cả ba bằng luật tự viết `tools/eslint/boundaries.mjs`, báo lỗi tiếng Việt chỉ thẳng luật nào bị phạm; CI không cho gộp. Lint báo lỗi ranh giới thì mang ra buổi chốt Thứ Tư, không tắt luật. Đầy đủ: [CONTRIBUTING.md](CONTRIBUTING.md).

## 5. Làm một feature từ đầu tới cuối

```bash
git switch develop && git pull
git switch -c feature/ph-01-product-catalog          # mã việc trên Issue, viết thường
# 1. bảng: sửa tệp .prisma CỦA MÌNH, rồi
npm run db:migrate -w apps/api -- --name <ten-viec>  # một pull request một migration; dạng gọi từ gốc không truyền được --name
# 2. dữ liệu giả: prisma/seed/<phân hệ>.seed.ts, mã định danh cố định
# 3. API: chép modules/products, đăng ký trong app.module.ts
# 4. giao diện: chép features/products, thêm Route trong app/routes.tsx
# 5. kiểm thử: một bài service, một bài HTTP, một bài trang; tên bài ghi UC-NN.m/ACk
# 6. tài liệu: docs/features/<module>/ — README (trạng thái), use-cases, LOG nếu có quyết định
npm run check && npm run docs:lint
git push -u origin feature/ph-01-product-catalog
gh pr create --base develop --fill                  # thân pull request có "Closes #<số Issue>"
```

Xong nghĩa là: có migration và dữ liệu giả, API khớp Swagger, giao diện chạy với **ba trạng thái** đang tải, lỗi, rỗng, có kiểm thử, tài liệu cập nhật, người khác duyệt, CI xanh sáu chặng ([CONTRIBUTING.md](CONTRIBUTING.md) mục điều kiện hoàn thành). Mẫu đầy đủ của một feature: [features/products/](features/products/README.md).

## 6. Git và GitHub

- **Nhánh:** `main` (bản nộp) ← `develop` (tích hợp) ← `feature/<mã việc>-<tên>`; việc con `task/`, sửa lỗi `bugfix/`. Riêng `feature/platform` là nhánh dài hạn: việc nền tảng làm trên `task/` rồi gộp vào đó. Không đẩy thẳng vào `develop`, `main`: hook `pre-push` chặn.
- **Commit:** `feat(ph-01): mo ta khong dau, chu thuong dau`. Hook `commit-msg` chặn sai dạng. Có phần AI sinh thì thêm dòng `Co-Authored-By:`.
- **Pull request:** một người khác duyệt, CI xanh, **gộp bằng merge commit** vì lịch sử commit là hồ sơ nộp kèm ([ADR-005](LOG.md#adr-005)). Workflow `pr-reviewers.yml` gán người duyệt theo `CODEOWNERS` thay cho tính năng trả phí.
- **Việc:** mỗi dòng việc một Issue (nhãn `ph` hoặc `ht`), gắn milestone của sprint. `Closes #N` trong thân pull request thì gộp xong Issue tự đóng.
- Kho riêng tư gói Free **không khoá được nhánh** và không chặn tự gộp: luật giữ bằng hook và kỷ luật ([TECH_DEBT.md](TECH_DEBT.md) ND-08, ND-11).

Đầy đủ: [shared/git.md](shared/git.md).

## 7. CI, CD và triển khai

| Chặng CI (`.github/workflows/ci.yml`) | Chặn gì |
|---|---|
| 1. Định dạng, lint, ranh giới | Phá luật kiến trúc; chính luật ranh giới còn chạy |
| 2. Kiểm kiểu, dựng thử | Mã không biên dịch |
| 3. Kiểm thử đơn vị, độ phủ | Sai logic |
| 4. Migration, kiểm lệch lược đồ, kiểm thử HTTP trên Postgres thật | Sửa `.prisma` quên migration; sai giữa các tầng |
| 5. Quét bí mật (gitleaks), quét thư viện | Lộ khoá; lỗ hổng nghiêm trọng |
| 6. Dựng image, chạy lên, gọi `/api/healthz` đúng mã commit | Chạy trên máy được, trong container thì không |

**Triển khai môi trường thử:** gộp vào `develop` → CI xanh → `cd-staging.yml` gọi deploy hook của Render → đợi `/api/healthz` trả đúng mã commit → gọi thử `/api/products`. Giao diện: Vercel tự dựng `develop`. Container máy chủ chạy `prisma migrate deploy` trước khi khởi động (`apps/api/docker-entrypoint.sh`). Hôm nay **chưa nối**: kho chưa có biến và bí mật của môi trường thử ([platform/README](features/platform/README.md) mục trạng thái).

Chạy cả cụm trên máy như môi trường thật: `npm run prod:up`, mở `http://localhost:8080`. Ba cái bẫy: Render ngủ nên lần gọi đầu chậm; `VITE_API_URL` nhúng lúc dựng, đổi thì dựng lại; quên `CORS_ORIGINS` thì trang có mà không có dữ liệu. Đầy đủ: [features/platform/staging.md](features/platform/staging.md).

## 8. Lệnh hằng ngày

| Lệnh | Việc |
|---|---|
| `npm run setup` | Lần đầu: cài gói, bật Postgres, migration, dữ liệu giả, cơ sở dữ liệu kiểm thử |
| `npm run dev:api` · `npm run dev:web` | `http://localhost:3001/api` (Swagger ở `/api/docs`) · `http://localhost:5174` |
| `npm run check` | Lint, ranh giới, định dạng, kiểu, kiểm thử đơn vị: **trước mỗi pull request** |
| `npm run test:http` | Kiểm thử HTTP trên cơ sở dữ liệu kiểm thử riêng, bị xoá sạch mỗi lần |
| `npm run db:migrate` · `npm run db:seed` · `npm run db:studio` | Migration sau khi sửa `.prisma` · nạp lại dữ liệu giả · xem bảng |
| `npm run docs:lint` | Kiểm luật tài liệu: frontmatter, link gãy, neo ADR |

## 9. Sáu chỗ hay hiểu nhầm

| Tưởng | Thật ra |
|---|---|
| Import bỏ đuôi `.js` cho gọn | ESM bắt buộc ghi `.js` dù tệp là `.ts` ([ADR-003](LOG.md#adr-003)) |
| Đặt `url` trong `datasource` như trên mạng | Prisma 7 bỏ; kết nối ở `prisma.config.ts` và adapter |
| Kéo mã về là chạy | Phải `npm run db:generate`, Prisma Client không nằm trên git |
| Kiểm thử HTTP chạy trên cơ sở dữ liệu thường | Chạy trên cơ sở dữ liệu riêng và xoá sạch trước mỗi lần |
| Tiền trả số | Trả chuỗi `"199000"`, hiện bằng `formatPrice`; số thực làm tròn sai |
| Lint báo ranh giới thì tắt luật | Mang ra buổi Thứ Tư; tắt luật là bỏ thứ đang bảo vệ cả nhóm |

## 10. Tài liệu nào trả lời câu gì

| Câu hỏi | Mở |
|---|---|
| Luật viết tài liệu, hệ mã `PH-NN`, `UC-NN.m`, `ADR`, `ND` | [AGENTS.md](../AGENTS.md) |
| Feature này làm gì, tới đâu, API mới nào | `features/<module>/README.md`: [products](features/products/README.md) · [auth](features/auth/README.md) · [inventory](features/inventory/README.md) · [platform](features/platform/README.md) |
| Nghiệp vụ đúng là gì, tiêu chí chấp nhận | `features/<module>/use-cases.md`; danh mục ở [shared/use-case-index.md](shared/use-case-index.md) |
| Vì sao làm vậy | [LOG.md](LOG.md) (toàn hệ thống) và `features/<module>/LOG.md` |
| Đường dẫn API nhận gì, trả gì | Swagger `/api/docs`; quy ước ở [shared/api.md](shared/api.md) |
| Viết mã, kiểm thử, giao diện theo quy ước nào | [shared/code.md](shared/code.md) · [shared/testing.md](shared/testing.md) · [shared/test-strategy.md](shared/test-strategy.md) · [shared/design.md](shared/design.md) |
| Bảng nào của ai, sơ đồ ở đâu | [CONTRIBUTING.md](CONTRIBUTING.md) · [shared/data-model.md](shared/data-model.md) · [shared/diagrams/](shared/diagrams/README.md) |
| Còn nợ gì | [TECH_DEBT.md](TECH_DEBT.md) |
| Kế hoạch, tiến độ, nhật ký AI | [Kho docs](https://github.com/F-R-E-Y-A/docs) |
