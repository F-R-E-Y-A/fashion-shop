---
title: Kiểm thử — chạy thế nào, viết thế nào
updated: 2026-11-05
status: đang dùng
owner: Bảo
---
# Kiểm thử: chạy thế nào, viết thế nào

**Chức năng:** Lệnh chạy kiểm thử, bài nào viết ở đâu, khuôn nào để chép, cách truy vết tới tiêu chí chấp nhận và vòng đời một lỗi.

Tệp này nói về **cơ chế**. Tầng kiểm thử, độ phủ mong muốn và quy trình xử lý lỗi thuộc [test-strategy.md](test-strategy.md), do Duy chốt.

## Chạy

```bash
npm test                 # đơn vị, cả máy chủ và giao diện, không cần cơ sở dữ liệu
npm run test:cov         # như trên, kèm báo cáo độ phủ
npm run test:http        # gọi HTTP thật vào cơ sở dữ liệu kiểm thử
npm run check            # lint, ranh giới, định dạng, kiểu, kiểm thử đơn vị
```

Lần đầu chạy `test:http` phải tạo cơ sở dữ liệu kiểm thử trước:

```bash
npm run db:test:prepare
```

Lệnh đó đọc `DATABASE_URL_TEST` trong `.env`, tạo cơ sở dữ liệu nếu chưa có, rồi áp migration lên đó. **Cơ sở dữ liệu kiểm thử bị xoá sạch trước mỗi lần chạy**, nên nó bắt buộc phải khác cơ sở dữ liệu thường ngày. Hai biến trùng nhau thì bộ kiểm thử từ chối chạy.

### Đầu cuối (E2E)

```bash
npx playwright install chromium   # lần đầu trên máy
npm run test:e2e -w apps/web      # build và bật API :3101, web :5175, seed lại CSDL kiểm thử
```

