# Đánh giá kiến trúc bản 0.1 và lộ trình hoàn thiện nền tảng

- **Ngày**: 15/09/2026, Thứ Ba, sprint 1
- **Phạm vi**: toàn bộ kho mã `fashion-shop` sau commit `060abea`
- **Người đọc**: ba thành viên. Phần 0 đọc hai phút là đủ để họp. Phần 4 là việc phải làm.
- **Cách đọc bằng chứng**: mỗi phát hiện ghi kèm tệp và dòng, hoặc lệnh đã chạy. Chỗ nào là suy luận thì ghi rõ chữ *suy luận*.

---

## 0. Đọc trong hai phút

**Đang ở đâu.** Nền bản 0.1 chạy được thật và tái lập được từ số không: xóa hết dữ liệu, chạy ba lệnh, ra lại đúng 3 danh mục và 10 sản phẩm. Máy chủ NestJS 12, Prisma 7, React 19, Postgres 17 trong Docker. Một module mẫu đủ tầng, một khuôn lỗi thống nhất, đặc tả API tự sinh, ba bản ghi quyết định kiến trúc, `CODEOWNERS`, mẫu pull request, một đường ống CI.

**Kết luận.** Thứ đang thiếu không phải tính năng, mà là **cơ chế**. Ba nhóm việc, xếp theo mức khẩn:

1. **Cơ chế chất lượng** chưa có: không lint, không format, không một bài kiểm thử nào, ranh giới module chưa được ép trong mã. Đây là thứ hai bạn sẽ chép theo từ Thứ Hai tuần sau, nên phải có trước.
2. **Đường ra sản xuất** chưa có: không Dockerfile, không staging, CI không dựng image. Đầu ra bắt buộc của HT-01 là "địa chỉ môi trường thử chạy được" vào Chủ Nhật.
3. **Hai lỗi trong CI** khiến đường ống hiện tại sẽ đỏ ngay lần chạy đầu. Cổng chặn "CI xanh mới gộp" vì vậy chưa có tác dụng.

**Năm phát hiện xếp theo ảnh hưởng.**

| # | Phát hiện | Bằng chứng | Sửa ở |
|---|---|---|---|
| 1 | CI sẽ đỏ ở cả hai job. Job `build` chạy `prisma generate` không có `DATABASE_URL`, mà `prisma.config.ts` đòi biến này ngay lúc nạp. Job `migrate` chạy `migrate deploy` rồi `db seed`, nhưng `migrate deploy` không sinh client nên seed không tìm thấy module. | `.github/workflows/ci.yml:29-30` và `:69-73`. Tái hiện trên máy: bỏ `.env` rồi `db:generate` ra `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`; bỏ `src/generated` rồi `db:seed` ra `ERR_MODULE_NOT_FOUND`. | Bản 0.2 |
| 2 | Không có kiểm thử và lint. Module mẫu không có test, nên mọi module chép theo cũng sẽ không có. Điều kiện hoàn thành "có kiểm thử cho phần lõi" chưa có chỗ đứng. | Kiểm kê: 0 tệp `*.spec.ts` hay `*.test.ts*`; thiếu `eslint.config.*`, `.prettierrc*`, `vitest.config.*`, `.editorconfig`, `.nvmrc`. | Bản 0.2 |
| 3 | Ranh giới module chỉ được ép ở khâu duyệt, và `CODEOWNERS` đang lệch với cây thật. Các dòng trỏ `apps/web/src/features/**` không khớp gì vì web hiện là `pages/`, `layouts/`, `lib/`. Một tệp `schema.prisma` duy nhất gán cho Tài nghĩa là mọi pull request có bảng đều chờ Tài, và là điểm xung đột gộp của ba người. Không có luật lint nào chặn controller gọi thẳng Prisma hay import sâu vào module người khác. | `.github/CODEOWNERS:22-24, 32-33, 43` trỏ thư mục chưa tồn tại; `:44-45` gán schema và migrations cho Tài. Prisma cho phép `schema` trỏ vào một thư mục, xem `node_modules/@prisma/config/dist/index.d.ts:154`. | Bản 0.2 và 0.3 |
| 4 | Chưa có đường ra sản xuất. Không Dockerfile cho `api` và `web`, Compose chỉ có Postgres, CI không dựng image, chưa có staging. Mục 1 của HT-01 mới xong một nửa. | Kiểm kê: thiếu `apps/api/Dockerfile`, `apps/web/Dockerfile`; `docker-compose.yml` một dịch vụ. | Bản 0.4 |
| 5 | Cấu hình và kiểu dữ liệu chưa được bảo vệ. Biến môi trường không được kiểm lúc khởi động, thiếu biến thì lỗi lúc chạy chứ không phải lúc boot. Kiểu dữ liệu ở web gõ tay trong `apps/web/src/lib/api.ts`, sẽ lệch với máy chủ ngay khi API đổi. Mục 3 của HT-01, script sinh thư viện gọi, chưa làm. | `apps/api/src/app.module.ts:17-20` không có `validate`. `apps/web/src/lib/api.ts:53-69` khai báo `Product` bằng tay. | Bản 0.3 |

