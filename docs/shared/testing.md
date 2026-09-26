---
title: Kiểm thử — chạy thế nào, viết thế nào
updated: 2026-09-24
status: đang dùng
owner: Bảo
---
# Kiểm thử: chạy thế nào, viết thế nào

**Chức năng:** Lệnh chạy kiểm thử, bài nào viết ở đâu, khuôn nào để chép, và ba luật đặt tên để truy vết tới tiêu chí chấp nhận.

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

## Hai loại bài, viết ở hai chỗ

| Loại | Ở đâu | Chạy gì | Nhanh cỡ nào |
|---|---|---|---|
| Đơn vị | `apps/api/src/**/*.spec.ts`, `apps/web/src/**/*.test.tsx` | Prisma và `fetch` đều giả | vài chục ms |
| Qua HTTP | `apps/api/test/**/*.spec.ts` | Cả ứng dụng thật, Postgres thật | vài giây |

Nguyên tắc chọn: **logic nghiệp vụ thì viết bài đơn vị; đường đi giữa các tầng thì viết bài HTTP.** Bài HTTP kiểm được ba thứ mà bài đơn vị không thấy: kiểm tra dữ liệu vào, khuôn lỗi thống nhất, và tiền tố `/api`.

## Bốn khuôn có sẵn, chép mà dùng

| Chép tệp này | Khi làm |
|---|---|
| `apps/api/src/modules/products/products.service.spec.ts` | Nghiệp vụ trong service |
| `apps/api/test/products.http.spec.ts` | Đường dẫn API mới |
| `apps/web/src/features/products/pages/ProductListPage.test.tsx` | Trang mới |
| `apps/api/test/helpers/` | Không phải chép, dùng trực tiếp |

## Ba luật khi viết bài

**1. Tên bài ghi mã use case và tiêu chí chấp nhận.** `describe` ghi use case, `it` ghi tiêu chí, ví dụ `describe("UC-03.4 Xem chi tiet san pham")` và `it("UC-03.4/AC5 slug khong ton tai tra 404")`. Mã tiêu chí lấy từ `docs/features/<x>/use-cases.md`. Rubric TC2.5 Mức 5 đòi test truy vết được tới tiêu chí chấp nhận; tên bài là cách rẻ nhất để làm việc đó.

**2. Đừng gõ lại dữ liệu giả.** Import từ `prisma/seed/<phân hệ>.seed.ts`. Đổi dữ liệu một chỗ là mọi bài theo kịp, thay vì hỏng hàng loạt.

**3. Sửa một lỗi thì kèm một bài kiểm thử tái hiện lỗi đó.** Gắn nhãn `regression-test` cho pull request. Đây là thứ rubric gọi là kiểm thử hồi quy.

## Vì sao dùng Vitest chứ không phải Jest

NestJS 12 chỉ còn bản ESM. Jest chạy ESM vẫn phải bật cờ thử nghiệm và cấu hình vòng vèo. Vitest chạy ESM tự nhiên, và giao diện vốn đã dùng Vite nên cả kho chỉ cần học một bộ.

Vitest mặc định biên dịch bằng esbuild, mà esbuild **không sinh metadata cho decorator**, thứ NestJS cần để tiêm phụ thuộc. Vì vậy `vitest.config.ts` của máy chủ thay bằng SWC. Đây là cái bẫy dễ mất nửa buổi nếu không biết trước.

## Báo cáo độ phủ

`npm run test:cov` ghi vào `apps/*/coverage/`. Trên CI, báo cáo được lưu thành tệp đính kèm của lượt chạy, giữ 30 ngày. Tải ở tab **Actions** của lượt chạy, mục **Artifacts**. Đây là minh chứng cho tiêu chí TC2.5 khi nộp hồ sơ.
