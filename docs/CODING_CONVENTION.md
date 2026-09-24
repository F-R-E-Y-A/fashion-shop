# Quy ước viết mã

Quy ước nào **máy kiểm được** thì đã nằm trong `eslint.config.js` và `.prettierrc`, không nhắc lại ở đây. Tệp này chỉ ghi những gì máy không kiểm được.

Chạy trước khi mở pull request:

```bash
npm run check
```

Lệnh đó chạy lần lượt: lint, kiểm luật ranh giới, kiểm định dạng, kiểm kiểu, kiểm thử đơn vị.

## Máy đã ép sẵn

| Luật | Công cụ | Vi phạm thì |
|---|---|---|
| Định dạng: nháy đơn, chấm phẩy, phẩy cuối, rộng 100 cột | Prettier | Hook trước commit tự sửa |
| Thứ tự import theo nhóm | `simple-import-sort` | Hook tự sửa |
| Không `any`, không biến thừa, dùng `===` | typescript-eslint | CI đỏ |
| Controller và DTO không chạm Prisma | Luật cục bộ `local/boundaries` | CI đỏ |
| `common/` và `infra/` không biết `modules/` | Luật cục bộ | CI đỏ |
| Phân hệ chỉ gọi phân hệ khác qua `index.ts` | Luật cục bộ | CI đỏ |
| `core/` và `ui/` không biết `features/` | Luật cục bộ | CI đỏ |
| Dạng commit message | Hook `commit-msg` | Không commit được |
| Không đẩy thẳng vào `develop` và `main` | Hook `pre-push` | Không đẩy được |

## Đặt tên

| Đối tượng | Quy ước | Ví dụ |
|---|---|---|
| Thư mục phân hệ | số nhiều, chữ thường | `products`, `orders` |
| Tệp máy chủ | `<tên>.<vai trò>.ts` | `products.service.ts` |
| Tệp giao diện | Hoa đầu cho component, thường cho phần còn lại | `ProductListPage.tsx`, `products.api.ts` |
| Đường dẫn API | số nhiều, chữ thường, nối gạch ngang | `/api/product-variants` |
| Đường dẫn trang | tiếng Việt không dấu, nối gạch ngang | `/san-pham/:slug` |
| Bảng dữ liệu | số nhiều, gạch dưới | `product_variants` |
| Cột | gạch dưới trong cơ sở dữ liệu, lưng lạc đà trong mã | `created_at` ↔ `createdAt` |
| Nhánh | `feature/ph-NN-ten-ngan` | `feature/ph-05-cart` |

## Tiếng Việt trong mã

- **Chú thích và thông báo lỗi cho người dùng**: tiếng Việt có dấu.
- **Tên biến, hàm, tệp**: tiếng Anh.
- **Chú thích trong tệp mã máy chủ**: tiếng Việt **không dấu**, tránh lệch bảng mã giữa ba máy.
- Chú thích trả lời **vì sao**, không trả lời **làm gì**. Mã đã nói nó làm gì rồi.

## Bốn luật máy không kiểm được

**1. Tiền luôn là `Decimal`, không bao giờ là số thực dấu phẩy động.** API trả tiền dưới dạng **chuỗi**, giao diện tự định dạng bằng `formatPrice`.

**2. Mỗi trang tải dữ liệu phải có đủ ba trạng thái**: đang tải, lỗi, không có dữ liệu. Dùng `Loading`, `ErrorNote`, `Empty` trong `ui/`. Thiếu một trong ba là thiếu, người duyệt trả lại.

**3. Thêm bảng thì thêm dữ liệu giả cho bảng đó** trong cùng pull request, vào `prisma/seed/<phân hệ>.seed.ts`. Mã định danh cố định, không sinh ngẫu nhiên, để ba người và máy CI thấy cùng một bộ dữ liệu.

**4. Thêm biến môi trường thì khai ở hai nơi** trong cùng pull request: `.env.example` và `apps/api/src/infra/config/env.ts`. Thiếu nơi thứ hai thì máy chủ vẫn chạy rồi chết giữa chừng, thay vì chết ngay lúc khởi động với đúng tên biến.

## Hàm và tệp dài bao nhiêu

Không đặt trần cứng. Một hàm làm một việc, đọc hết không phải cuộn màn hình. Một tệp `service` quá 300 dòng thường là dấu hiệu phân hệ đó nên tách, mang ra buổi chốt Thứ Tư bàn chứ đừng tự tách.
