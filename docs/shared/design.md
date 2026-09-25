---
title: Chuẩn giao diện chung
updated: 2026-09-24
status: đang dùng, hệ màu và kiểu chữ chưa chốt
owner: Bảo
---
# Chuẩn giao diện chung

**Chức năng:** Những gì mọi trang của mọi feature phải theo: token, CSS đặt ở đâu, thành phần dùng chung, trạng thái, giá, ảnh, bố cục hẹp, tiếp cận.

Chuẩn này là **sàn**, không phải trần. Feature ghi phần riêng của mình trong README của feature, không chép lại phần ở đây.

## Token: một nguồn

Màu, bo góc và phông nằm ở biến CSS trong [styles.css:4-19](../../apps/web/src/styles.css#L4): `--ink`, `--muted`, `--line`, `--bg`, `--accent`, `--danger`, `--radius`. Dùng `var(--ink)`, **không gõ mã màu trực tiếp** trong tệp CSS của feature. Cần màu mới thì thêm biến vào `styles.css` trong pull request của mình và nhắn Bảo duyệt, vì tệp đó của chung.

Hệ màu và thang chữ **chưa chốt**: `styles.css` ghi rõ đây là bản 0.1. PH-01 tuần này đề xuất bản đầu; tới lúc đó giữ nguyên token hiện có.

## CSS đặt ở đâu

| Loại | Đặt ở | Ai sửa |
|---|---|---|
| Token, reset, khung cửa hàng và khung quản trị | `apps/web/src/styles.css` | Bảo |
| Kiểu của thành phần dùng chung | `apps/web/src/ui/<Tên>.module.css`, cạnh thành phần | Bảo |
| Kiểu riêng của một feature | `apps/web/src/features/<x>/**/<Tên>.module.css`, cạnh thành phần dùng nó | Chủ feature |

Kiểu mới viết bằng **CSS Modules**: `import styles from './ProductCard.module.css'` rồi `className={styles.card}`. Vite tự đổi tên class theo tệp nên hai feature không thể đè class của nhau, không cần nhớ quy ước tiền tố. `vite/client` đã khai kiểu cho `*.module.css` ([vite-env.d.ts:1](../../apps/web/src/vite-env.d.ts#L1)), không phải cài gì thêm. Các class cũ trong `styles.css` (`.card`, `.grid`, `.detail`) để yên tới khi PH-01 chuyển trang sản phẩm sang module. Lý do và phương án đã cân nhắc: [LOG#adr-009](../LOG.md#adr-009).

## Thành phần dùng chung đang có

| Thành phần | Tệp | Dùng khi |
|---|---|---|
| `Loading`, `ErrorNote`, `Empty` | [ui/Feedback.tsx](../../apps/web/src/ui/Feedback.tsx) | Ba trạng thái của mọi trang tải dữ liệu |
| `Pager` | [ui/Pager.tsx](../../apps/web/src/ui/Pager.tsx) | Mọi danh sách có phân trang |
| `formatPrice`, `formatDateTime` | [core/format.ts](../../apps/web/src/core/format.ts) | Hiện tiền và ngày giờ |

Thành phần nào hai feature trở lên cần thì đưa vào `ui/`; một feature cần thì để trong feature đó.

## Bảy luật mọi trang phải theo

1. **Ba trạng thái đủ mặt:** đang tải, lỗi, không có dữ liệu. Thiếu một là người duyệt trả lại ([code.md](code.md) luật 2).
2. **Tiền là chuỗi từ máy chủ, hiện bằng `formatPrice`.** Có giá khuyến mãi thì gạch giá niêm yết và làm nổi giá bán; không tự làm tròn hay tính lại giá ở giao diện.
3. **Ảnh có khung tỉ lệ cố định** (sản phẩm `3 / 4`, xem `.card__image`) để trang không xê dịch khi ảnh tải xong; ảnh dưới màn hình đầu dùng `loading="lazy"`; mọi ảnh có `alt` mô tả.
4. **Bố cục hẹp từ 360 px.** Điểm gãy chung hiện là `720px` ([styles.css:219](../../apps/web/src/styles.css#L219)); lưới sản phẩm tự co bằng `auto-fill`.
5. **Tiếp cận cơ bản:** thẻ tương tác là `button` hoặc `a` thật, không gắn `onClick` vào `div`; trường nhập có nhãn; trạng thái tải có `role="status"`, lỗi có `role="alert"` như `Feedback.tsx` đã làm.
6. **Chữ trên giao diện tiếng Việt có dấu**; tên biến và tệp tiếng Anh ([code.md](code.md)).
7. **Đường dẫn trang tiếng Việt không dấu, nối gạch ngang**, khai ở `app/routes.tsx` và chỉ ở đó: `/san-pham/:slug`, `/danh-muc/:slug`, `/gio-hang`, `/dang-nhap`.

## Chưa có, sẽ có

| Thứ | Khi nào | Ai |
|---|---|---|
| Hệ màu, thang chữ, khoảng cách | PH-01, tuần này, đề xuất trong [features/products/LOG.md](../features/products/LOG.md) | Bảo |
| Khung ảnh xám khi tải (skeleton) dùng chung | Khi trang thứ hai cần | Bảo |
| Kiểm tra độ tương phản tự động | Chưa xếp lịch | — |
