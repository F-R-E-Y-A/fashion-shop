---
title: Hướng dẫn đọc sâu mã nguồn
updated: 2026-09-24
status: đang dùng
owner: Bảo
---
# Hướng dẫn đọc mã nguồn

**Chức năng:** Đọc sâu cả kho mã: đường đi một yêu cầu, mỗi tệp làm gì và bỏ đi thì sao, mười cơ chế và lý do, câu tự kiểm trước bảo vệ.

Bản 15 phút của cả dự án là [docs/README.md](../README.md); tài liệu này là bản đọc sâu 40 phút cho phần mã.

Tài liệu này để **hiểu cả kho mã**, không phải để tra cứu. Các tài liệu khác trả lời "làm thế nào"; tài liệu này trả lời **"cái này là cái gì, vì sao nó có mặt, bỏ đi thì sao"**.

Ba lý do nên đọc hết một lượt trước khi viết dòng mã đầu tiên:

1. Mọi phân hệ sau này đều **chép từ phân hệ mẫu**. Chép mà không hiểu thì chép cả cái sai.
2. Rubric mục 6 cho hội đồng **bốc ngẫu nhiên ít nhất 5 chỗ** trong mã và hỏi bốn câu, mỗi chỗ ba phút: nội dung này làm gì, vì sao nó có mặt, thư viện và tham số ở đây đến từ đâu, bỏ nó đi thì sản phẩm bị ảnh hưởng thế nào. Không trả lời được từ hai chỗ là **toàn bộ đồ án 0 điểm**.
3. Nhiều thứ trong kho này **cố tình khác** với hướng dẫn phổ biến trên mạng, vì NestJS 12 và Prisma 7 vừa lên bản lớn. Không biết trước thì sẽ sửa "cho giống trên mạng" rồi hỏng.

Đọc mất khoảng 40 phút. Nên mở kèm một cửa sổ mã để nhảy tới từng tệp được nhắc.

---

## 1. Bức tranh lớn trong một phút

Hệ thống là **một khối module hoá**: một ứng dụng máy chủ duy nhất, chia thành các phân hệ có ranh giới rõ, cộng một ứng dụng giao diện, cộng một cơ sở dữ liệu.

```
Trình duyệt
    │  fetch('/api/products?page=2')
    ▼
apps/web ── React 19, Vite ────────── giao diện
    │
    │  HTTP, JSON
    ▼
apps/api ── NestJS 12 ─────────────── máy chủ
    │
    │  SQL qua Prisma 7
    ▼
PostgreSQL 17 (Docker)
```

Không có hàng đợi, không có bộ đệm, không có máy tìm kiếm, **có chủ ý**. Nguyên tắc dẫn đường của cả dự án: **cơ chế xong sớm, dịch vụ đến đúng tuần.** Thứ ba người sẽ chép suốt mười một tuần thì phải có ngay từ đầu; còn Redis hay Meilisearch thì chỉ thêm vào tuần mà phân hệ cần đến nó. Thêm sớm một dịch vụ là thêm sớm một thứ phải bảo trì và phải giải thích trước hội đồng.

---

## 2. Một yêu cầu đi qua những gì

Đây là phần quan trọng nhất. Hiểu được đường đi này là hiểu được 80% kho mã. Ví dụ: người dùng mở trang sản phẩm và bấm sang trang 2.

### Phía giao diện

| # | Ở đâu | Chuyện gì xảy ra |
|---|---|---|
| 1 | `apps/web/src/app/routes.tsx` | Bảng định tuyến khớp đường dẫn `/` và dựng `ProductListPage` |
| 2 | `features/products/pages/ProductListPage.tsx` | Gọi `useQuery` của TanStack Query, đưa cho nó hàm `listProducts` |
| 3 | `features/products/api/products.api.ts` | Hàm `listProducts` gọi `apiGet('/products', params)` |
| 4 | `core/http.ts` | Ghép địa chỉ gốc, dựng chuỗi truy vấn, gọi `fetch`, và **biến lỗi thành `ApiError`** |

Chú ý bước 4: **chỉ một tệp duy nhất trong cả giao diện được gọi `fetch`**. Nếu mỗi trang tự gọi `fetch` thì khi cần thêm token đăng nhập ở tuần 3, phải sửa ba mươi chỗ. Giờ chỉ sửa một chỗ.

### Phía máy chủ

