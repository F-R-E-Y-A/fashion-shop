# Website thương mại điện tử thời trang

Tiểu luận chuyên ngành. Giảng viên hướng dẫn: TS. Phan Thị Huyền Trang.

| Thành viên | MSSV | Phụ trách |
|---|---|---|
| Nguyễn Ngọc Thái Bảo | 23110180 | Trưởng nhóm, kiến trúc và vận hành |
| Phan Ngọc Duy | 23110194 | Chất lượng và vòng đời đơn hàng |
| Huỳnh Ngọc Tài | 23110305 | Dữ liệu, tài khoản và hậu mãi |

Bảng chia việc theo sprint nằm ở `ChiaViecTheoSprint_TLCN.docx` tại thư mục cha.

---

## Chạy lần đầu

Cần sẵn: **Node 24 trở lên**, **Docker Desktop đang chạy**.

```bash
git clone <địa chỉ kho mã>
cd fashion-shop

cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm install
npm run setup             # bật Postgres, tạo bảng, nạp dữ liệu giả
```

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
| `npm run dev:api` | Chạy máy chủ, tự nạp lại khi sửa mã |
| `npm run dev:web` | Chạy giao diện |
| `npm run db:up` / `npm run db:down` | Bật, tắt Postgres |
| `npm run db:migrate` | Tạo và áp migration sau khi sửa `schema.prisma` |
| `npm run db:seed` | Nạp lại dữ liệu giả |
| `npm run db:studio` | Mở giao diện xem bảng dữ liệu |
| `npm run typecheck` | Kiểm kiểu cả hai bên |
| `npm run build` | Dựng bản phát hành cả hai bên |

## Cây thư mục

```
fashion-shop/
├── apps/
│   ├── api/                    máy chủ NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma   lược đồ cơ sở dữ liệu
│   │   │   ├── migrations/     lịch sử thay đổi bảng
│   │   │   └── seed.ts         dữ liệu giả, mã cố định
│   │   ├── prisma.config.ts    cấu hình dòng lệnh của Prisma 7
│   │   └── src/
│   │       ├── common/         hạ tầng dùng chung, Bảo sở hữu
│   │       ├── modules/        mỗi phân hệ một thư mục
│   │       │   ├── health/
│   │       │   └── products/   MODULE MẪU, chép cái này
│   │       ├── app.module.ts   nơi đăng ký phân hệ mới
│   │       └── main.ts
│   └── web/                    giao diện React + Vite
│       └── src/
│           ├── layouts/        khung cửa hàng và khung quản trị
│           ├── pages/          từng trang
│           └── lib/api.ts      một chỗ duy nhất gọi máy chủ
├── docs/                       tài liệu, xem docs/README.md
├── .github/                    CODEOWNERS, mẫu PR, mẫu phiếu, CI
├── docker-compose.yml
└── .env.example
```

## Thêm một phân hệ mới

1. Chép cả thư mục `apps/api/src/modules/products` rồi đổi tên.
2. Thêm bảng của mình vào `prisma/schema.prisma`, chạy `npm run db:migrate`.
3. Thêm một dòng vào mảng `imports` trong `app.module.ts`.
4. Thêm trang trong `apps/web/src/pages`, thêm một dòng `Route` trong `App.tsx`.
5. Viết tài liệu use case vào `docs/ba/`, theo mẫu `docs/ba/uc-template.md`.
6. Mở pull request vào `develop`, điền danh sách kiểm.

Ba luật không được phá, chi tiết ở `docs/CONTRIBUTING.md`:

- **Một phân hệ do một người làm trọn** từ bảng dữ liệu tới giao diện.
- **Không ai ghi vào bảng của người khác.** Cần dữ liệu của họ thì gọi service họ đã công bố.
- **Controller không gọi thẳng Prisma**, phải đi qua tầng service.

## Công nghệ và lý do

| Thành phần | Chọn | Vì sao |
|---|---|---|
| Cơ sở dữ liệu | PostgreSQL 17 | Hội đồng chấm kỹ ERD nên cần cơ sở dữ liệu quan hệ. Postgres đủ sức làm cả phần tìm kiếm và dữ liệu bán cấu trúc, không cần thêm MongoDB. |
| Máy chủ | NestJS 12 | Module là cấu trúc của ngôn ngữ nên ranh giới giữa ba người được ép bằng cơ chế, không phải bằng lời nhắc. Có sẵn tiêm phụ thuộc, kiểm tra dữ liệu vào và sinh đặc tả API. |
| Truy cập dữ liệu | Prisma 7 | Lược đồ viết một chỗ, migration có lịch sử, kiểu dữ liệu sinh tự động khớp bảng. |
| Giao diện | React 19 + Vite 8 | Cùng ngôn ngữ TypeScript với máy chủ nên ba người đọc được mã của nhau. |
| Gọi dữ liệu | TanStack Query | Xử lý sẵn ba trạng thái tải, lỗi, rỗng và bộ nhớ đệm. |

Quyết định dài hơn nằm trong `docs/adr/`.

## Bản 0.1 cố tình chưa có gì

Nguyên tắc: dựng đơn giản trước, đắp dần theo đúng tuần mà bảng chia việc yêu cầu.

| Chưa có | Sẽ có ở |
|---|---|
| Đăng nhập, phân quyền | PH-01, tuần 2 và 3, Tài |
| Redis, hàng đợi, tác vụ nền, bảng ghi sự kiện | HT-05, tuần 5, Bảo |
| Meilisearch | PH-04, tuần 4, Bảo |
| MinIO lưu ảnh | HT-01 bản sau, khi phân hệ đầu tiên cần tải ảnh |
| Kiểm tra sâu tình trạng hệ thống, số đo hiệu năng | HT-05 và HT-10, tuần 5 và 10, Bảo |
| Kiểm thử đơn vị và đầu cuối | HT-06 và HT-07, tuần 9 và 10, Duy |
| Thư viện gọi API sinh từ OpenAPI | bản sau, khi đặc tả đã ổn định |
