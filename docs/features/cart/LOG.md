---
title: Nhật ký quyết định Giỏ hàng
updated: 2026-10-01
status: đang dùng
owner: Duy
---
# Nhật ký quyết định Giỏ hàng

**Chức năng:** Nhật ký ghi lại các quyết định kỹ thuật và thay đổi kiến trúc của phân hệ Giỏ hàng (PH-02).

<a id="adr-023"></a>
## 2026-10-01 · ADR-023 — Dùng OptionalAuthGuard và trích xuất danh tính từ JWT thay vì header x-user-id

**Loại:** quyết định · **Phạm vi:** `apps/api/src/modules/cart`, `apps/web/src/features/cart` · **Trạng thái:** đề xuất · **Người quyết:** Phan Ngọc Duy, Nguyễn Tấn Tài · **Commit:** [8487005](https://github.com/F-R-E-Y-A/fashion-shop/commit/8487005)

### Hiện trạng
Ban đầu khi Auth chưa hoàn thiện, Cart tạm thời nhận diện người dùng đã đăng nhập bằng header `x-user-id` gửi từ `localStorage` phía client. Khi Auth đã hoàn thành và gộp vào `develop`, cơ chế này bộc lộ lỗ hổng bảo mật nghiêm trọng: client có thể tùy tiện thay đổi UUID trong header và đọc/sửa giỏ hàng của tài khoản khác.

### Phương án

| Phương án | Được gì | Mất gì | Đảo ngược được không |
|---|---|---|---|
| A. Tiếp tục dùng `x-user-id` kèm chữ ký tạm | Không cần sửa giao diện | Không an toàn, tạo nợ kỹ thuật lớn | Khó |
| **B. Dùng OptionalAuthGuard + @CurrentUser() (chọn)** | An toàn tuyệt đối, dùng đúng hợp đồng public chuẩn của AuthModule, tự động phân luồng khách vãng lai và thành viên | Cần cấu hình guard phụ trợ ở CartModule | Dễ |
| Không làm gì | Tiết kiệm thời gian | Lỗ hổng bảo mật nghiêm trọng trên môi trường production | Không |

**Chọn B** vì giải quyết triệt để rủi ro bảo mật ID spoofing, tuân thủ đúng hợp đồng `AuthGuard` và decorator `@CurrentUser()` do Auth công bố, đồng thời giữ nguyên luồng `x-guest-token` cho khách vãng lai.

### Kết quả mong đợi → thực tế
- Mong đợi: Mọi cart route của user đăng nhập lấy `user.id` từ JWT token; nếu cố tình truyền `x-user-id` lạ sẽ bị lờ đi hoàn toàn; endpoint `POST /cart/merge` bắt buộc qua `AuthGuard`.
- Thực tế: Đã kiểm chứng qua bài test `apps/api/test/cart.http.spec.ts` (100% xanh) ở commit `8487005`.

### Điều kiện xem lại
Khi hệ thống chuyển đổi cơ chế quản lý phiên hoặc hợp nhất giỏ hàng tại cấp Gateway/BFF.
