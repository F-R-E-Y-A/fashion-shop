---
title: UC-12.1 — điều hướng quản trị đơn hàng
updated: 2026-11-06
status: đề xuất, chờ Duy thống nhất mã và AC
owner: Tài, Duy review
---
# UC-12.1 · Tiếp nhận và xác nhận đơn — phần điều hướng

**Chức năng:** Quản trị viên tìm, chuyển trang, xem chi tiết và quay lại đúng danh sách đơn đang xử lý.

Mã UC-12.1 lấy từ danh mục **đề xuất** trong [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26),
không tạo mã use case mới. PR đó chưa merge; số AC dưới đây là đề xuất cho phần điều hướng của
[Issue #61](https://github.com/F-R-E-Y-A/fashion-shop/issues/61), chưa mô tả trọn nghiệp vụ tiếp nhận/xác nhận.
Các thao tác và chính sách đơn/tiền/kho hiện có theo [README](README.md) và [Checkout](../checkout/README.md).

## Điều kiện trước và sau

ADMIN đã đăng nhập, guard và quyền backend hiện có áp dụng. Thành công chỉ đổi vị trí/điều kiện xem,
không thay trạng thái đơn, vai, số tiền hoặc kho. Khi mất quyền hay đổi phiên, bảo vệ từ Issue #57 vẫn giữ nguyên.

## Luồng chính

| Bước | Hành động | Kết quả |
|---|---|---|
| 1 | Mở `/admin/orders` hoặc link có điều kiện | Đọc tab/q/page qua một codec, chuẩn hóa URL bằng replace trước query |
| 2 | Submit tìm mã đơn/email hoặc đổi tab | Tìm qua API hiện có; đổi điều kiện về trang 1; tab giữ từ khóa đã áp dụng |
| 3 | Chuyển trang | Giữ tab và từ khóa đã áp dụng; draft chưa submit không tự thành bộ lọc |
| 4 | Vào chi tiết | Link `/admin/orders/:id` mang cùng query để mở tab mới/reload vẫn có ngữ cảnh |
| 5 | Bấm Danh sách đơn hoặc Back/Forward | URL, ô tìm, tab, dữ liệu cùng điều kiện; link quay về chỉ dựng đường nội bộ cố định |

## Quy tắc và ngoại lệ

- Tab chỉ nhận tập ORDER_TABS đang có; mặc định `attention`, q trim rồi giới hạn 254 ký tự theo API.
- Page nhận chữ số nguyên dương chuẩn, tối đa 100000 ở client; không nhận số mũ, Infinity, số lẻ,
  dấu, số 0 đầu hoặc tham số lặp. Đây là giới hạn điều hướng client, không đổi validation/chính sách API.
- Tham số lặp được coi như không có; tham số lạ bị bỏ. Canonical URL bỏ giá trị mặc định, thứ tự tab/q/page.
  Query key và request cùng lấy giá trị đã chuẩn hóa; pageSize vẫn cố định 20, không thêm điều khiển mới.
- Không dùng history state hay return URL tùy ý; link chi tiết và đường về giữ điều kiện trong query URL.
- Trang sau hết dữ liệu: hiện số trang đang mở và link về trang cuối hợp lệ; nếu tập rỗng thì về trang 1.
  Người dùng bấm link, không tự redirect theo total, tránh vòng lặp khi dữ liệu thay đổi.
- Query placeholder chỉ cùng actor/điều kiện và khác page, có aria-busy; không hiện tập cũ sau đổi tab/q.
  Chưa nhận response thật của trang mới thì không suy ra trang vượt từ placeholder.
- 401/403/400/404/409/422/mạng và POST giữ cơ chế xử lý hiện có, không tự retry 4xx hoặc POST.

## Tiêu chí chấp nhận đề xuất

Loại `(thuận|âm|biên)` do Bảo gắn thay ngày 06/11 theo [ADR-047](../../LOG.md#adr-047) để ma trận truy vết đếm được ca âm và ca biên; Tài xem lại. AC6 là tiêu chí quy trình, kiểm tay.

- [ ] **AC1** (âm) URL sai/lặp/lạ được replace về canonical trước request; API/cache không nhận page/q chưa chuẩn hóa.
- [ ] **AC2** (thuận) Tìm/tab/phân trang, reload và Back/Forward đồng bộ ô tìm với URL và kết quả; chỉ submit tìm kiếm.
- [ ] **AC3** (thuận) Vào chi tiết, mở tab mới hoặc reload chi tiết giữ tab/q/page khi quay lại; dữ liệu return tùy ý không thành link ngoài.
- [ ] **AC4** (biên) Trang sau rỗng có link phục hồi đúng điều kiện, không render pager có số trang vượt hoặc tự redirect vòng lặp.
- [ ] **AC5** (biên) Hồi quy AbortSignal, actor/epoch, response cũ, 403 liên phân hệ và mutation giữ nguyên; không đổi backend/tiền/kho.
- [ ] **AC6** (thuận, tay) Regression đỏ trước sửa rồi xanh, check/build/docs lint và browser desktop/mobile có minh chứng; review chéo trước merge.

## Truy vết và trạng thái

[order-list-query.ts](../../../apps/web/src/features/checkout/admin/order-list-query.ts) là codec;
[admin-order-navigation.test.tsx](../../../apps/web/src/features/checkout/admin/admin-order-navigation.test.tsx)
kiểm AC1–AC4; các bài session/race hiện có kiểm hợp đồng chung của AC5, giữ nguyên mã gốc.
README giữ trạng thái; lý do ở [ADR-043](../checkout/LOG.md#adr-043); kế hoạch/minh chứng và AI log ở kho docs.
API không đổi, Swagger vẫn là nguồn hình dạng HTTP. Duy cần thống nhất mã/AC với PR #26 trước nghiệm thu đặc tả.