| # | Ở đâu | Chuyện gì xảy ra |
|---|---|---|
| 5 | `src/main.ts` → `app.setup.ts` | Gắn tiền tố `/api`, bật CORS, gắn `ValidationPipe` và bộ lọc lỗi |
| 6 | `ValidationPipe` | Đọc `?page=2`, **đổi chuỗi `"2"` thành số `2`** theo kiểu khai trong DTO, loại bỏ mọi tham số lạ |
| 7 | `modules/products/products.controller.ts` | Nhận `ListProductsQuery` đã sạch, gọi service. Không có logic ở đây |
| 8 | `modules/products/products.service.ts` | Dựng điều kiện lọc, gọi Prisma **trong một giao dịch** để đếm và lấy dữ liệu |
| 9 | `infra/prisma/prisma.service.ts` | Mượn một kết nối từ **bể kết nối dùng chung**, chạy truy vấn, trả lại bể. Xem mục 4.9 |
| 10 | `products.service.ts`, hàm `toResponse` | Đổi bản ghi của Prisma thành DTO trả về, **giá đổi thành chuỗi** |
| 11 | `common/pagination/page.response.ts`, `toPage` | Gói lại thành `{ items, total, page, pageSize, totalPages }` |

Nếu có lỗi ở bất kỳ bước nào **từ 6 tới 10**, `common/filters/all-exceptions.filter.ts` bắt lại và trả về **đúng một hình dạng lỗi** cho mọi trường hợp.

Vì sao từ bước 6 chứ không phải từ bước 5: bước 5 **chạy đúng một lần lúc khởi động**, không nằm trong vòng đời của một yêu cầu. Bộ lọc lỗi là thứ được *gắn vào* ở bước 5, nên nó chưa tồn tại khi bước 5 đang chạy, và khi bước 5 hỏng thì cũng chưa có máy chủ HTTP nào để mà trả lời. Chi tiết ở mục 4.10.

### Ba điều đáng dừng lại

**Vì sao đếm và lấy dữ liệu phải nằm trong một giao dịch** (`products.service.ts`, chỗ gọi `$transaction`). Nếu chạy hai truy vấn rời nhau, giữa hai lần đó có người thêm sản phẩm, thì `total` nói có 25 mà danh sách lại là của 26 bản ghi. Giao diện sẽ hiện "trang 3 trên 3" nhưng trang 3 trống. Giao dịch khiến hai con số luôn được đọc từ cùng một ảnh chụp dữ liệu.

**Vì sao giá trả về là chuỗi `"199000"` chứ không phải số `199000`.** Trong cơ sở dữ liệu giá là kiểu `Decimal`. Đổi thẳng `Decimal` sang JSON ra một đối tượng lạ mà giao diện không đọc được. Còn đổi sang số thực thì gặp lỗi kinh điển: `0.1 + 0.2` trong JavaScript ra `0.30000000000000004`. Với tiền thì sai một xu cũng là sai. Nên máy chủ trả chuỗi, giao diện tự định dạng bằng `core/format.ts`.

**Vì sao `totalPages` tối thiểu là 1** (`page.response.ts`). Khi không có sản phẩm nào, phép chia ra 0, và giao diện sẽ hiện "Trang 1 trên 0" — vô nghĩa với người dùng. Đây là **trạng thái biên**, đúng thứ rubric TC2.2 hỏi tới.

---

## 3. Bản đồ tệp: cái gì, vì sao, bỏ đi thì sao

Bảng này chính là thứ để ôn trước buổi bảo vệ. Cột cuối là câu trả lời cho câu hỏi thứ tư của hội đồng.

### Máy chủ, `apps/api/`

