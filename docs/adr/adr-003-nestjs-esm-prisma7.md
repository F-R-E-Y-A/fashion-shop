# ADR-003. Máy chủ chạy NestJS dạng ESM, Prisma 7 dùng adapter

- **Ngày**: 14/09/2026
- **Trạng thái**: Đã chốt
- **Người quyết định**: Bảo

## Bối cảnh

Khi dựng khung tuần 1, hai phiên bản thư viện mới buộc phải đổi cách viết so với phần lớn hướng dẫn đang có trên mạng. Ghi lại đây để hai bạn không mất thời gian tra rồi làm theo bài cũ.

## Ba điều đã đổi

**Một. NestJS 12 chỉ còn bản ESM.** Gói `@nestjs/common` khai báo `"type": "module"`, không còn chạy được kiểu CommonJS. Hệ quả trong mã của chúng ta:

- `apps/api/package.json` có `"type": "module"`.
- `tsconfig.json` đặt `module` và `moduleResolution` đều là `node16`.
- **Mọi import tương đối phải ghi đuôi `.js`**, kể cả khi tệp thật là `.ts`. Ví dụ `import { ProductsService } from './products.service.js'`. Nhìn lạ nhưng đây là luật của ESM, không phải gõ nhầm.

**Hai. Prisma 7 không nhận `url` trong khối `datasource` nữa.** Đường kết nối tách làm hai chỗ:

- Lệnh dòng lệnh như `migrate`, `db seed`, `studio` đọc `prisma.config.ts`.
- Ứng dụng lúc chạy nhận một adapter, ở đây là `PrismaPg`, xem `src/common/prisma/prisma.service.ts`.

**Ba. Prisma Client sinh ra mã TypeScript vào `src/generated/prisma`,** không nằm trong `node_modules` như trước. Thư mục này không đưa lên git, ai kéo mã về phải chạy `npm run db:generate` một lần. Bước này đã nằm sẵn trong `npm run setup` và trong CI.

## Vài chỗ nhỏ đã chốt kèm

- **Phiên bản ghim.** Thẻ `latest` của Prisma trên npm đang trỏ vào bản thử nghiệm 8.0.0-rc, nên `prisma` ghim đúng 7.10.0 cho khớp `@prisma/client`. TypeScript ghim dải `~6.0.2` vì công cụ dựng của Nest 12 dùng TypeScript 6; để npm tự chọn sẽ ra TypeScript 7 và hai trình biên dịch sẽ cho kết quả khác nhau.
- **`tsx` chỉ dùng cho tệp seed.** Node 24 chạy thẳng TypeScript được, nhưng không tự đổi đuôi `.js` trong import thành `.ts`, mà mã Prisma sinh ra lại viết như vậy. `tsx` xử lý đúng chỗ đó. Mã ứng dụng không dùng `tsx`, vẫn dựng bằng `nest build`.
- **Cổng chạy.** API ở 3001 và giao diện ở 5174, lệch khỏi mặc định 3000 và 5173 vì hai cổng đó đang bị ứng dụng khác trên máy chiếm. Đổi trong `.env` và `apps/web/vite.config.ts` nếu máy bạn khác.

## Hệ quả

Chấp nhận: hướng dẫn NestJS và Prisma tìm thấy trên mạng phần lớn viết cho bản cũ, chép nguyên vào sẽ lỗi. Khi bí thì đọc module mẫu `products` trước, đó mới là mẫu đúng của dự án này.

Được lại: đứng trên bản hiện hành, không phải nâng cấp giữa chừng khi đang chạy nước rút.
