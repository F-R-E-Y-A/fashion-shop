# Users — hợp đồng địa chỉ cho checkout

Import `CheckoutAddressService` qua `index.ts`. `get(userId, addressId, transaction?)` chỉ trả địa chỉ thuộc user, commune và province còn hoạt động; không tồn tại/không thuộc chủ trả 404. Trả snapshot recipient/phone/detail/commune/province/postalCode cùng ID nguồn, không trả User hoặc thông tin auth. Không ghi dữ liệu khi gọi.

Caller lấy principal từ AuthGuard, không nhận userId từ body. Checkout sao chép snapshot vào Order; sửa/xoá địa chỉ sau đó không đổi đơn cũ. [Tài liệu](../../../../../docs/features/users/profile-address.md#ranh-giới-với-đặt-hàng).