| Tệp | Làm gì | Bỏ đi thì |
|---|---|---|
| `src/main.ts` | Khởi động, đọc cổng, lắng nghe `0.0.0.0` | Không chạy được. `0.0.0.0` là bắt buộc để chạy trong container |
| `src/app.setup.ts` | Gom mọi thiết lập toàn cục vào một chỗ | Bài kiểm thử HTTP sẽ chạy trên một ứng dụng khác với ứng dụng thật, nên kiểm thử mất ý nghĩa |
| `src/app.module.ts` | Gốc cây phụ thuộc, nơi đăng ký phân hệ mới | Không có phân hệ nào được nạp |
| `src/infra/config/env.ts` | Kiểm biến môi trường **lúc khởi động** bằng zod | Thiếu biến thì chết giữa chừng ở một chỗ không liên quan, rất khó lần ra |
| `src/infra/prisma/prisma.service.ts` | **Một bể kết nối** dùng chung, tối đa 10 kết nối | Mỗi phân hệ tự mở bể riêng, nhân số kết nối lên và cạn giới hạn của Postgres |
| `src/common/filters/all-exceptions.filter.ts` | Mọi lỗi ra cùng một hình dạng JSON | Giao diện phải đoán hình dạng lỗi ở từng chỗ gọi |
| `src/common/pagination/` | Tham số phân trang và cách gói kết quả, dùng chung | Ba người làm ba kiểu phân trang khác nhau |
| `src/modules/products/` | **Phân hệ mẫu**, đủ bốn tầng để chép | Không ai biết cấu trúc chuẩn trông thế nào |
| `src/modules/*/index.ts` | **Cửa duy nhất** của một phân hệ | Phân hệ khác thò tay vào ruột, đổi gì cũng vỡ dây chuyền |
| `prisma/schema/*.prisma` | Lược đồ **tách theo chủ sở hữu** | Ba người cùng sửa một tệp, xung đột gộp mỗi tuần |
| `prisma/seed/` | Dữ liệu giả, mã định danh **cố định** | Kiểm thử không viết được câu "mở sản phẩm có mã X" |
| `test/helpers/` | Dựng ứng dụng thật và dọn cơ sở dữ liệu cho kiểm thử | Mỗi bài kiểm thử tự dựng, chạy chậm và không đều |
| `vitest.config.ts` | Hai bộ kiểm thử, và **SWC thay cho esbuild** | Kiểm thử báo lỗi tiêm phụ thuộc, xem mục 4.6 |
| `Dockerfile` | Đóng gói máy chủ thành image | Không triển khai được, TC2.6 tối đa mức 2 |
| `docker-entrypoint.sh` | Áp migration **trước khi** chạy ứng dụng | Ứng dụng chạy trên lược đồ cũ, lỗi cột không tồn tại |

### Giao diện, `apps/web/`

| Tệp | Làm gì | Bỏ đi thì |
|---|---|---|
| `src/main.tsx` | Điểm vào, gắn React vào `#root` | Trang trắng |
| `src/app/AppProviders.tsx` | Bọc cây React: bắt lỗi, bộ nhớ đệm, định tuyến | Mỗi trang tự dựng, và một lỗi làm trắng cả ứng dụng |
| `src/app/ErrorBoundary.tsx` | Lỗi trong một trang chỉ hỏng trang đó | Một lỗi nhỏ làm trắng toàn bộ, mất điểm demo |
| `src/app/routes.tsx` | **Nơi duy nhất** ráp các phân hệ lại | Các phân hệ import lẫn nhau, thành mạng nhện |
| `src/core/http.ts` | **Nơi duy nhất** gọi ra máy chủ | Thêm token đăng nhập phải sửa hàng chục chỗ |
| `src/core/format.ts` | Định dạng tiền và ngày | Mỗi trang định dạng một kiểu |
| `src/ui/Feedback.tsx` | Ba trạng thái: đang tải, lỗi, rỗng | Người viết trang quên mất trạng thái lỗi, đúng chỗ hội đồng bấm thử |
| `src/features/products/` | **Phân hệ mẫu** của giao diện | Không có khuôn để chép |
| `nginx.conf` | Phục vụ tệp tĩnh, và **SPA fallback** | Tải lại trang chi tiết sản phẩm ra lỗi 404 |

### Cơ chế, `tools/` và `.github/`

| Tệp | Làm gì | Bỏ đi thì |
|---|---|---|
| `tools/eslint/boundaries.mjs` | Luật ESLint tự viết, ép ba luật bất biến | Ba luật quay về làm lời nhắc trong tài liệu, tuần bận là bị phá |
| `tools/eslint/verify-boundaries.mjs` | Kiểm rằng **chính luật trên** còn chạy | Luật hỏng âm thầm mà cả nhóm vẫn tin là đang được bảo vệ |
| `tools/git/check-commit-msg.mjs` | Ép dạng commit message | Lịch sử git lộn xộn, khó đối chiếu với nhật ký AI |
| `tools/git/pre-push.mjs` | Chặn đẩy thẳng vào `develop`, `main` | Có người đẩy thẳng, bỏ qua duyệt và bỏ qua CI |
| `tools/db/prepare-test-db.mjs` | Tạo cơ sở dữ liệu riêng cho kiểm thử | Kiểm thử xoá sạch dữ liệu đang làm việc |
| `tools/github/request-reviewers.mjs` | Gán người duyệt theo `CODEOWNERS` | Kho riêng tư gói Free không tự gán, `CODEOWNERS` thành tờ giấy dán tường |
| `tools/evidence/github-metrics.mjs` | Xuất bốn con số rubric chấm | Tới lúc nộp phải ngồi đếm tay, và đếm sai |
| `.github/workflows/ci.yml` | Sáu chặng chặn gộp | Mã hỏng vào được `develop` |
| `.github/workflows/cd-staging.yml` | Triển khai sau khi CI xanh | Không có số lần triển khai để nộp, TC2.6 mất điểm |