**Nguyên tắc dẫn đường cho phần còn lại.** Anh muốn nền tảng hoàn chỉnh và mở rộng được; bảng chia việc lại nói đắp dần theo tuần. Hai điều này không mâu thuẫn nếu tách bạch: **cơ chế xong sớm, dịch vụ đến đúng tuần**. Ví như dựng nhà: khung, đường ống và ổ điện đi sẵn từ đầu; thiết bị từng phòng lắp khi dọn vào phòng đó. Dịch thuật ngữ: lint, test, luật ranh giới, Dockerfile, đường ống CI, khuôn hợp đồng API và thư mục `infra/` có chỗ cắm sẵn, tất cả xong trong sprint 1. Redis, Meilisearch, MinIO, hàng đợi thì được **định nghĩa trước** trong Compose dưới dạng profile và có sẵn khóa trong `.env.example`, nhưng chỉ **bật** ở tuần mà phân hệ sở hữu nó tới lượt.

---

## 1. Kiến trúc hiện tại

### 1.1 Sơ đồ khối

```
Trình duyệt
   │  http://localhost:5174
   ▼
apps/web  (React 19 + Vite 8 + TanStack Query + React Router)
   │  fetch → http://localhost:3001/api   (CORS mở cho dev)
   ▼
apps/api  (NestJS 12, ESM)
   ├── main.ts            tiền tố /api, ValidationPipe, AllExceptionsFilter, Swagger tại /api/docs
   ├── app.module.ts      ConfigModule (một .env ở gốc), PrismaModule (global), HealthModule, ProductsModule
   ├── common/            filters, prisma
   └── modules/
        ├── health/       GET /api/healthz, chỉ báo còn sống
        └── products/     DTO → Controller → Service → PrismaService
   │  PrismaClient + adapter PrismaPg
   ▼
PostgreSQL 17  (docker compose, volume postgres-data)
   └── categories, products, _prisma_migrations
```

### 1.2 Một yêu cầu đi qua những gì

`GET /api/products?page=1&pageSize=12&search=jean`

1. Express nhận, Nest định tuyến tới `ProductsController.list`.
2. `ValidationPipe` dựng `ListProductsQuery` từ chuỗi truy vấn: ép kiểu, kiểm giới hạn, **bỏ hoặc từ chối** trường lạ (`whitelist` + `forbidNonWhitelisted`).
3. `ProductsService.list` dựng điều kiện, chạy `count` và `findMany` trong một `$transaction` để hai con số khớp nhau, rồi đổi `Decimal` thành chuỗi trước khi trả.
4. Lỗi ở bất kỳ bước nào rơi vào `AllExceptionsFilter`, ra một hình dạng duy nhất: `statusCode, code, message, path, timestamp`.

Đây là **khuôn** mà hai bạn sẽ chép cho phân hệ của mình. Vì vậy mọi thứ thiếu ở khuôn này sẽ được nhân ba.

### 1.3 Quyết định đã chốt

| Quyết định | Tài liệu | Còn đúng không |
|---|---|---|
| Một khối module hóa, không microservices | `docs/adr/adr-001-modular-monolith.md` | Đúng. Ranh giới cần được ép thêm bằng lint, xem mục 3.2 |
| PostgreSQL duy nhất | `docs/adr/adr-002-postgresql-duy-nhat.md` | Đúng |
| NestJS ESM, Prisma 7 adapter, ghim `prisma@7.10.0` và TypeScript dải 6 | `docs/adr/adr-003-nestjs-esm-prisma7.md` | Đúng. Bổ sung: `node_modules/typescript` ở gốc là 7.0.2 do `@prisma/client` kéo về, nhưng mỗi workspace chạy đúng 6.0.3, đã kiểm bằng `npx tsc --version` trong từng thư mục |
| Một `.env` ở gốc dùng chung ba nơi | `apps/api/src/app.module.ts:17-20`, `apps/api/prisma.config.ts`, `apps/web/vite.config.ts` | Đúng |
| Cổng API 3001, web 5174 | `.env.example`, `apps/web/vite.config.ts` | Đúng, do cổng mặc định bị ứng dụng khác trên máy chiếm |

### 1.4 Phiên bản đang dùng

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node | 24.19.0 | Chạy thẳng được TypeScript, không cần `ts-node` |
| NestJS core, swagger | 12.0.1 | Bản lớn mới, ESM thuần, xem rủi ro R1 |
| Prisma CLI, client, adapter-pg | 7.10.0 | Bản ổn định cuối của dòng 7; thẻ `latest` trên npm đang trỏ bản thử nghiệm 8 |
| TypeScript trong workspace | 6.0.3 | Khớp `@nestjs/cli@12` |
| React, Vite | 19.3.0, 8.3.0 | |
| TanStack Query, React Router | 5.102.8, 7.18.3 | |
| class-validator | 0.15.1 | |
| tsx | 4.23.13 | Chỉ cho tệp seed |

---

## 2. Đánh giá theo lớp