Cần Postgres và Redis đang chạy (`npm run db:up`) và đã `db:test:prepare`. Bài nằm ở `apps/web/e2e/`; dữ liệu do `apps/api/test/e2e/seed.ts` nạp và in ra một dòng JSON mà bài đọc qua `fixture()`. Lỗi thì xem `apps/web/playwright-report/` hoặc `npx playwright show-trace <trace.zip>`. Lý do chọn cách này: [LOG#adr-046](../LOG.md#adr-046).

## Ba loại bài, viết ở ba chỗ

| Loại | Ở đâu | Chạy gì | Nhanh cỡ nào |
|---|---|---|---|
| Đơn vị | `apps/api/src/**/*.spec.ts`, `apps/web/src/**/*.test.tsx` | Prisma và `fetch` đều giả | vài chục ms |
| Qua HTTP | `apps/api/test/**/*.spec.ts` | Cả ứng dụng thật, Postgres thật | vài giây |
| Đầu cuối | `apps/web/e2e/*.spec.ts` | Trình duyệt thật, web và API thật, Postgres kiểm thử | vài chục giây |

Nguyên tắc chọn: **logic nghiệp vụ thì viết bài đơn vị; đường đi giữa các tầng thì viết bài HTTP.** Bài HTTP kiểm được ba thứ mà bài đơn vị không thấy: kiểm tra dữ liệu vào, khuôn lỗi thống nhất, và tiền tố `/api`.

## Bốn khuôn có sẵn, chép mà dùng

| Chép tệp này | Khi làm |
|---|---|
| `apps/api/src/modules/products/products.service.spec.ts` | Nghiệp vụ trong service |
| `apps/api/test/products.http.spec.ts` | Đường dẫn API mới |
| `apps/web/src/features/products/pages/ProductListPage.test.tsx` | Trang mới |
| `apps/api/test/helpers/` | Không phải chép, dùng trực tiếp |

## Ba luật khi viết bài

**1. Tên bài ghi mã use case và tiêu chí chấp nhận.** `describe` ghi use case, `it` ghi tiêu chí, ví dụ `describe("UC-03.4 Xem chi tiet san pham")` và `it("UC-03.4/AC5 slug khong ton tai tra 404")`. Mã tiêu chí lấy từ `docs/features/<x>/use-cases.md`. Chỉ mã ở tên `it`/`test` được tính; một bài kiểm nhiều AC ghi `UC-07.1/AC3,AC4` hoặc nhiều mã cách nhau bằng dấu cách. Rubric TC2.5 Mức 5 đòi test truy vết được tới tiêu chí chấp nhận; tên bài là cách rẻ nhất để làm việc đó ([LOG#adr-047](../LOG.md#adr-047)).

**2. Đừng gõ lại dữ liệu giả.** Import từ `prisma/seed/<phân hệ>.seed.ts`. Đổi dữ liệu một chỗ là mọi bài theo kịp, thay vì hỏng hàng loạt.

**3. Sửa một lỗi thì kèm một bài kiểm thử tái hiện lỗi đó.** Gắn nhãn `regression-test` cho pull request. Đây là thứ rubric gọi là kiểm thử hồi quy.

## Khuôn cho một use case: từ AC tới minh chứng

Làm theo thứ tự này cho mỗi use case mới; đủ năm bước là use case đó đạt phần kiểm thử của rubric TC2.5 Mức 5.

1. **Viết AC có loại** trong `use-cases.md` theo [khuôn](templates/use-case.md): ít nhất một `thuận`, một `âm` (dữ liệu sai, không quyền, trạng thái cấm), một `biên` (sát ngưỡng, đồng thời, lặp, hết hạn). Mỗi endpoint mới có ít nhất một ca đúng và một ca sai ([test-strategy.md](test-strategy.md)).
2. **Chọn tầng cho từng AC**: luật nghiệp vụ thuần thì unit; đi qua HTTP, CSDL, quyền thì bài HTTP; khách thấy gì trên trang thì unit web; luồng nhiều vai qua trình duyệt thì E2E. Tranh chấp tài nguyên thì thêm bài tải.
3. **Viết bài, tên mang mã** `UC-NN.m/ACk`. Bài cũ đã kiểm đúng AC thì đổi tên, không viết lại.
4. **Chạy ma trận** `npm run evidence:trace -- --uc UC-NN`: không còn AC "chưa có", cột Âm và Biên đều ✓, không có mã treo. Thêm `--check` để lệnh trả mã lỗi khi còn thiếu.
5. **Đo độ phủ** `npm run evidence:coverage -- --core <module>` sau `test:cov` và `test:http:cov`: module cốt lõi gộp ≥ 70% dòng.

AC không tự động được (cổng thanh toán thật, email thật) ghi `(…, tay)` và viết kịch bản ngay dưới AC; ma trận tính nó là thủ công, mẫu số tỉ lệ tự động vẫn có nó.

## Vòng đời một lỗi

1. **Mở Issue** bằng mẫu "Báo lỗi" (nhãn `bug`, một nhãn `severity/critical|major|minor`): bước tái hiện, mong đợi, thực tế, mã AC bị vi phạm nếu có.
2. **Nhánh** `bugfix/<mô tả>` hoặc `task/<mô tả>` vào nhánh feature cha. **Viết bài tái hiện trước**, chạy thấy đỏ, rồi mới sửa.
3. **Pull request** ghi `Closes #<số>`, gắn nhãn `regression-test`; tên bài mang mã AC nếu lỗi vi phạm một AC.
4. **Gộp** vào `develop` thì Issue tự đóng; gộp vào nhánh feature thì đóng tay kèm link commit. `critical` sửa trong ngày; còn `critical` mở thì không được bảo vệ (rubric: 0 lỗi Critical/Blocker).

## Vì sao dùng Vitest chứ không phải Jest

NestJS 12 chỉ còn bản ESM. Jest chạy ESM vẫn phải bật cờ thử nghiệm và cấu hình vòng vèo. Vitest chạy ESM tự nhiên, và giao diện vốn đã dùng Vite nên cả kho chỉ cần học một bộ.

Vitest mặc định biên dịch bằng esbuild, mà esbuild **không sinh metadata cho decorator**, thứ NestJS cần để tiêm phụ thuộc. Vì vậy `vitest.config.ts` của máy chủ thay bằng SWC. Đây là cái bẫy dễ mất nửa buổi nếu không biết trước.

## Báo cáo độ phủ

`npm run test:cov` ghi vào `apps/*/coverage/`. Trên CI, báo cáo được lưu thành tệp đính kèm của lượt chạy, giữ 30 ngày. Tải ở tab **Actions** của lượt chạy, mục **Artifacts**. Đây là minh chứng cho tiêu chí TC2.5 khi nộp hồ sơ.

Rubric tính độ phủ của **mô-đun cốt lõi**, không phải cả kho: `npm run evidence:coverage -- --core products,checkout,payments,orders` đọc `lcov.info` của unit API, HTTP và unit web rồi gộp theo module (một dòng tính là đã chạy nếu bộ nào chạy tới). Ba minh chứng `evidence:trace`, `evidence:test-cases`, `evidence:coverage` xuất ra Markdown kèm lệnh, commit và ngày; lưu vào `minh-chung/` của kho docs ở commit sạch.