---

## 4. Mười cơ chế, và vì sao chúng tồn tại

Đây là phần "vì sao" mà hội đồng hỏi kỹ nhất.

### 4.1 Luật ranh giới viết bằng ESLint

**Vấn đề.** Ba người, mười một tuần. Ba luật đã viết trong `CONTRIBUTING.md` từ đầu: một phân hệ một người, không ghi bảng người khác, controller không gọi thẳng Prisma. Nhưng tới tuần thứ tư, khi ai cũng vội, **lời nhắc trong tài liệu thua đường tắt trong mã**.

**Cách giải.** Viết ba luật đó thành một luật ESLint đặt tại `tools/eslint/boundaries.mjs`, bật trong `eslint.config.js`. Phạm luật thì báo lỗi bằng tiếng Việt, chỉ thẳng luật nào bị phạm:

```
Phan he "cart" chi duoc dung phan he "products" qua cua index cua ho,
khong import sau vao "modules/products/products.service.js".
Can gi thi de ho xuat ra o index (docs/CONTRIBUTING.md luat 2).
```

**Nó hoạt động thế nào.** ESLint đưa cho luật từng câu lệnh `import`. Luật tính xem tệp đang xét thuộc phân hệ nào, đích đến thuộc phân hệ nào, rồi so với cấu hình. Đọc hàm `check` trong tệp đó, khoảng 50 dòng.

**Vì sao tự viết mà không dùng plugin có sẵn.** Đã cân nhắc `eslint-plugin-boundaries`. Nó phân loại theo thẻ và loại, không khớp mô hình "mỗi thư mục con của `modules/` là một phân hệ thuộc về một người", và thông báo lỗi tiếng Anh chung chung không chỉ được luật nào của nhóm bị phạm. Một luật 150 dòng tự viết rẻ hơn việc uốn cấu hình theo mô hình của người khác. Trade-off: phải tự bảo trì, nên mới có mục tiếp theo.

### 4.2 Bộ kiểm cho chính luật ranh giới

Nghe thừa, nhưng đây là thứ đáng giá: **một luật lint âm thầm hỏng thì tệ hơn là không có luật**, vì cả nhóm vẫn tin ranh giới đang được giữ.

`tools/eslint/fixtures/` chứa năm tệp **sai có chủ ý**. `verify-boundaries.mjs` chép chúng vào đúng vị trí trong cây ứng dụng, chạy ESLint thật, đòi thấy đủ tám thông báo lỗi, rồi xoá đi. Chạy bằng `npm run lint:boundaries`, và CI chạy ở chặng một.

Đọc các tệp trong `fixtures/` cũng là cách nhanh nhất để biết **cái gì bị cấm**.

### 4.3 Cửa `index.ts` của mỗi phân hệ

Mỗi phân hệ có một `index.ts` liệt kê thứ nó cho người khác dùng. Phân hệ `products` xuất `ProductsService` và các kiểu, **không xuất controller**.

Ví như một cửa hàng: khách vào bằng cửa trước, không trèo vào kho. Dịch ra kỹ thuật: người khác chỉ phụ thuộc vào thứ mình cố ý công bố, nên mình đổi mã bên trong thoải mái mà không làm vỡ mã của họ. Phần công bố được ghi ở `src/modules/products/README.md`.

### 4.4 Lược đồ cơ sở dữ liệu tách theo chủ sở hữu

Prisma 7 cho phép `schema` trỏ vào **một thư mục** thay vì một tệp. Nhờ đó `prisma/schema/` có bốn tệp: `base` giữ cấu hình, còn `catalog`, `orders`, `identity` là bảng của Bảo, Duy, Tài.

Không có nó thì ba người cùng sửa một tệp `schema.prisma` mỗi tuần, và xung đột gộp ở tệp đó là loại khó gỡ nhất vì nó kéo theo migration.

Kèm theo là cổng chặn lệch lược đồ, `npm run db:drift`. Ai sửa tệp `.prisma` mà quên tạo migration thì CI đỏ. Đã kiểm: thêm một bảng không có migration thì lệnh trả mã thoát 2; khớp thì trả 0.

### 4.5 Kiểm biến môi trường lúc khởi động

`src/infra/config/env.ts` khai mọi biến bằng zod. Thiếu hoặc sai thì **máy chủ dừng ngay lúc khởi động** và in đúng tên biến, thay vì chạy được rồi chết ở một chỗ không liên quan sau ba mươi phút.