| Lớp | Đã có | Còn thiếu | Mức | Bản |
|---|---|---|---|---|
| Kho mã, workspace | npm workspaces, `.gitattributes` LF, `.gitignore` đúng, commit đầu sạch | `tsconfig.base.json` dùng chung, `.nvmrc`, `.editorconfig`, kho từ xa trên GitHub với khóa nhánh | Vừa | 0.2 |
| Cấu hình, env | Một `.env` ở gốc, `.env.example` có chú thích | Kiểm env lúc boot bằng schema, kiểu cấu hình có typing, khóa dành sẵn cho dịch vụ sau | Cao | 0.3 |
| Máy chủ, cấu trúc module | Module Nest, `exports` chỉ service, comment ghi luật | Barrel `index.ts` mỗi module để phân biệt công khai với nội bộ; thư mục `infra/` cho các adapter ra ngoài; luật lint chặn vi phạm | Cao | 0.2, 0.3 |
| Máy chủ, hợp đồng API | Tiền tố `/api`, khuôn lỗi thống nhất, Swagger, DTO có kiểm tra | Bộ phân trang dùng chung, danh mục mã lỗi nghiệp vụ, tài liệu quy ước API, xuất `openapi.json` không cần chạy máy chủ | Cao | 0.3 |
| Dữ liệu, Prisma | Prisma 7 đúng cách, migration đầu, seed mã cố định, lặp lại được | Tách schema theo chủ sở hữu, seed tách theo phân hệ, kiểm lệch schema và migration trong CI | Cao | 0.2, 0.3 |
| Giao diện web | Hai khung trang, ba trạng thái tải lỗi rỗng đủ, một chỗ gọi API | Cấu trúc `features/` khớp `CODEOWNERS`, client sinh từ OpenAPI, error boundary, typing cho biến `VITE_` | Vừa | 0.3 |
| Chất lượng | `ValidationPipe` chặt, strict null | Lint, format, hook, test đơn vị và tích hợp mẫu, `strict: true` | Cao | 0.2 |
| CI, CD | Ba bước đúng ý: kiểm kiểu, dựng, migration lên Postgres trống | Hai lỗi cần sửa; thêm lint, test, dựng image, kiểm lệch migration, hủy lượt chạy cũ, triển khai staging khi gộp `develop` | Cao | 0.2, 0.4 |
| Docker, hạ tầng | Compose Postgres có healthcheck | Dockerfile hai ứng dụng, `compose.prod.yml`, profile cho dịch vụ sau, `.dockerignore`, entrypoint chạy migration | Cao | 0.4 |
| Bảo mật | Không lộ chi tiết lỗi nội bộ, whitelist DTO | Helmet, giới hạn tần suất, siết CORS khi lên staging, xác thực tạm cho dev | Vừa | 0.5 |
| Quan sát | Log mặc định của Nest, liveness | Log JSON có request id, readiness sâu, metrics; đúng kế hoạch là HT-05 | Thấp lúc này | 0.5, 0.6 |
| Tài liệu, quy trình | README chạy được, ba ADR, CONTRIBUTING, GIT_FLOW, khuôn use case, mẫu PR và phiếu | Quy ước API, hướng dẫn viết test, mục lục cập nhật | Vừa | 0.3 |

### 2.1 Điểm mạnh, giữ nguyên

- **Tái lập được từ số không.** Đã kiểm bằng cách xóa volume rồi dựng lại. Đây là thứ quý nhất của một nền; đừng để nó hỏng khi thêm dịch vụ.
- **Ranh giới sở hữu có chỗ đứng.** Module Nest cộng `CODEOWNERS` là đúng hướng. Việc còn lại là ép thêm trong mã.
- **Khuôn lỗi và kiểm tra đầu vào chặt ngay từ đầu.** Gửi trường lạ là bị từ chối. Điều này tránh được cả một lớp lỗi về sau.
- **Ba quyết định lớn đã có ADR.** Người mới đọc là hiểu vì sao, không phải hỏi lại.
- **Mã strict sẵn.** Chạy `tsc --noEmit --strict` trên `apps/api` ra 0 lỗi. Bật `strict: true` bây giờ là rẻ nhất, mai mốt sẽ đắt.

### 2.2 Những điểm nhỏ hơn, gom lại để không quên

- `noImplicitAny: false` trong `apps/api/tsconfig.json`. Bật strict là hết.
- Fixtures theo đặc tả HT-01 cần 10 sản phẩm, 3 người dùng, 5 đơn. Mới có sản phẩm. Người dùng và đơn phải chờ bảng của Tài và Duy, nên luật đúng là **fixture đi cùng bảng**: ai thêm bảng thì thêm seed cho bảng đó trong cùng pull request.
- Health hiện chỉ báo còn sống. Đúng kế hoạch; readiness sâu là HT-05.
- CORS `origin: true`. Đúng cho dev, phải siết khi có địa chỉ staging.
- Swagger chưa tắt ở môi trường thật. Quyết định khi tới 1.0.
- Web chưa có error boundary; một lỗi render là trắng trang.
- Seed dùng `tsx` vì Node không đổi đuôi `.js` sang `.ts` khi chạy thẳng. Đã ghi trong ADR-003.

---

## 3. Kiến trúc đích của nền tảng

### 3.1 Cây thư mục đích

Chỉ vẽ phần nền. Phân hệ nghiệp vụ là các thư mục con lặp lại theo cùng khuôn.

