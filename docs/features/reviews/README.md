---
title: Đánh giá sản phẩm — Đợt 1 (Issue #96)
updated: 2026-11-12
status: đề xuất triển khai Đợt 1 — chờ Duy/Bảo review trước merge
owner: Tài
---
# Đánh giá sản phẩm (Product Reviews)

**Chức năng:** Đặc tả phân hệ đánh giá sản phẩm Đợt 1 (Issue #96): khách hàng gửi đánh giá cho dòng hàng đã giao và xem danh sách đánh giá đã duyệt ngoài trang chi tiết sản phẩm.

## 1. Ranh giới kiến trúc & Nguyên tắc sở hữu dữ liệu

- **Bảng dữ liệu:** Bảng `reviews` thuộc `identity.prisma` (Tài sở hữu). Đợt 1 không tạo migration mới, sử dụng cấu trúc sẵn có.
- **Ranh giới module:**
  - `ReviewsModule` chỉ đọc trạng thái đơn/dòng hàng qua helper chỉ đọc `OrdersService.getReviewEligibility` và `OrdersService.getOrderItemReviewEligibility` ([orders.service.ts](../../../apps/api/src/modules/orders/orders.service.ts)). Tuyệt đối không can thiệp trạng thái đơn hàng, kho hay thanh toán.
  - Trạng thái hiển thị sản phẩm ngoài storefront kiểm tra qua `ProductsService.findBySlug` ([products.service.ts](../../../apps/api/src/modules/products/products.service.ts)). Nếu sản phẩm bị ẩn hoặc vô hiệu hóa, endpoint public trả về 404.
  - Khách hàng đã mua sản phẩm ngừng bán/ẩn vẫn gửi đánh giá riêng tư được trong trang chi tiết đơn hàng (giữ quyền lợi phản hồi của người mua), nhưng danh sách public giữ 404.

## 2. API Đặc tả

### Private API (Khách hàng)

- `GET /api/orders/:orderId/reviews`: Lấy context đánh giá cho toàn bộ dòng hàng của đơn hàng.
  - Bảo vệ bởi `AuthGuard`.
  - Chống IDOR: Chỉ chủ sở hữu đơn hàng (`userId` từ JWT) mới có quyền truy cập, khác chủ sở hữu trả 404.
  - Điều kiện `eligible`: Đơn hàng phải có trạng thái `DELIVERED` trong lịch sử `OrderStatusHistory` (đề xuất: đơn đã từng giao thành công, dù sau đó có hoàn tiền một phần, vẫn đủ điều kiện đánh giá).
- `POST /api/reviews`: Gửi đánh giá cho một dòng hàng (`orderItemId`).
  - Body: `{ orderItemId: string, rating: number (1..5), content?: string | null (tối đa 2000 ký tự) }`.
  - Idempotency & Concurrency: Trùng `orderItemId` với cùng điểm sao và nội dung chuẩn hóa trả lại đánh giá đã commit; khác nội dung/sao trả 409 Conflict. Xử lý race condition qua mã lỗi Prisma `P2002`.
  - Đánh giá mới tạo luôn mang trạng thái `moderationStatus = PENDING`.

### Public API (Khách vãng lai & Storefront)

- `GET /api/products/:slug/reviews`: Lấy danh sách đánh giá đã duyệt của sản phẩm.
  - Phân trang: `page` (mặc định 1), `pageSize` (mặc định 12, tối đa 60).
  - Lọc nghiêm ngặt: Chỉ trả về bản ghi có `moderationStatus: APPROVED` và `deletedAt: null`.
  - Allowlist bảo mật: Chỉ trả về `id`, `rating`, `content`, `createdAt`. Tuyệt đối không để lộ `userId`, tên khách hàng, avatar, `orderItemId` hay thông tin kiểm duyệt của admin.
  - Cache: Header `Cache-Control: no-store` để tránh rò rỉ dữ liệu hoặc cache nhầm phiên.

## 3. Giao diện (Web)

- **Trang đơn hàng (`OrderPage`):** Tích hợp `OrderReviewItem` cho từng dòng hàng khi đơn đã giao. Hỗ trợ nhập 1..5 sao bằng bàn phím/chuột, đếm ký tự 0/2000, trạng thái khóa khi đang gửi (pending lock), và hiển thị huy hiệu "Đang chờ duyệt".
- **Trang chi tiết sản phẩm (`ProductDetailPage`):** Tích hợp `ProductReviewsSection` hiển thị danh sách đánh giá đã duyệt, huy hiệu đếm tổng số đánh giá, trạng thái trống thân thiện và phân trang bằng component `Pager`.
- Responsive: Kiểm thử đầy đủ trên cả desktop (1280px) và mobile (360px).