Có một chi tiết đáng nhớ trong tệp đó: dùng `z.looseObject` chứ không phải `z.object`. Lý do đã kiểm bằng lệnh: `z.object({A}).parse({A, B})` trả về `{A}`, tức là **cắt bỏ mọi khoá không khai báo**. Nếu dùng `z.object`, ai thêm biến mới vào `.env` mà quên khai ở đây sẽ thấy `config.get('BIEN_MOI')` trả về `undefined` và không hiểu vì sao. Đây là lỗi H-08 trong sổ lỗi AI ở kho docs.

### 4.6 SWC thay cho trình biên dịch mặc định của Vitest

NestJS dùng **decorator** như `@Injectable()` và **metadata** của chúng để biết phải tiêm cái gì vào đâu. Trình biên dịch mặc định của Vitest là esbuild, mà **esbuild không sinh metadata cho decorator**. Hậu quả: chạy kiểm thử là lỗi tiêm phụ thuộc, dù mã hoàn toàn đúng.

`vitest.config.ts` vì vậy thay esbuild bằng SWC, có bật `decoratorMetadata`. Đây là cái bẫy dễ mất nửa buổi nếu không biết trước, nên nó được ghi cả ở đây lẫn trong [testing.md](testing.md).

### 4.7 Image Docker bốn tầng

`apps/api/Dockerfile` chia làm bốn tầng: `deps` cài gói, `build` biên dịch, `prod-deps` cài lại chỉ gói cần khi chạy, `runtime` là image cuối.

Vì sao không gộp làm một: image cuối **không chứa mã nguồn TypeScript, không chứa trình biên dịch, không chứa gói chỉ dùng để phát triển**. Nhỏ hơn, khởi động nhanh hơn, và ít thứ có thể bị khai thác hơn.

Hai chi tiết cố ý trong tệp đó:

- `prisma` nằm ở phần gói chạy thật chứ không phải gói phát triển, vì container phải chạy được `prisma migrate deploy` lúc khởi động.
- Bước `prisma generate` cần biến `DATABASE_URL`, nên tầng `build` đặt một giá trị giả. Lệnh này **không kết nối cơ sở dữ liệu**, nó chỉ đọc cấu hình. Đây chính là lỗi H-04 đã làm CI đỏ.

### 4.8 `ValidationPipe`: một cấu hình, mọi đường dẫn

Đặt một lần ở `app.setup.ts`, áp cho **mọi đường dẫn của mọi phân hệ**. Không ai phải nhớ gắn lại, và không ai quên gắn.

**Nó chạy khi nào.** Không phải với mỗi yêu cầu HTTP nói chung, mà với **mỗi tham số của hàm xử lý có kiểu là một lớp**. Khi Nest sắp gọi `list(query: ListProductsQuery)`, nó thấy kiểu khai báo là một lớp, nên đưa dữ liệu thô qua pipe trước. Với tham số kiểu nguyên thuỷ như `slug: string` thì pipe **bỏ qua**, xem phần cuối mục này.

**Bốn việc nó làm, theo thứ tự**, ứng với bốn tuỳ chọn trong `app.setup.ts`:

| Tuỳ chọn | Việc | Quan sát được bằng |
|---|---|---|
| `transform: true` | Dựng một **thể hiện của lớp DTO** từ dữ liệu thô, và áp `@Type(() => Number)` để đổi chuỗi thành số | `?page=2` trả về `"page": 2` kiểu số, không phải `"2"` |
| giá trị mặc định trong DTO | Trường không được gửi thì lấy giá trị khai sẵn | Không gửi gì thì ra `page = 1, pageSize = 12` |
| `whitelist: true` | **Loại bỏ** mọi trường không khai trong DTO | Tự nó thì im lặng bỏ đi |
| `forbidNonWhitelisted: true` | Gặp trường lạ thì **báo lỗi** thay vì im lặng | `?foo=bar` trả 400 `["property foo should not exist"]` |
| các chú thích `@IsInt`, `@Min`, `@Max` | Chạy `class-validator`, gom **mọi** lỗi lại rồi ném một lần | `?page=abc` trả `["page nho nhat la 1","page phai la so nguyen"]` |

Bốn kết quả trong cột cuối là đo thật trên máy chủ đang chạy, không phải suy luận.

**Vì sao `forbidNonWhitelisted` quan trọng hơn vẻ ngoài.** Nếu chỉ bật `whitelist`, gõ nhầm `?pagesize=60` sẽ bị âm thầm bỏ qua và máy chủ trả 12 bản ghi. Người gọi tưởng tham số không có tác dụng và đi tìm lỗi ở chỗ khác. Bật thêm `forbidNonWhitelisted` thì máy chủ **nói thẳng** là tên đó không tồn tại.