```
fashion-shop/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema/
│   │   │   │   ├── base.prisma         generator + datasource, Tài giữ
│   │   │   │   ├── catalog.prisma      Bảo
│   │   │   │   ├── orders.prisma       Duy
│   │   │   │   └── identity.prisma     Tài
│   │   │   ├── migrations/             một thư mục chung, bắt buộc của Prisma
│   │   │   └── seed/
│   │   │       ├── index.ts            gọi lần lượt theo thứ tự phụ thuộc
│   │   │       └── catalog.seed.ts     mỗi phân hệ một tệp
│   │   ├── src/
│   │   │   ├── config/                 env.ts (schema zod), app-config.ts
│   │   │   ├── common/                 filters, pipes, pagination, errors, decorators
│   │   │   ├── infra/                  adapter ra thế giới bên ngoài
│   │   │   │   ├── prisma/             có ngay
│   │   │   │   ├── storage/            MinIO, bản 0.5
│   │   │   │   ├── auth/               xác thực tạm, bản 0.5; Tài thay thật S2 và S3
│   │   │   │   ├── logging/            pino, bản 0.5
│   │   │   │   ├── queue/              Redis + BullMQ, HT-05
│   │   │   │   └── events/             outbox, HT-05
│   │   │   ├── modules/
│   │   │   │   └── <phân hệ>/
│   │   │   │       ├── index.ts        MẶT CÔNG KHAI: module, service, DTO chia sẻ
│   │   │   │       ├── <phân hệ>.module.ts
│   │   │   │       ├── <phân hệ>.controller.ts
│   │   │   │       ├── <phân hệ>.service.ts
│   │   │   │       ├── <phân hệ>.service.spec.ts     kiểm thử đơn vị
│   │   │   │       ├── <phân hệ>.e2e.spec.ts         kiểm thử qua HTTP
│   │   │   │       ├── dto/
│   │   │   │       └── README.md       hợp đồng công bố cho người khác
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── openapi.json                xuất bằng script, commit vào git
│   │   ├── Dockerfile
│   │   └── vitest.config.ts
│   └── web/
│       ├── src/
│       │   ├── app/                    providers, router, layouts, error boundary
│       │   ├── features/<phân hệ>/     api/, components/, pages/   khớp CODEOWNERS
│       │   ├── shared/
│       │   │   ├── api/                schema.d.ts sinh từ openapi.json, client.ts
│       │   │   ├── ui/                 thành phần dùng chung
│       │   │   └── lib/
│       │   └── main.tsx
│       ├── nginx.conf                  phục vụ SPA và proxy /api
│       ├── Dockerfile
│       └── vitest.config.ts
├── infra/
│   ├── compose.yml                     dev: postgres; profile search, queue, storage, mail
│   ├── compose.prod.yml                api, web, postgres, volume, healthcheck
│   └── deploy/                         script staging, runbook; HT-09 bổ sung
├── .github/
│   ├── workflows/ci.yml                lint → test → build → migration → docker build
│   ├── workflows/cd-staging.yml        gộp develop → đẩy image → triển khai → smoke
│   ├── CODEOWNERS
│   ├── pull_request_template.md
│   └── ISSUE_TEMPLATE/
├── docs/
├── tsconfig.base.json
├── eslint.config.js
├── .prettierrc
├── .editorconfig
└── .nvmrc
```

Hai lựa chọn có chủ ý:

- **Không tạo `packages/` lúc này.** Client sinh từ OpenAPI đặt thẳng vào `apps/web/src/shared/api`. Một workspace `packages/api-client` chỉ đáng khi có ứng dụng thứ hai dùng nó. Giữ `packages/` làm chỗ mở rộng, không phải việc hôm nay.
- **`infra/` tách khỏi `common/`.** `common/` là mã thuần không phụ thuộc gì ngoài Nest. `infra/` là mọi thứ nói chuyện với thế giới bên ngoài: cơ sở dữ liệu, kho ảnh, hàng đợi. Khi HT-05 tới, Bảo thêm thư mục vào `infra/`, không đụng module của ai.

### 3.2 Ranh giới module được ép bằng ba lớp

| Lớp | Cơ chế | Chặn cái gì |
|---|---|---|
| Ngôn ngữ | Module Nest chỉ `exports` service; mỗi module có `index.ts` là mặt công khai duy nhất | Không thể tiêm cái không được export |
| Lint | `no-restricted-imports`: trong `*.controller.ts` cấm `infra/prisma`; trong `modules/A/**` cấm `modules/B/**` trừ `modules/B/index`; trong `features/A/**` của web cấm `features/B/**` | Controller gọi thẳng Prisma; module này thò tay vào nội bộ module kia |
| Duyệt | `CODEOWNERS` gán theo thư mục module và theo **từng tệp `.prisma`** | Sửa mã hoặc bảng người khác mà không có họ duyệt |

Về schema: Prisma nhận `schema` là một thư mục và gom mọi `*.prisma` bên trong. Tách theo chủ sở hữu thì `CODEOWNERS` gán được đúng người cho đúng bảng, luật "không ghi bảng người khác" thành cơ chế, và Tài chỉ còn duyệt `base.prisma` cùng các quan hệ chéo thay vì mọi thay đổi. Thư mục `migrations/` vẫn là một, đó là ràng buộc của Prisma; luật kèm theo là **một pull request một migration, tên bắt đầu bằng mã phân hệ**.

### 3.3 Quy ước hợp đồng API

Sẽ viết thành `docs/api-conventions.md` ở bản 0.3. Nội dung đã chốt:

