---
title: Chuẩn giao diện chung
updated: 2026-11-14
status: đang dùng, nhận diện F.R.E.Y.A. đã chốt
owner: Bảo
---
# Chuẩn giao diện chung

**Chức năng:** Những gì mọi trang của mọi feature phải theo: token, CSS đặt ở đâu, thành phần dùng chung, trạng thái, giá, ảnh, bố cục hẹp, tiếp cận.

Chuẩn này là **sàn**, không phải trần. Feature ghi phần riêng của mình trong README của feature, không chép lại phần ở đây.

## Token: một nguồn

Màu, bo góc và phông nằm ở biến CSS trong [styles.css:2-33](../../apps/web/src/styles.css#L2): `--ink`, `--muted`, `--line`, `--bg`, `--accent`, `--danger`, `--radius`; nền trạng thái `--danger-soft`, `--success`/`--success-soft` và nền thẻ trắng `--paper` (thêm 20/10 cho trang đơn, chờ Bảo duyệt). Trang trạng thái đứng riêng (404, chờ phiên) dùng lớp chung `.page-state`. Dùng `var(--ink)`, **không gõ mã màu trực tiếp** trong tệp CSS của feature. Cần màu mới thì thêm biến vào `styles.css` trong pull request của mình và nhắn Bảo duyệt, vì tệp đó của chung.

Hệ màu và phông **đã chốt theo bộ nhận diện F.R.E.Y.A. (04/10)**: palette Espresso/Ivory/Copper/Sand/Stone trùng token sẵn có trong `styles.css`; heading Playfair Display, nội dung Be Vietnam Pro. Tên, khẩu hiệu và asset logo lấy từ `core/brand.ts` và `public/images/brand/freya/`; quy tắc dùng logo ở bản bàn giao `work/branding/freya-brand-kit-v1/BRAND_GUIDE.md` (canvas PNG có margin, hiển thị qua `rasterLogoViewBox` trong `asset-manifest.json`).

## CSS đặt ở đâu

| Loại | Đặt ở | Ai sửa |
|---|---|---|
| Token, reset, khung cửa hàng | `apps/web/src/styles.css` | Bảo |
| Khung quản trị (thanh bên Espresso, vùng nội dung) | `apps/web/src/app/AdminLayout.module.css` | Bảo |
| Trang quản trị dùng chung (bảng, panel, nút, ô nhập, nhãn, thông báo), lấy bằng `composes` | `apps/web/src/ui/AdminKit.module.css` ([LOG#adr-039](../LOG.md#adr-039), đề xuất) | Bảo |
| Kiểu của thành phần dùng chung | `apps/web/src/ui/<Tên>.module.css`, cạnh thành phần | Bảo |
| Kiểu riêng của một feature | `apps/web/src/features/<x>/**/<Tên>.module.css`, cạnh thành phần dùng nó | Chủ feature |

Kiểu mới viết bằng **CSS Modules**: `import styles from './ProductCard.module.css'` rồi `className={styles.card}`. Vite tự đổi tên class theo tệp nên hai feature không thể đè class của nhau, không cần nhớ quy ước tiền tố. `vite/client` đã khai kiểu cho `*.module.css` ([vite-env.d.ts:1](../../apps/web/src/vite-env.d.ts#L1)), không phải cài gì thêm. Các class cũ trong `styles.css` (`.card`, `.grid`, `.detail`) để yên tới khi PH-01 chuyển trang sản phẩm sang module. Lý do và phương án đã cân nhắc: [LOG#adr-009](../LOG.md#adr-009).

## Thành phần dùng chung đang có

| Thành phần | Tệp | Dùng khi |
|---|---|---|
| `Loading`, `ErrorNote`, `Empty` | [ui/Feedback.tsx](../../apps/web/src/ui/Feedback.tsx) | Ba trạng thái của mọi trang tải dữ liệu |
| `Pager` | [ui/Pager.tsx](../../apps/web/src/ui/Pager.tsx) | Mọi danh sách có phân trang |
| `ConfirmDialog` | [ui/ConfirmDialog.tsx](../../apps/web/src/ui/ConfirmDialog.tsx) | Thao tác khó đảo ngược cần xác nhận (khóa tài khoản, hoàn tiền) |
| `classifyRequestError`, `shouldRetryRequest` | [core/request-errors.ts](../../apps/web/src/core/request-errors.ts) | Chọn câu báo theo nhóm lỗi thay vì in `error.message`; POST lỗi 5xx là "chưa xác định kết quả" |
| `formatPrice`, `formatDateTime` | [core/format.ts](../../apps/web/src/core/format.ts) | Hiện tiền và ngày giờ |

Thành phần nào hai feature trở lên cần thì đưa vào `ui/`; một feature cần thì để trong feature đó.

## Bảy luật mọi trang phải theo

1. **Ba trạng thái đủ mặt:** đang tải, lỗi, không có dữ liệu. Thiếu một là người duyệt trả lại ([code.md](code.md) luật 2).
2. **Tiền là chuỗi từ máy chủ, hiện bằng `formatPrice`.** Có giá khuyến mãi thì gạch giá niêm yết và làm nổi giá bán; không tự làm tròn hay tính lại giá ở giao diện.
3. **Ảnh có khung tỉ lệ cố định** (sản phẩm `3 / 4`, xem `.card__image`) để trang không xê dịch khi ảnh tải xong; ảnh dưới màn hình đầu dùng `loading="lazy"`; mọi ảnh có `alt` mô tả.
4. **Bố cục hẹp từ 360 px.** Điểm gãy chung hiện là `720px` ([styles.css:325](../../apps/web/src/styles.css#L325)); lưới sản phẩm tự co bằng `auto-fill`.
5. **Tiếp cận cơ bản:** thẻ tương tác là `button` hoặc `a` thật, không gắn `onClick` vào `div`; trường nhập có nhãn; trạng thái tải có `role="status"`, lỗi có `role="alert"` như `Feedback.tsx` đã làm.
6. **Chữ trên giao diện tiếng Việt có dấu**; tên biến và tệp tiếng Anh ([code.md](code.md)).
7. **Đường dẫn trang tiếng Việt không dấu, nối gạch ngang**, khai ở `app/routes.tsx` và chỉ ở đó: `/san-pham/:slug`, `/danh-muc/:slug`, `/gio-hang`, `/dang-nhap`. Ngoại lệ đề xuất: khu quản trị dùng `/admin/*`, chữ trên trang vẫn tiếng Việt, mọi trang nằm sau `RequireAdmin` ([LOG#adr-027](../LOG.md#adr-027)).

## Phản hồi thao tác quản trị

`ActionFeedback` trong `ui/` hiển thị banner trong nội dung trang. Thành công dùng
`role="status"`, không giành focus, tự đóng sau 5 giây và có nút đóng. Timer tạm dừng
khi hover hoặc focus, tiếp tục thời gian còn lại khi cả hai kết thúc; mỗi thông báo
mới có định danh riêng và caller truyền phạm vi phiên. Thay callback không reset timer.

Lỗi/cảnh báo dùng `role="alert"`, không tự đóng. Cảnh báo chưa xác định có nút đối chiếu
không cho đóng mất đường xử lý. Đóng banner chỉ đổi phần trình bày, không xóa marker,
mở khóa mutation hoặc thay cache. Validation và trang mất quyền giữ cơ chế riêng.

Áp dụng tại Users, Products, Vouchers và danh sách/chi tiết Promotions; Categories
được tích hợp riêng sau đợt UI Danh mục. `ConfirmDialog` trả focus về nút mở; nếu nút
đã bị gỡ khỏi DOM thì dùng vị trí dự phòng. Không thêm dependency hoặc đổi token.

## Chưa có, sẽ có

| Thứ | Khi nào | Ai |
|---|---|---|
| Hệ màu, thang chữ, khoảng cách | PH-01, tuần này, đề xuất trong [features/products/LOG.md](../features/products/LOG.md) | Bảo |
| Khung ảnh xám khi tải (skeleton) dùng chung | Khi trang thứ hai cần | Bảo |
| Kiểm tra độ tương phản tự động | Chưa xếp lịch | — |

## Giao diện admin — Issue #59, chờ review

Khung [AdminLayout](../../apps/web/src/app/AdminLayout.tsx) giữ sidebar Espresso, thêm header và drawer mobile;
[AdminNavigation](../../apps/web/src/app/AdminNavigation.tsx) quản lý focus và khóa cuộn của drawer.
[AdminKit](../../apps/web/src/ui/AdminKit.module.css) dùng paper cho bảng/panel, Copper cho nút/focus,
Playfair H1 và Be Vietnam Pro cho nội dung/điều khiển; không thêm token hoặc đổi CSS cửa hàng.
Bộ lọc thu gọn chỉ Users cần nên nằm trong feature Account, không đưa thành UI dùng chung.
Pager/Feedback chung chỉ được chỉnh hình thức qua selector nằm dưới gốc page admin; API component giữ nguyên.

PR #58 đã merge tại `8fe405e`; nhánh Issue #59 đã cập nhật theo develop đó.
Check/build/docs lint và QA trình duyệt đã đạt ở bản local; minh chứng tại kho docs.
Bảo review app/ui và Duy/Bảo review vùng Orders trước merge; quyết định [ADR-042](../LOG.md#adr-042) vẫn đề xuất.