**Vì sao `enableImplicitConversion: false`.** Nếu bật, `class-transformer` tự suy kiểu và đổi ngầm. Nghe tiện nhưng sinh bất ngờ: chuỗi `"false"` thành `true`, chuỗi rỗng thành `0`. Tắt nó đi thì muốn đổi kiểu phải ghi rõ `@Type(() => Number)`, tức là **ý định nằm trong mã** chứ không nằm trong hành vi ngầm của thư viện.

**Chỗ pipe không với tới.** `findOne(@Param('slug') slug: string)` khai kiểu nguyên thuỷ, nên pipe bỏ qua hoàn toàn. Đã đo: gửi slug dài 500 ký tự thì trả **404 chứ không phải 400**, nghĩa là chuỗi đi thẳng tới truy vấn mà không qua kiểm tra độ dài. Prisma có tham số hoá câu lệnh nên không có nguy cơ chèn lệnh SQL, nhưng đây vẫn là **dữ liệu vào không được kiểm**. Muốn kiểm thì khai tham số đường dẫn bằng một lớp DTO thay vì chuỗi. Đã ghi vào [TECH_DEBT.md](../TECH_DEBT.md) mục ND-10.

### 4.9 Bể kết nối cơ sở dữ liệu

**Hiểu nhầm dễ mắc:** `PrismaService` là một thể hiện duy nhất dùng chung, nên tưởng là **một kết nối** duy nhất tới Postgres. Không phải.

`PrismaService` nhận adapter `PrismaPg`, và adapter đó tạo một `pg.Pool` — **một bể kết nối**. Bể mặc định giữ tối đa **10 kết nối**, mở theo nhu cầu chứ không mở sẵn.

Đo trên máy chủ đang chạy:

| Lúc | Số kết nối tới Postgres |
|---|---|
| Không có yêu cầu nào | 0 |
| Đang bắn 60 yêu cầu song song | 10, tất cả đang bận |
| Ngay sau khi xong | 10, ở trạng thái rảnh, giữ lại để dùng tiếp |

Số 10 đúng bằng giá trị mặc định của `pg-pool`. Bể giữ kết nối rảnh vì **bắt tay mở một kết nối Postgres tốn vài chục mili giây**, đắt hơn nhiều so với việc giữ nó mở.

**Vì sao chỉ một bể cho cả ứng dụng.** Postgres có trần số kết nối, mặc định 100. Nếu mỗi phân hệ tự tạo `PrismaClient` riêng thì với 15 phân hệ sẽ thành 150 kết nối, vượt trần và máy chủ bắt đầu từ chối. Một bể dùng chung giữ con số ở mức biết trước.

**Nếu 10 là chưa đủ thì sao.** Khi có 60 yêu cầu cùng lúc, 10 cái chạy trước, 50 cái còn lại **xếp hàng** chứ không lỗi. Đó là cách một bể kết nối hoạt động, và thường là điều mong muốn: cơ sở dữ liệu thà phục vụ tuần tự còn hơn nhận 60 truy vấn rồi chậm đều tất cả. Nút cổ chai thật ở quy mô thương mại điện tử **thường không nằm ở số kết nối** mà nằm ở truy vấn thiếu chỉ mục, thứ được xử lý ở HT-08 tuần 9 bằng `EXPLAIN` và số đo thật.

Muốn đổi kích thước bể thì thêm `connection_limit` vào chuỗi kết nối. **Chưa đổi lúc này** vì đổi mà không có số đo thì chỉ là đoán; tuần 10 có bài kiểm thử tải của Duy mới đủ căn cứ.

### 4.10 Bộ lọc lỗi bắt được gì, không bắt được gì

Bộ lọc `AllExceptionsFilter` gắn vào **vòng đời của một yêu cầu**. Nó bắt mọi thứ ném ra từ lúc Nest bắt đầu xử lý yêu cầu cho tới lúc trả lời: lỗi kiểm tra dữ liệu vào, lỗi nghiệp vụ, lỗi truy vấn, lỗi không lường trước.

Ba loại nó **không** bắt được, và biết trước thì đỡ mất thời gian đi tìm:

**Một, lỗi lúc khởi động.** Chạy máy chủ với `DATABASE_URL=mysql://...` thì kết quả là:

```
ERROR [ExceptionHandler] Error: Cau hinh moi truong khong hop le, may chu khong khoi dong:
  - DATABASE_URL: phai bat dau bang postgresql://
```

Tiến trình dừng. Không có yêu cầu nào, nên không có gì để định dạng thành JSON. Đây chính là lý do đường đi ở mục 2 ghi "lỗi từ bước 6 tới 10": bước 5 nằm ngoài vòng đời yêu cầu.