| Chủ đề | Quy ước |
|---|---|
| Đường dẫn | `/api/<phân hệ số nhiều>` và `/api/<phân hệ>/:định danh`; không có phiên bản trong đường dẫn cho tới khi có lý do |
| Phân trang | Vào: `page` từ 1, `pageSize` tối đa 60. Ra: `items, total, page, pageSize, totalPages`. Dùng chung `PaginationQuery` và `paginate()` trong `common/pagination` |
| Lỗi | Khuôn hiện có giữ nguyên. Thêm `DomainException(code, message, status)`; `code` lấy từ danh mục mỗi phân hệ, ví dụ `PRODUCT_NOT_FOUND`, `CART_ITEM_OUT_OF_STOCK` |
| Kiểu dữ liệu | Tiền là chuỗi số thập phân; thời điểm là ISO 8601 UTC; định danh là UUID |
| Đặc tả | `npm run openapi:emit` sinh `apps/api/openapi.json` bằng `SwaggerModule.createDocument` mà không cần mở cổng; web sinh kiểu từ tệp này; CI đỏ nếu tệp trong git lệch với mã |

### 3.4 Docker và Compose theo profile

| Dịch vụ | Image | Profile | Bật ở | Ai cần đầu tiên |
|---|---|---|---|---|
| postgres | `postgres:17-alpine` | mặc định | đã có | cả ba |
| minio | `minio/minio` + job tạo bucket | `storage` | bản 0.5, S2 | Tài, nạp ảnh sản phẩm cào về cuối S2 |
| mailpit | `axllent/mailpit` | `mail` | S2 hoặc S3 | Tài, OTP qua thư |
| redis | `redis:7-alpine` | `queue` | HT-05, S5 | Bảo |
| meilisearch | `getmeili/meilisearch` | `search` | PH-04, S4 | Bảo |

Chạy `docker compose --profile storage up -d` là có thêm MinIO, không ai phải sửa tệp. Khóa môi trường của từng dịch vụ có sẵn trong `.env.example` dưới dạng chú thích, mở ra khi bật.

Image ứng dụng:

- `apps/api/Dockerfile` nhiều tầng: cài gói → `prisma generate` và `nest build` → tầng chạy `node:24-alpine`, người dùng không phải root, `HEALTHCHECK` gọi `/api/healthz`, entrypoint chạy `prisma migrate deploy` rồi khởi động. *Suy luận cần kiểm khi dựng*: Prisma 7 với driver adapter không cần engine nhị phân, nên image Alpine không vướng OpenSSL như các bản cũ.
- `apps/web/Dockerfile`: dựng Vite → `nginx:alpine` phục vụ tệp tĩnh và proxy `/api` sang `api:3001`. Web và API cùng một gốc, CORS siết về danh sách cụ thể.

### 3.5 Đường ống CI và CD đích

```
Pull request vào develop hoặc main
  ├── quality    lint · format check · typecheck        ~1 phút
  ├── test       vitest api + web, báo cáo độ phủ        ~1 phút
  ├── build      nest build · vite build                 ~1 phút
  ├── migration  postgres service → migrate deploy → kiểm lệch schema · seed
  └── docker     dựng hai image, không đẩy               ~2 phút
  Hủy lượt chạy cũ khi có commit mới cùng nhánh.

Gộp vào develop
  └── cd-staging đẩy image lên GHCR → triển khai staging → smoke /api/healthz và /api/products
                 (E2E Playwright chạy ở đây từ HT-06, S9)

Gắn thẻ v*
  └── release    HT-09, S11
```

### 3.6 Thư viện sẽ thêm và lý do

| Gói | Việc | Bản |
|---|---|---|
| `eslint`, `typescript-eslint`, `eslint-plugin-import`, `prettier`, `eslint-config-prettier` | Lint, thứ tự import, format thống nhất | 0.2 |
| `vitest`, `@vitest/coverage-v8`, `unplugin-swc`, `@nestjs/testing`, `supertest` | Kiểm thử máy chủ. *Cần kiểm khi cài*: Vitest cần `unplugin-swc` để phát metadata decorator cho Nest | 0.2 |
| `@testing-library/react`, `jsdom` | Kiểm thử thành phần web | 0.2 |
| `simple-git-hooks`, `lint-staged` | Format và lint tệp đang commit; nhẹ hơn husky | 0.2 |
| `zod` | Kiểm env lúc boot; sau này dùng lại cho kiểm dữ liệu ở web | 0.3 |
| `openapi-typescript`, `openapi-fetch` | Sinh kiểu và client từ `openapi.json`, không sinh mã lớn | 0.3 |
| `nestjs-pino`, `pino-http`, `pino-pretty` | Log JSON có request id, đẹp ở dev | 0.5 |
| `helmet`, `@nestjs/throttler` | Tiêu đề bảo mật, giới hạn tần suất | 0.5 |
| `@aws-sdk/client-s3` hoặc `minio` | Tải ảnh lên MinIO | 0.5 |
| `bullmq`, `@nestjs/bullmq`, `ioredis`, `@nestjs/schedule`, `@nestjs/terminus`, `prom-client` | Hàng đợi, lịch, readiness, metrics | HT-05 |
| `meilisearch` | Chỉ mục tìm kiếm | PH-04 |

Mọi gói mới đều kiểm `peerDependencies` với Nest 12 trước khi cài, xem rủi ro R1.

---

## 4. Lộ trình theo bản

