---
title: Giỏ hàng — bản đồ PH-02
updated: 2026-10-04
status: đã tích hợp, tiếp tục nghiệm thu
owner: Duy
---
# Giỏ hàng

**Chức năng:** Trạng thái PH-02, ranh giới với xác thực và sản phẩm, nơi đọc API, giao diện và phần cần nghiệm thu.

| Mục | Hiện trạng |
|---|---|
| Người sở hữu | Duy; `apps/api/src/modules/cart`, `apps/web/src/features/cart`, bảng trong `orders.prisma` |
| Dòng việc | PH-02, [PR #15](https://github.com/F-R-E-Y-A/fashion-shop/pull/15), đã gộp ngày 02/10 |
| Commit tích hợp hiện tại | `262ac81` trong lịch sử `develop`; GitHub PR còn ghi merge SHA cũ `ff22f9e` trước đợt sửa lịch sử |
| Đặc tả | Chuẩn hoá HT-04 tại [PR #26](https://github.com/F-R-E-Y-A/fashion-shop/pull/26), chưa gộp ngày 04/10 |

## Đã cài trong mã

Controller giỏ hỗ trợ đọc giỏ, thêm dòng, sửa số lượng, xoá dòng, xoá toàn giỏ và gộp giỏ khách vào tài khoản (`apps/api/src/modules/cart/cart.controller.ts:31`, `:39`, `:48`, `:58`, `:67`, `:76`). Hình dạng thật xem Swagger `/api/docs`, không chép schema phản hồi vào tài liệu.

Người đăng nhập lấy principal từ `CurrentUser`; khách vãng lai dùng `x-guest-token`. Client không tự truyền `user_id` để nhận diện người đăng nhập (`cart.controller.ts:14`, `:27`, `:33`). Route `/gio-hang` đã nối vào app (`apps/web/src/app/routes.tsx:48`).

## Phối hợp và nghiệm thu

- Xác thực qua cửa `auth/index.ts`; sản phẩm công bố hợp đồng biến thể ở [README module products](../../../apps/api/src/modules/products/README.md).
- Giỏ hàng và [tồn kho](../inventory/README.md) là hai nghiệp vụ khác nhau; tồn kho chưa có hàm đọc để Catalog lọc cỡ theo số lượng còn.
- Tiếp tục kiểm luồng đăng nhập → gộp giỏ → thay số lượng/xoá, chuẩn bị hợp đồng với checkout. Đây là kế hoạch nghiệm thu, không khẳng định kiểm tay toàn bộ đã hoàn tất.

Lịch sử đối chiếu ở [LOG.md](LOG.md).
