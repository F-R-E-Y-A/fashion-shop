---
title: Giỏ hàng — bản đồ
updated: 2026-10-01
status: đang làm
owner: Duy
---
# Giỏ hàng

**Chức năng:** Cửa vào duy nhất của feature Giỏ hàng: giải quyết việc gì, phạm vi, dữ liệu, API, giao diện, kiểm thử và trạng thái hôm nay.

| | |
|---|---|
| **Người sở hữu** | Phan Ngọc Duy · module `apps/api/src/modules/cart` · `apps/web/src/features/cart` · bảng `carts`, `cart_items` trong `prisma/schema/orders.prisma` |
| **Dòng việc** | **PH-02** (Issue #7, nhánh `feature/ph2-cart`), sprint S2 |
| **Use case** | UC-05.1 đến UC-05.5 trong [use-cases.md](use-cases.md) |

## Giải quyết việc gì

Cho phép khách vãng lai và khách hàng đã đăng nhập lưu trữ sản phẩm dự định mua, cập nhật số lượng, tạm tính tổng tiền chính xác và tự động hợp nhất giỏ hàng sau khi đăng nhập tài khoản.

## Phạm vi sprint S2

| Hạng mục | Use case / tiêu chí | Trạng thái |
|---|---|---|
| Xem giỏ hàng (khách vãng lai và thành viên) | UC-05.1 | Xong |
| Thêm sản phẩm vào giỏ hàng | UC-05.2 | Xong |
| Thay đổi số lượng, xóa từng sản phẩm | UC-05.3 | Xong |
| Xóa toàn bộ giỏ hàng | UC-05.4 | Xong |
| Hợp nhất giỏ hàng khách vào tài khoản khi đăng nhập | UC-05.5 | Xong |
| Giao diện trang giỏ hàng `CartPage` và `CartBadge` trên navbar | UC-05.1 | Xong |

## Dữ liệu

Bảng `carts` và `cart_items` trong `orders.prisma`:
- Khách vãng lai: định danh bằng `guest_token` (UUID).
- Khách hàng đã đăng nhập: liên kết trực tiếp bằng `user_id` (FK tới `users.id`).
- Ràng buộc: `(cart_id, product_variant_id)` là duy nhất; tổng tiền tính toán theo giá hiện thời của sản phẩm và biến thể.
- Quyết định bảo mật danh tính: [LOG#adr-023](LOG.md#adr-023).

## API

Đã triển khai đầy đủ và kiểm thử tự động, Swagger là nguồn kiểm chứng tại `/api/docs`:
- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:variantId`
- `DELETE /api/cart/items/:variantId`
- `DELETE /api/cart`
- `POST /api/cart/merge` (yêu cầu `AuthGuard`)

## Hợp đồng với phân hệ khác

- **Auth (`apps/api/src/modules/auth`)**: Tích hợp `AuthGuard` và `@CurrentUser()` để lấy danh tính an toàn từ JWT.
- **Products (`apps/api/src/modules/products`)**: Đọc dữ liệu biến thể (`product_variants`, `products`, `colors`, `sizes`) để tính giá và hiển thị thông tin sản phẩm trong giỏ.

## Giao diện

- Route: `/gio-hang` (`CartPage.tsx`).
- Điều hướng: Icon giỏ hàng `CartBadge` kèm huy hiệu số lượng trên thanh menu chính (`StoreLayout.tsx`).

## Kiểm thử và nghiệm thu

| Tiêu chí | Bài kiểm thử | Kết quả |
|---|---|---|
| Đầy đủ luồng giỏ hàng khách vãng lai | `apps/api/test/cart.http.spec.ts` | Đạt |
| Nhận diện người dùng qua JWT và bỏ qua header giả mạo | `apps/api/test/cart.http.spec.ts` | Đạt |
| Hợp nhất giỏ hàng với `AuthGuard` | `apps/api/test/cart.http.spec.ts` | Đạt |
| Giao diện giỏ hàng và đồng bộ Navbar | `apps/web/src/features/cart/` | Đạt |

## Trạng thái hôm nay (2026-10-01)

- Mã nguồn và kiểm thử hoàn tất ở PR #15 (`feature/ph2-cart`), commit `8487005`.
- Đã khắc phục triệt để lỗ hổng giả mạo `x-user-id`, kết nối đúng hợp đồng public của `AuthModule`.