| Bản | Khi | Mục tiêu một câu | Xong khi |
|---|---|---|---|
| 0.2 | T4 16/09 → T5 17/09 | Cơ chế chất lượng và CI xanh thật | Một pull request thật chạy đủ lint, test, build, migration và xanh; module mẫu có hai bài kiểm thử |
| 0.3 | T6 18/09 | Cấu trúc và hợp đồng để hai bạn chép | Cây `modules/products` và `features/products` đủ khuôn; env thiếu thì boot báo đúng tên biến; kiểu web sinh từ OpenAPI |
| 0.4 | T7 19/09, CN 20/09 dự phòng | Đường ra sản xuất | Máy trống chạy `compose.prod.yml` ra trang sản phẩm; địa chỉ staging trả 200 và hiện 10 sản phẩm; demo 19h |
| 0.5 | S2, 21 → 26/09, buổi tối | Dịch vụ dùng chung đợt một | Tải một ảnh lên rồi hiện ở web; log JSON có request id; giả được vai admin ở dev |
| 0.6 | S5, HT-05 | Hạ tầng sự kiện và quan sát | Theo đặc tả HT-05 |
| 0.7 | S10, HT-10 | Vận hành và chịu lỗi | Theo đặc tả HT-10 |
| 1.0 | S11, HT-09 | Phát hành và bàn giao | Theo đặc tả HT-09 |

Thứ tự ưu tiên nếu tuần này không đủ giờ: **0.2 trước, rồi 0.4, rồi 0.3.** Lý do: 0.2 là thứ hai bạn chép; 0.4 là đầu ra phải demo Chủ Nhật; trong 0.3 chỉ có phần **đổi cây thư mục** là bắt buộc xong trước Thứ Hai 21/09, vì đổi sau khi hai bạn đã bắt đầu là sinh xung đột. Kiểm env và codegen trong 0.3 được phép trượt sang tối S2 mà không chặn ai.

### Bản 0.2. Cơ chế chất lượng, CI xanh thật

**Sửa CI**

- [ ] Job `build`: đặt `DATABASE_URL` giả trong `env` của job để `prisma generate` nạp được cấu hình. `generate` không kết nối cơ sở dữ liệu nên giá trị giả là đủ.
- [ ] Job `migration`: thêm bước `prisma generate` trước `db seed`.
- [ ] Thêm bước kiểm lệch: sau `migrate deploy`, chạy `prisma migrate diff` so lược đồ trong migration với lược đồ trong mã, `--exit-code` để đỏ khi ai sửa `schema` mà quên tạo migration. *Cờ chính xác của Prisma 7 kiểm khi làm.*
- [ ] `concurrency` với `cancel-in-progress` theo nhánh. Cache npm đã có.
- [ ] Thêm job `quality` và `test`, xem dưới.

**Kho mã**

- [ ] `tsconfig.base.json` ở gốc; hai app `extends`. Bật `strict: true` cho `apps/api`, đã kiểm 0 lỗi.
- [ ] `.nvmrc` ghi `24`, `.editorconfig`.

**Lint và format**

- [ ] `eslint.config.js` phẳng ở gốc: `typescript-eslint` recommended, `eslint-plugin-import` với thứ tự import, `eslint-config-prettier`. Bỏ qua `src/generated/**`, `dist/**`.
- [ ] Luật ranh giới bằng `no-restricted-imports` như mục 3.2. Viết thông báo lỗi bằng tiếng Việt chỉ thẳng luật nào bị phạm.
- [ ] `.prettierrc`: dấu nháy đơn, dấu chấm phẩy, dấu phẩy cuối, độ rộng 100.
- [ ] Script: `lint`, `lint:fix`, `format`, `format:check` ở gốc.

**Kiểm thử**

- [ ] `apps/api/vitest.config.ts` với `unplugin-swc` để decorator có metadata.
- [ ] `products.service.spec.ts`: đơn vị, `PrismaService` giả bằng `vi.fn`, ba ca là phân trang, tìm theo tên, không tìm thấy ném `NotFoundException`.
- [ ] `products.e2e.spec.ts`: dựng `AppModule` bằng `@nestjs/testing`, gọi qua `supertest` vào Postgres thật, năm ca lỗi đã kiểm tay hôm 13/09 chuyển thành bài tự động.
- [ ] `apps/web/vitest.config.ts` với `jsdom`; một bài cho `formatPrice`, một bài render `ProductListPage` ở ba trạng thái với `fetch` giả.
- [ ] Độ phủ v8 xuất báo cáo, **chưa đặt ngưỡng**; ngưỡng do Duy chốt trong `docs/test-strategy.md`.
- [ ] `docs/testing.md` một trang: chạy thế nào, đặt tên thế nào, mẫu để chép.

**Hook**

- [ ] `simple-git-hooks` + `lint-staged`: pre-commit chạy `eslint --fix` và `prettier --write` trên tệp đang commit; pre-push chạy `typecheck`.

**Xong khi**: mở một pull request thử từ `task/` vào `develop`, thấy năm job xanh; `git commit` tự format; `npm test` ở gốc chạy cả hai bên.

### Bản 0.3. Cấu trúc và hợp đồng để hai bạn chép

**Bắt buộc trước Thứ Hai 21/09**