**Hai, lỗi trước khi vào Nest.** CORS được cài dưới dạng middleware của Express, chạy trước bộ lọc. Đã đo: gửi yêu cầu kèm `Origin: https://ke-xau.example` thì máy chủ trả **200 và không kèm header `Access-Control-Allow-Origin`**. Máy chủ không ném lỗi; chính **trình duyệt** mới là bên chặn không cho mã JavaScript đọc kết quả. Hệ quả thực tế: gọi bằng `curl` hay Postman thì CORS không chặn được gì, nó chỉ là cơ chế bảo vệ phía trình duyệt.

**Ba, tiến trình chết đột ngột.** Hết bộ nhớ hoặc container bị dừng thì không có mã nào chạy được nữa. Đó là việc của `HEALTHCHECK` trong image và của nền tảng triển khai, không phải của bộ lọc.

---

## 5. Sáu chặng CI, mỗi chặng chặn lỗi gì

Mở `.github/workflows/ci.yml`. Sáu chặng chạy song song, không phải để cho đẹp mà vì rubric TC2.6 mức cao nhất đòi từ sáu chặng: dựng, phân tích tĩnh, kiểm thử, quét bảo mật, đóng gói, triển khai.

| Chặng | Chặn loại lỗi nào | Ví dụ thật |
|---|---|---|
| 1. Định dạng, lint, ranh giới | Phá luật kiến trúc, mã lộn xộn | Ai đó import thẳng `products.service.js` từ phân hệ khác |
| 2. Kiểm kiểu và dựng thử | Sai kiểu dữ liệu, mã không biên dịch được | `interface` không khớp `Record<string, ...>`, lỗi H-07 |
| 3. Kiểm thử đơn vị | Sai logic nghiệp vụ | Phân trang tính sai số trang |
| 4. Migration và kiểm thử HTTP | Lệch lược đồ, sai đường đi giữa các tầng | Sửa `.prisma` mà quên tạo migration |
| 5. Quét bí mật và thư viện | Lộ mật khẩu, thư viện có lỗ hổng nghiêm trọng | Ai đó lỡ commit tệp `.env` thật |
| 6. Dựng image và chạy thử | Chạy trên máy được, trong container thì không | Thiếu một tệp không được chép vào image |

Chặng 6 đáng chú ý: nó không chỉ dựng image mà còn **chạy image lên, gọi `/api/healthz`, và đòi thấy đúng mã commit vừa đẩy**. Dựng được không có nghĩa là chạy được.

---

## 6. Tự kiểm trước khi bảo vệ

Trả lời được mười lăm câu này thì yên tâm với mục 6 của rubric. Câu nào bí thì chỗ tìm câu trả lời nằm ở cột cuối.

