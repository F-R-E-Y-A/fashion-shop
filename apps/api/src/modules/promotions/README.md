# Promotions Module Contract

Module quản lý Khuyến mãi và Mã giảm giá (`apps/api/src/modules/promotions`).

## Các module khác được gọi hàm nào qua `PromotionsService`

| Hàm | Mục đích | Module gọi |
|---|---|---|
| `validateVoucher(code, subtotal, userId?)` | Kiểm tra tính hợp lệ và tính toán số tiền giảm | Cart, Checkout (báo giá) |
| `recordVoucherUsage(params, tx?)` | Ghi nhận bất biến lượt dùng voucher trong transaction tạo đơn | Checkout (`create`) |
| `releaseVoucherUsage(orderId, tx?)` | Giải phóng lượt dùng khi đơn hàng bị hủy | Checkout (khách huỷ, hết hạn, admin báo giao thất bại), Shipping (vận đơn `RETURNED`) |
| `getAvailableVouchers()` | Lấy danh sách voucher đang active | Storefront, Cart |
| `getActivePromotions()` | Lấy danh sách chiến dịch khuyến mãi | Catalog, Storefront |