- [ ] Tách schema: `prisma/schema/base.prisma`, `catalog.prisma`; tạo sẵn `orders.prisma` và `identity.prisma` trống có chú thích tên chủ. `prisma.config.ts` đổi `schema` sang thư mục. Kiểm `migrate diff` không thấy khác biệt sau khi tách.
- [ ] `CODEOWNERS` gán theo từng tệp `.prisma`; sửa các dòng web sang `features/` sau khi đổi cây; xóa dòng trỏ thư mục chưa tồn tại.
- [ ] Đổi `src/common/prisma` thành `src/infra/prisma`; thêm `modules/products/index.ts`; module `products` có `README.md` ghi hợp đồng công bố: `ProductsService.list`, `findBySlug`, sau này `getVariants`, `importProducts`.
- [ ] Web đổi cây: `app/`, `features/products/`, `shared/`. Thêm `ErrorBoundary` ở `app/`, `vite-env.d.ts` khai `VITE_API_URL`.
- [ ] Seed tách thành `prisma/seed/index.ts` gọi `catalog.seed.ts`.
- [ ] Cập nhật README và CONTRIBUTING theo cây mới.

**Được phép trượt sang tối S2**

- [ ] `src/config/env.ts` với zod; `ConfigModule.forRoot({ validate })`; thiếu biến thì boot dừng và in đúng tên biến bằng tiếng Việt.
- [ ] `common/pagination` và `common/errors/domain.exception.ts`; `products` chuyển sang dùng, làm mẫu.
- [ ] `docs/api-conventions.md`.
- [ ] Script `openapi:emit` viết `apps/api/openapi.json`; `api:types` sinh `apps/web/src/shared/api/schema.d.ts`; `shared/api/client.ts` dùng `openapi-fetch`; `features/products/api` chuyển sang client này. CI thêm bước sinh lại rồi `git diff --exit-code`.

**Xong khi**: hai bạn mở `modules/products` và `features/products` thấy đủ khuôn để chép; `CODEOWNERS` không còn dòng chết; env thiếu thì boot báo đúng biến.

### Bản 0.4. Đường ra sản xuất

- [ ] `apps/api/Dockerfile` nhiều tầng như mục 3.4, `.dockerignore`, `docker-entrypoint.sh` chạy `migrate deploy` rồi `node dist/main.js`.
- [ ] `apps/web/Dockerfile` và `nginx.conf`: SPA fallback, proxy `/api`, nén gzip, cache tệp tĩnh có băm.
- [ ] Chuyển `docker-compose.yml` vào `infra/compose.yml`, thêm profile `storage`, `mail`, `queue`, `search` ở trạng thái định nghĩa sẵn; `infra/compose.prod.yml` chạy hai image cùng Postgres. Script gốc `db:up` trỏ đường dẫn mới.
- [ ] CI job `docker`: `docker build` hai image trên pull request, có cache lớp.
- [ ] `cd-staging.yml`: khi gộp `develop`, dựng và đẩy lên GHCR, triển khai theo nền tảng đã chọn ở mục 6, rồi smoke `/api/healthz` và `/api/products`.
- [ ] Siết CORS: đọc danh sách gốc từ env, staging chỉ nhận đúng địa chỉ web của nó.
- [ ] Ghi địa chỉ staging và cách xem log vào README.

**Xong khi**: trên máy trống, `docker compose -f infra/compose.prod.yml up` ra trang sản phẩm; địa chỉ staging trả 200; demo lúc 19h Chủ Nhật có địa chỉ để mở.

### Bản 0.5. Dịch vụ dùng chung đợt một, làm buổi tối S2 song song PH-03

- [ ] `infra/storage`: bật profile `storage`, `StorageService.upload(file, folder)` trả URL công khai, giới hạn 5 MB và ba loại ảnh, bucket tự tạo khi khởi động. Tài dùng cuối S2 để nạp ảnh sản phẩm cào về.
- [ ] `infra/auth` tạm: guard đọc header `x-dev-user` khi `NODE_ENV=development`, trả `{ id, roles }` qua `@CurrentUser()`; `requireRole()` dựa trên đó. Tài thay bằng xác thực thật ở S2 và S3, chữ ký không đổi. Hợp đồng này chốt ở S2 theo bảng hợp đồng.
- [ ] `infra/logging`: `nestjs-pino`, request id, JSON ở staging, `pino-pretty` ở dev. Bộ lọc lỗi ghi qua logger này.
- [ ] `helmet`, `@nestjs/throttler` với giới hạn mặc định rộng, siết theo từng đường dẫn khi cần.
- [ ] Fixture người dùng và đơn hàng đi cùng bảng của Tài và Duy, không làm trước.

**Xong khi**: tải một ảnh qua `/api/media` rồi thấy ở web; log có `reqId`; gửi `x-dev-user` giả được vai admin ở dev và bị từ chối ở staging.

### Bản 0.6, 0.7, 1.0

Ba bản này đã có đặc tả riêng trong bảng chia việc là HT-05, HT-10 và HT-09. Ở đây chỉ ghi điểm cắm mà nền bản 0.2 tới 0.5 chuẩn bị sẵn cho chúng:

| Bản | Điểm cắm đã chuẩn bị |
|---|---|
| 0.6, HT-05 | Thư mục `infra/queue` và `infra/events`; profile `queue`; readiness thay `HealthController`; metrics gắn vào `main.ts`; request id đã có từ 0.5 để nối thành correlation id |
| 0.7, HT-10 | Job CI đã tách rời nên thêm chặng E2E chỉ là thêm một job; `HEALTHCHECK` trong image và readiness dùng cho giảm cấp có kiểm soát; `compose.prod.yml` dùng cho diễn tập |
| 1.0, HT-09 | `cd-staging.yml` nhân bản thành `release.yml`; `infra/deploy` chứa script và runbook; sao lưu gắn vào volume Postgres đã đặt tên |