| # | Câu hỏi | Tìm ở |
|---|---|---|
| 1 | Vì sao một khối module hoá chứ không phải microservices? | [LOG#adr-001](../LOG.md#adr-001) |
| 2 | Vì sao chỉ PostgreSQL, không thêm MongoDB? | [LOG#adr-002](../LOG.md#adr-002) |
| 3 | Vì sao import tương đối phải ghi đuôi `.js` dù tệp là `.ts`? | [LOG#adr-003](../LOG.md#adr-003) |
| 4 | Vì sao ép ranh giới bằng lint chứ không bằng quy ước? | [LOG#adr-004](../LOG.md#adr-004) |
| 5 | Giá tiền vì sao trả về dạng chuỗi? | Mục 2 của tài liệu này |
| 6 | Vì sao đếm và lấy dữ liệu phải chung một giao dịch? | Mục 2 |
| 7 | `z.looseObject` khác `z.object` chỗ nào, vì sao quan trọng? | Mục 4.5 |
| 8 | Vì sao kiểm thử dùng SWC chứ không dùng mặc định? | Mục 4.6 |
| 9 | Image Docker vì sao chia bốn tầng? | Mục 4.7 |
| 10 | Nếu bỏ `index.ts` của một phân hệ thì hỏng chuyện gì? | Mục 3 và 4.3 |
| 11 | `ValidationPipe` chạy vào lúc nào, và chỗ nào nó không với tới? | Mục 4.8 |
| 12 | Ứng dụng giữ bao nhiêu kết nối tới cơ sở dữ liệu, vì sao là con số đó? | Mục 4.9 |
| 13 | Bộ lọc lỗi không bắt được loại lỗi nào? | Mục 4.10 |
| 14 | Chỗ nào trong mã do AI sinh, và đã kiểm chứng thế nào? | Kho docs, `ai-log/` |
| 15 | Kho mã có nợ kỹ thuật nào, xử lý khi nào? | [TECH_DEBT.md](../TECH_DEBT.md) |

Cách luyện hiệu quả nhất: **nhờ Duy hoặc Tài bốc ngẫu nhiên một tệp rồi bấm giờ ba phút**, trả lời đủ bốn câu của rubric. Làm mỗi tuần một lần ở buổi chốt Thứ Tư.

---

## 7. Học theo thứ tự nào

Nếu anh muốn hiểu sâu thay vì chỉ chạy được, đây là thứ tự tôi đề nghị. Mỗi bước có một việc làm tay, vì đọc không thì quên.

**Bước 1, hiểu đường đi của dữ liệu.** Đọc lại mục 2 kèm mở mã. Rồi tự thêm một tham số lọc mới vào `ListProductsQuery`, ví dụ lọc theo khoảng giá, cho chạy được từ giao diện tới cơ sở dữ liệu. Đây là việc chạm đúng năm tệp của đường đi.

**Bước 2, hiểu ranh giới.** Mở một tệp trong `tools/eslint/fixtures/`, đọc xem nó sai chỗ nào. Rồi thử **cố tình phá luật** trong mã thật: ở `core/http.ts` thêm một dòng import từ `@/features/products`, chạy `npm run lint`, đọc thông báo lỗi, rồi xoá đi.

**Bước 3, hiểu kiểm thử.** Chạy `npm test`, rồi mở `products.service.spec.ts`. Sửa một con số cho bài kiểm thử đỏ lên, đọc thông báo, rồi sửa lại. Sau đó làm tương tự với `npm run test:http` để thấy khác biệt giữa hai tầng.

**Bước 4, hiểu triển khai.** Chạy `npm run prod:up`, mở `http://localhost:8080`. Rồi đọc `docker-entrypoint.sh` và log của container bằng `docker logs fashion-shop-prod-api-1` để thấy đúng thứ tự: áp migration, nạp dữ liệu, khởi động.

**Bước 5, hiểu cổng chặn.** Đọc `ci.yml` từ trên xuống. Với mỗi chặng, tự hỏi "chặng này bắt được lỗi gì mà chặng khác không bắt được".

Làm hết năm bước mất khoảng một buổi. Sau đó anh giải thích được gần như mọi chỗ trong kho.

---

## 8. Chỗ dễ hiểu nhầm

Sáu chỗ mà người mới hay vấp, ghi sẵn để khỏi mất thời gian.

| Hiểu nhầm | Thực tế |
|---|---|
| "Import phải bỏ đuôi `.js` cho gọn" | NestJS 12 là ESM thuần, **bắt buộc** ghi đuôi `.js` kể cả khi tệp thật là `.ts`. Bỏ đi là lỗi lúc chạy |
| "Đặt `url` trong `datasource` như hướng dẫn trên mạng" | Prisma 7 bỏ trường đó. Đường kết nối nằm ở `prisma.config.ts` và ở adapter |
| "Kéo mã về là chạy được ngay" | Prisma Client sinh vào `src/generated/`, không có trên git. Phải chạy `npm run db:generate` |
| "Kiểm thử HTTP chạy trên cơ sở dữ liệu thường" | Nó chạy trên cơ sở dữ liệu **riêng** và xoá sạch trước mỗi lần. Chạy nhầm là mất dữ liệu đang làm |
| "Sửa `VITE_API_URL` rồi khởi động lại là xong" | Biến `VITE_*` được nhúng vào mã **lúc dựng**. Đổi thì phải dựng lại |
| "Lint báo lỗi ranh giới thì tắt luật đi" | Mang ra buổi chốt Thứ Tư. Có thể luật sai và cần sửa, nhưng tắt luật là bỏ mất thứ đang bảo vệ cả nhóm |

---

## 9. Đọc tiếp ở đâu

| Muốn biết | Đọc |
|---|---|
| Luật làm việc và các bước thêm phân hệ | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Quy ước đặt tên, bốn luật máy không kiểm được | [code.md](code.md) |
| Đường dẫn, phân trang, mã lỗi | [api.md](api.md) |
| Chạy và viết kiểm thử | [testing.md](testing.md) |
| Vì sao chọn kiến trúc và công nghệ | [LOG.md](../LOG.md), các mục `ADR-` |
| Nợ kỹ thuật và hạn xử lý | [TECH_DEBT.md](../TECH_DEBT.md) |
| Lộ trình nền tảng còn lại | [features/platform/README.md](../features/platform/README.md) |
| Dựng môi trường thử | [features/platform/staging.md](../features/platform/staging.md) |
| Nhật ký AI, sổ tiến độ, hồ sơ nộp khoa | Kho [`F-R-E-Y-A/docs`](https://github.com/F-R-E-Y-A/docs) |
