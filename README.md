# Website thương mại điện tử thời trang

Tiểu luận chuyên ngành. Giảng viên hướng dẫn: TS. Phan Thị Huyền Trang.

| Thành viên | MSSV | GitHub | Phụ trách |
|---|---|---|---|
| Nguyễn Ngọc Thái Bảo | 23110180 | `@Ancuyou` | Trưởng nhóm, kiến trúc và vận hành |
| Phan Ngọc Duy | 23110194 | `@DuyPhan422` | Chất lượng và vòng đời đơn hàng |
| Huỳnh Ngọc Tài | 23110305 | `@KickHuynh` | Dữ liệu, tài khoản và hậu mãi |

**Kế hoạch, sổ tiến độ, nhật ký AI và hồ sơ nộp khoa nằm ở kho riêng:** [`F-R-E-Y-A/docs`](https://github.com/F-R-E-Y-A/docs). Kho này chỉ giữ mã nguồn và tài liệu nói về mã.

---

## Chạy lần đầu

Cần sẵn: **Node 24 trở lên**, **Docker Desktop đang chạy**.

```bash
git clone https://github.com/F-R-E-Y-A/fashion-shop.git
cd fashion-shop

cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm run setup             # cài gói, bật Postgres, tạo bảng, nạp dữ liệu giả, tạo CSDL kiểm thử
```

Nếu npm hỏi về kịch bản cài đặt thì đồng ý: `prisma`, `esbuild` và `@swc/core` cần chạy kịch bản của chúng. Danh sách đã được ghi sẵn trong `package.json`.

Rồi mở hai cửa sổ dòng lệnh:

```bash
npm run dev:api           # http://localhost:3001/api
npm run dev:web           # http://localhost:5174
```

Mở `http://localhost:5174` phải thấy 10 sản phẩm mẫu. Nếu thấy, máy bạn đã sẵn sàng viết mã.

Đặc tả API tự sinh nằm ở `http://localhost:3001/api/docs`.

## Các lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `npm run dev:api` / `npm run dev:web` | Chạy máy chủ, chạy giao diện |
| `npm run check` | **Chạy cái này trước khi mở pull request.** Lint, ranh giới, định dạng, kiểu, kiểm thử |
| `npm test` | Kiểm thử đơn vị cả hai bên |
| `npm run test:http` | Kiểm thử gọi HTTP thật vào cơ sở dữ liệu kiểm thử |
| `npm run test:cov` | Kiểm thử kèm báo cáo độ phủ |
| `npm run lint:fix` | Sửa lỗi lint và định dạng tự động được |
| `npm run db:up` / `npm run db:down` | Bật, tắt Postgres |
| `npm run db:migrate` | Tạo và áp migration sau khi sửa tệp `.prisma` |
| `npm run db:seed` | Nạp lại dữ liệu giả |
| `npm run db:studio` | Mở giao diện xem bảng dữ liệu |
| `npm run prod:up` / `npm run prod:down` | Chạy cả cụm bằng Docker như môi trường thật |

## Cây thư mục

```
fashion-shop/
├── apps/
│   ├── api/                      máy chủ NestJS
│   │   ├── prisma/
│   │   │   ├── schema/           lược đồ TÁCH THEO CHỦ SỞ HỮU
│   │   │   │   ├── base.prisma       generator, datasource · Bảo
│   │   │   │   ├── catalog.prisma    bảng của Bảo
│   │   │   │   ├── orders.prisma     bảng của Duy
│   │   │   │   └── identity.prisma   bảng của Tài
│   │   │   ├── migrations/       lịch sử thay đổi bảng
│   │   │   └── seed/             dữ liệu giả, mỗi phân hệ một tệp
│   │   ├── src/
│   │   │   ├── common/           tiện ích dùng chung: khuôn lỗi, phân trang
│   │   │   ├── infra/            hạ tầng: Prisma, kiểm biến môi trường
│   │   │   ├── modules/          MỖI PHÂN HỆ MỘT THƯ MỤC
│   │   │   │   ├── health/
│   │   │   │   └── products/     MODULE MẪU, chép cái này
│   │   │   ├── app.module.ts     nơi đăng ký phân hệ mới
│   │   │   ├── app.setup.ts      thiết lập toàn cục, dùng chung với kiểm thử
│   │   │   └── main.ts
│   │   ├── test/                 kiểm thử gọi HTTP thật
│   │   └── Dockerfile
│   └── web/                      giao diện React + Vite
│       ├── src/
│       │   ├── app/              khung trang, định tuyến, provider
│       │   ├── core/             gọi API, định dạng, bộ nhớ đệm
│       │   ├── ui/               thành phần hiển thị dùng chung
│       │   └── features/         MỖI PHÂN HỆ MỘT THƯ MỤC
│       │       └── products/     FEATURE MẪU, chép cái này
│       ├── Dockerfile · nginx.conf · vercel.json
├── docs/                         tài liệu, xem docs/README.md
├── infra/compose.prod.yml        chạy cả cụm như môi trường thật
├── tools/                        luật lint, hook git, script minh chứng
├── .github/                      CODEOWNERS, mẫu PR, mẫu phiếu, CI và CD
├── docker-compose.yml            chỉ Postgres, cho phát triển hằng ngày
└── .env.example
```

## Thêm một phân hệ mới

1. Thêm bảng của mình vào **tệp `.prisma` của chính mình**, chạy `npm run db:migrate`.
2. Thêm dữ liệu giả vào `prisma/seed/<phân hệ>.seed.ts`, gọi từ `seed/index.ts`.
3. Chép thư mục `apps/api/src/modules/products`, đổi tên, sửa nội dung. Giữ `index.ts` làm cửa duy nhất.
4. Thêm một dòng vào mảng `imports` trong `app.module.ts`.
5. Chép thư mục `apps/web/src/features/products`, đổi tên. Thêm một dòng `Route` trong `app/routes.tsx`.
6. Viết kiểm thử: một bài đơn vị cho service, một bài HTTP cho đường dẫn, một bài cho trang.
7. Viết tài liệu use case vào `docs/ba/` theo mẫu.
8. Thêm dòng sở hữu của mình vào `.github/CODEOWNERS`.
9. `npm run check`, rồi mở pull request vào `develop`.

Ba luật không được phá, chi tiết ở `docs/CONTRIBUTING.md`:

- **Một phân hệ do một người làm trọn** từ bảng dữ liệu tới giao diện.
- **Không ai ghi vào bảng của người khác.** Cần dữ liệu của họ thì gọi service họ công bố qua `index.ts`.
- **Controller không gọi thẳng Prisma**, phải đi qua tầng service.

Ba luật này được **ép bằng ESLint**, không phải bằng lời nhắc. Phạm luật thì lint báo lỗi tiếng Việt chỉ thẳng luật nào. Xem `docs/adr/adr-004-co-che-chat-luong.md`.

## Hiểu kho mã này

**Đọc `docs/CODE_TOUR.md` trước khi viết dòng mã đầu tiên.** Tài liệu đó đi qua đường đi của một yêu cầu từ trình duyệt tới cơ sở dữ liệu, giải thích mỗi tệp làm gì và bỏ đi thì hỏng chuyện gì, bảy cơ chế của kho và lý do có chúng, cùng mười hai câu tự kiểm trước buổi bảo vệ. Mất khoảng 40 phút, và tiết kiệm nhiều hơn thế.



## Công nghệ và lý do

| Thành phần | Chọn | Vì sao |
|---|---|---|
| Cơ sở dữ liệu | PostgreSQL 17 | Hội đồng chấm kỹ sơ đồ quan hệ thực thể nên cần cơ sở dữ liệu quan hệ. Postgres đủ sức làm cả phần tìm kiếm và dữ liệu bán cấu trúc, không cần thêm MongoDB |
| Máy chủ | NestJS 12 | Module là cấu trúc của ngôn ngữ nên ranh giới giữa ba người ép được bằng cơ chế. Có sẵn tiêm phụ thuộc, kiểm tra dữ liệu vào và sinh đặc tả API |
| Truy cập dữ liệu | Prisma 7 | Lược đồ tách được theo chủ sở hữu, migration có lịch sử, kiểu dữ liệu sinh tự động khớp bảng |
| Giao diện | React 19 + Vite 8 | Cùng ngôn ngữ TypeScript với máy chủ nên ba người đọc được mã của nhau |
| Gọi dữ liệu | TanStack Query | Xử lý sẵn ba trạng thái tải, lỗi, rỗng và bộ nhớ đệm |
| Kiểm thử | Vitest + Supertest | Chạy ESM tự nhiên, mà NestJS 12 chỉ còn bản ESM |
| Chất lượng | ESLint + Prettier + luật ranh giới tự viết | Ép ba luật bất biến của nhóm bằng máy |

Quyết định dài hơn nằm trong `docs/adr/`.

## Chưa có gì, và bao giờ có

Nguyên tắc: **cơ chế xong sớm, dịch vụ đến đúng tuần.** Thứ ba người chép suốt mười một tuần thì phải có từ đầu. Dịch vụ thì thêm vào tuần mà phân hệ cần tới nó, không dựng sẵn để đó.

| Chưa có | Sẽ có ở |
|---|---|
| Đăng nhập, phân quyền | PH-01, tuần 2 và 3, Tài |
| Redis, hàng đợi, tác vụ nền, bảng ghi sự kiện | HT-05, tuần 5, Bảo |
| Meilisearch | PH-04, tuần 4, Bảo |
| Kho ảnh | Khi phân hệ đầu tiên cần tải ảnh, tuần 2 |
| Nhật ký có cấu trúc, số đo hiệu năng | HT-05 và HT-10, tuần 5 và 10, Bảo |
| Kiểm thử đầu cuối và kiểm thử tải | HT-06 và HT-07, tuần 9 và 10, Duy |
| Thư viện gọi API sinh từ OpenAPI | Khi đặc tả ổn định, tuần 3 |