---

## 5. Việc làm ngay, theo thứ tự

1. **Đẩy kho lên GitHub, tạo `develop`, bật khóa nhánh** cho `develop` và `main`: bắt buộc pull request, một người duyệt, CI xanh, tôn trọng `CODEOWNERS`. Không có kho từ xa thì `CODEOWNERS` và CI đều chưa có tác dụng gì.
2. **Sửa hai lỗi CI** trong bản 0.2, đẩy lên, xem lượt chạy đầu tiên xanh thật. Sau đó mọi việc còn lại đều đi qua pull request và được CI kiểm.
3. **Lint, format, hook, strict.** Nửa buổi.
4. **Hai bài kiểm thử mẫu cho `products`.** Đây là thứ đáng giá nhất cho hai bạn.
5. **Đổi cây thư mục** theo bản 0.3, phần bắt buộc, trước khi ai bắt đầu S2.
6. **Dockerfile và staging** vào Thứ Bảy.

## 6. Quyết định cần anh chốt

| Quyết định | Phương án | Khuyến nghị | Cần trước |
|---|---|---|---|
| Staging chạy ở đâu | (A) VPS nhỏ, Docker Compose, Caddy làm reverse proxy và tự lấy chứng chỉ. Tự chủ, rẻ, giống môi trường thật, cần anh quản trị. (B) Railway hoặc Render. Nhanh, ít quản trị, gói miễn phí có giới hạn giờ và Postgres riêng của họ. (C) Fly.io. Ở giữa hai cái trên. | **A**, vì anh đã có kinh nghiệm hạ tầng và triển khai, và staging giống thật thì HT-09 dùng lại được nguyên vẹn. Nếu chưa có VPS sẵn thì B để kịp demo Chủ Nhật, chuyển A ở S3. | T7 19/09 |
| Bộ lint | ESLint + Prettier, hoặc Biome | ESLint + Prettier. Biome nhanh hơn nhưng luật ranh giới import và tài liệu cho sinh viên đều nghiêng về ESLint. | T4 16/09 |
| Bộ chạy kiểm thử | Vitest, hoặc Jest | Vitest. Jest với ESM còn nhiều vướng, Nest 12 là ESM. | T4 16/09 |
| Hook trước commit | Có, hoặc chỉ dựa CI | Có, bản nhẹ. Bắt lỗi trên máy rẻ hơn chờ CI ba phút. | T4 16/09 |
| Sinh client | `openapi-typescript` + `openapi-fetch`, hoặc `orval`, hoặc `hey-api` | `openapi-typescript` + `openapi-fetch`: chỉ sinh kiểu, không sinh mã lớn, dễ đọc diff. | T6 18/09 |
| Phục vụ web | nginx, hoặc Caddy, hoặc Node tĩnh | nginx. Nếu VPS đã dùng Caddy làm proxy chung thì web dùng Caddy luôn cho một công cụ. | T7 19/09 |

Bốn dòng cuối đều có mặc định hợp lý, tôi sẽ làm theo khuyến nghị nếu anh không nói khác. Dòng đầu là của anh, vì liên quan tài khoản và chi phí.

## 7. Rủi ro và cách đỡ

| Mã | Rủi ro | Dấu hiệu | Cách đỡ |
|---|---|---|---|
| R1 | **Nest 12 quá mới, thư viện xung quanh chưa kịp theo.** `nestjs-pino`, `@nestjs/terminus`, `unplugin-swc`, `@nestjs/bullmq` có thể chưa khai `peerDependencies` cho 12 hoặc chưa chạy ổn với ESM. | `npm install` cảnh báo peer, hoặc lỗi lúc import. | Kiểm `npm view <gói> peerDependencies` trước khi cài. Nếu từ hai thư viện lõi trở lên chưa hỗ trợ, **quyết định trước Thứ Sáu 18/09**: ghim về Nest 11 dạng CommonJS. Sau mốc đó không đổi nữa vì hai bạn đã bắt đầu. |
| R2 | Prisma 7 mới, hướng dẫn trên mạng phần lớn cho bản 5 và 6. | Hai bạn chép mẫu cũ, lỗi `url` trong datasource. | ADR-003 đã ghi; module mẫu là nguồn đúng; nói rõ ở buổi họp. |
| R3 | Tuần 1 quá tải, nhất là Thứ Bảy. | Tới Thứ Sáu chưa xong 0.2. | Thứ tự cắt: codegen và kiểm env trượt sang S2; staging dùng phương án B nếu VPS chưa sẵn; **không cắt** lint, test mẫu, đổi cây, Dockerfile. |
| R4 | Một thư mục `migrations/` chung, ba người cùng tạo migration một tuần. | Hai migration cùng lúc, thứ tự áp lệch giữa máy. | Luật một pull request một migration, gộp nhanh, ai gộp sau thì `migrate dev` lại; CI kiểm lệch bắt được sai sót. |
| R5 | `CODEOWNERS` chỉ có tác dụng khi kho ở GitHub và có khóa nhánh. | Pull request gộp được mà không ai duyệt. | Việc số 1 ở mục 5. |
