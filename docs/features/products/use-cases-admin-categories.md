---
title: UC-04.1 — quản lý danh mục sản phẩm quản trị (đọc và ẩn hiện)
updated: 2026-11-10
status: đề xuất, đang triển khai Issue79
owner: Tài
---
# UC-04.1 · Quản lý danh mục sản phẩm — đọc và ẩn hiện

**Chức năng:** Đặc tả quản lý danh mục trong trang quản trị: duyệt cây phân cấp, xem chi tiết và chuyển đổi trạng thái hiển thị ẩn/hiện an toàn với CAS.

Tiếp nối các use case khám phá catalog tại [use-cases.md](use-cases.md) và quyết định kiến trúc đề xuất [ADR-053](LOG.md#adr-053). Phạm vi thuộc Issue #79: chỉ đọc cây/chi tiết và thay đổi trạng thái hiển thị (`isActive`). Không tạo mới, không sửa tên/slug/cha/thứ tự, không xóa và không kéo thả.

## Luồng và quy tắc nghiệp vụ

- **Phân quyền và bảo mật**: Chỉ tài khoản có vai trò `ADMIN` mới được truy cập các endpoint quản trị. Kiểm tra quyền thực hiện trước validation schema. Mọi phản hồi admin trả header `Cache-Control: no-store` và chỉ trả các trường thuộc allowlist công bố.
- **Duyệt cây và chi tiết**: API admin trả về toàn bộ danh mục (bao gồm cả danh mục đang ẩn), duy trì cấu trúc phân cấp cha–con và thứ tự hiển thị `sortOrder` ổn định.
- **Số đếm sản phẩm**:
  - `productCount`: Tổng số sản phẩm gắn trực tiếp vào danh mục này (`categoryId = id`), bao gồm cả sản phẩm đang ẩn.
  - `subtreeProductCount`: Tổng số sản phẩm gắn vào danh mục này và tất cả các danh mục con trực thuộc nhánh.
  - Cả hai số đếm được tính toán trong cùng snapshot giao dịch mức cô lập `RepeatableRead` đồng thời với truy vấn danh mục để chống hiện tượng đọc lệch trạng thái.
- **Kiểm soát tương tranh lạc quan (CAS)**:
  - Yêu cầu cập nhật trạng thái `PATCH /api/admin/categories/:id/visibility` bắt buộc truyền `isActive` (boolean) và `expectedUpdatedAt` (chuỗi ISO 8601 có mili-giây, ví dụ `2026-11-10T08:00:00.000Z`).
  - Chuỗi `expectedUpdatedAt` phải đúng chuẩn regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` và có giá trị ngày hợp lệ; từ chối mọi chuỗi sai định dạng, timezone khác `Z`, hoặc ép kiểu lỏng lẻo bằng `400 Bad Request`.
  - Thực hiện khóa dòng `SELECT id, is_active, updated_at FROM categories WHERE id = $1 FOR UPDATE`.
  - **Kiểm tra CAS trước no-op**: Nếu `expectedUpdatedAt` không khớp với giá trị `updatedAt.toISOString()` hiện tại trong DB, hệ thống lập tức ném lỗi `409 ConflictException` ngay cả khi giá trị `isActive` gửi lên trùng với trạng thái hiện tại trong DB.
  - **No-op**: Nếu CAS hợp lệ và `isActive` gửi lên bằng đúng `category.isActive`, hệ thống không thực hiện câu lệnh UPDATE, không tăng timestamp, không phát sinh trigger catalog revision và trả về bản ghi hiện tại.
  - **Cập nhật đơn điệu**: Khi trạng thái thực sự thay đổi, câu lệnh UPDATE thiết lập `updated_at = GREATEST(NOW(), updated_at + INTERVAL '1 millisecond')` với điều kiện `WHERE id = $1 AND updated_at = $2::timestamptz`. Kiểm tra số dòng ảnh hưởng phải bằng 1; nếu bằng 0 trả về 409.
- **Ngữ nghĩa hiển thị phân cấp cha–con**:
  - Khi danh mục cha bị ẩn (`isActive = false`), toàn bộ nhánh con trở nên không hiển thị hiệu lực trên Storefront (`effectiveActive = false`, UI đánh dấu `parentHidden = true`), nhưng **không thay đổi cờ `isActive` của các danh mục con trong cơ sở dữ liệu**.
  - Khi bật lại danh mục cha, chỉ các danh mục con có cờ `isActive = true` mới hiển thị trở lại. Danh mục con đã bị ẩn độc lập trước đó vẫn tiếp tục ở trạng thái ẩn.
  - Khi người dùng bật cờ `isActive = true` cho một danh mục con trong khi danh mục cha vẫn đang ẩn: Hệ thống lưu trạng thái `isActive = true` vào cơ sở dữ liệu, nhưng giao diện thông báo rõ ràng rằng nhánh này vẫn chưa hiển thị hiệu lực trên Storefront do danh mục cha đang ẩn.
- **Tích hợp Storefront và Giỏ hàng**:
  - Storefront (menu, chi tiết, danh sách sản phẩm, tìm kiếm, gợi ý từ khóa, sản phẩm liên quan) loại bỏ triệt để các danh mục đang ẩn hoặc có danh mục cha đang ẩn.
  - Mapping dữ liệu sản phẩm cung cấp cho Cart/Checkout (`toVariantForCart`) kiểm tra tính hợp lệ của danh mục: `isCategoryActive = category.isActive && (!category.parent || category.parent.isActive)`. Nếu danh mục hoặc cha bị ẩn, biến thể bị đánh dấu `isActive = false` trong giỏ hàng, từ chối thêm mới hoặc thanh toán.
  - Các đơn hàng đã đặt thành công trong quá khứ giữ nguyên bản chụp snapshot dữ liệu, không tự ý hủy hay phát sinh hoàn tiền/ghi kho.
- **Bảo vệ Writer (Seed / Nhập liệu)**: Script seed không ghi đè `isActive: true` lên danh mục đã tồn tại trong DB, và chỉ cập nhật metadata khi có sự thay đổi thực sự để tránh làm tăng `updatedAt` và vô hiệu hóa token CAS của quản trị viên.

## Tiêu chí chấp nhận

- **AC1** (âm) Phân quyền và bảo mật: Chỉ ADMIN mới được truy cập API đọc/sửa danh mục; khách chưa đăng nhập nhận 401 Unauthorized, tài khoản CUSTOMER nhận 403 Forbidden; ID không đúng định dạng UUID nhận 400 Bad Request, ID không tồn tại nhận 404 Not Found; phản hồi luôn có header `Cache-Control: no-store` và chỉ gồm các trường trong allowlist.
- **AC2** (thuận) Đọc cây và chi tiết danh mục: API admin trả về danh mục cả active và inactive; giữ đúng quan hệ phân cấp cha–con và thứ tự sắp xếp; trả đúng `productCount` (sản phẩm gắn trực tiếp) và `subtreeProductCount` (tổng sản phẩm cả nhánh con) được truy vấn trong cùng một snapshot giao dịch mức RepeatableRead.
- **AC3** (biên) Kiểm soát tương tranh CAS và cập nhật đơn điệu: `expectedUpdatedAt` phải đúng chuẩn ISO 8601 mili-giây và ngày hợp lệ; khóa dòng FOR UPDATE; kiểm tra token CAS trước no-op (token lệch luôn trả 409 ConflictException kể cả mục tiêu trùng trạng thái hiện tại); khi trạng thái đổi, `updated_at` tăng đơn điệu `GREATEST(NOW(), updated_at + 1ms)` với `WHERE updated_at = token` và kiểm tra 1 dòng ảnh hưởng; no-op không UPDATE và không bump catalog revision; seed lặp không đổi metadata thì không đổi updatedAt.
- **AC4** (biên) Ngữ nghĩa hiển thị phân cấp cha–con: Ẩn danh mục cha làm toàn bộ nhánh con không hiển thị hiệu lực (`effectiveActive = false`, `parentHidden = true`) nhưng giữ nguyên cờ `isActive` của con trong DB; bật lại cha chỉ khôi phục các con có `isActive = true`; bật con khi cha đang ẩn lưu `isActive = true` vào DB và giao diện giải thích rõ nhánh vẫn chưa hiển thị do cha đang ẩn; không cập nhật đệ quy cờ DB.
- **AC5** (thuận) Tích hợp Storefront và Giỏ hàng: Public tree/detail, product list/search/suggest/related loại bỏ danh mục ẩn và danh mục có cha ẩn; biến thể sản phẩm trong Cart/Checkout phản ánh `isCategoryActive`, từ chối thêm mới hoặc thanh toán khi danh mục/cha bị ẩn; đơn hàng đã tạo giữ nguyên snapshot, không tự hủy hoặc phát sinh hoàn tiền/ghi kho.
- **AC6** (biên) Giao diện quản trị, an toàn bất đồng bộ và khả năng tiếp cận: Giao diện cây và chi tiết bằng tiếng Việt dùng token hệ thống (Espresso/Ivory/Copper); ConfirmDialog nêu rõ tên danh mục và tác động nhánh; phản hồi 409 tải lại dữ liệu mới và yêu cầu xác nhận lại; xử lý 403 thu hồi quyền (mất quyền trong refetch sau mutation chặn notice thành công tiếp theo); lỗi chưa rõ kết quả (500, network error, timeout) lưu marker theo actor/epoch trong cache phiên, khóa nút thao tác và cung cấp nút đối chiếu lại trạng thái trước khi cho phép gửi mutation mới; query cây và chi tiết dùng shouldRetryAdminQuery không retry tự động trên 400/401/403/404/422; vô hiệu hóa thao tác khi đang gửi (pending guard); đáp ứng chuẩn responsive từ 1280px đến 360px, hỗ trợ prefers-reduced-motion, phím Tab, Escape và trả focus chuẩn WAI-ARIA.
- **AC7** (biên, tay) Kiểm định độc lập và minh chứng: Chạy đầy đủ bộ kiểm thử tự động (unit, HTTP, web, E2E) trên môi trường cô lập cổng 55479/6399; không sửa đổi schema migration; đối chiếu diff sạch không đụng chạm bảng ngoài phạm vi. Kịch bản kiểm thử thủ công: Quản trị viên đăng nhập, mở /admin/categories trên trình duyệt thật (Chrome/Firefox), duyệt cây, ẩn danh mục cha và kiểm tra trên tab ẩn danh của cửa hàng (menu, search, danh sách sản phẩm) đã ẩn nhánh; bật lại danh mục và đối chiếu nhánh hiển thị lại; kiểm tra responsive trên thiết bị thực 360px và phím Tab/Escape trên ConfirmDialog. Lưu ý: kiểm định zoom 200% vật lý trên trình duyệt thật được ghi nhận chưa kiểm chứng tự động và cần thực hiện thủ công trong buổi nghiệm thu.

## Mở rộng Đợt 1 Quản trị danh mục (Issue #120)

- **Tạo danh mục (`POST /api/admin/categories`)**:
  - Bắt buộc `id` (UUID v4 do client sinh) để bảo đảm idempotency; mặc định `isActive = false` (ẩn khi mới tạo).
  - Hỗ trợ `name`, `slug` (tự sinh từ `name` nếu bỏ trống), `parentId` (nullable), `sortOrder` (`0..2147483647`).
  - Xử lý unique violation (`P2002` / `23505`) bên ngoài transaction đã thất bại: nếu `id` đã tồn tại với cùng payload chuẩn hóa thì trả lại bản ghi idempotent; nếu khác payload hoặc trùng `slug` ở UUID khác thì trả `409`.
- **Sửa thông tin & đổi cha (`PATCH /api/admin/categories/:id`)**:
  - Cho phép sửa `name`, `parentId`, `sortOrder` với `expectedUpdatedAt` (CAS kiểm trước no-op); `slug` bất biến sau tạo.
  - Bổ sung `adminManagedFields` (`String[] @default([])`) qua migration `20261114110000_ph03_admin_category_managed_fields` để bảo vệ các trường admin đã sửa khỏi bị `seedCatalog` ghi đè.
- **Ràng buộc cây hai cấp & sản phẩm trực tiếp**:
  - Chặn tự làm cha (`422`), chặn chuyển danh mục đang có con thành danh mục con (`422`), chặn gắn cha là danh mục cấp 2 (`422`), và chặn thêm/chuyển con vào danh mục đang có sản phẩm trực tiếp (`422`).
- **Giao thức khóa dùng chung & retry**:
  - Admin `POST`/`PATCH`, `importOne`, và `seedCatalog` khóa hàng `Category` theo thứ tự UUID tăng dần (`ORDER BY id ASC FOR UPDATE`) trong `ReadCommitted`, đọc lại sau khóa và retry toàn bộ transaction tối đa 3 lần khi gặp `P2034`, `40P01`, `40001` hoặc `CategoryLockSetChangedError`.
- **UI Tạo & Sửa (`/admin/categories/new`, `/admin/categories/:id`)**:
  - Lưu trạng thái `uncertainCreate` (UUID + payload) và `uncertainEdit` trong TanStack Query cache qua điều hướng; khi `GET` đối chiếu trả `404`, giữ nguyên marker và chỉ cho phép gửi lại bằng đúng UUID + payload cũ.
  - Khi `PATCH` trả `409`, giữ nguyên bản nháp đang sửa và cung cấp nút tải lại dữ liệu mới nhất trên máy chủ.
  - Draft, token CAS, conflict và notice thuộc actor/epoch/categoryId; đổi danh mục hoặc phiên khởi tạo form mới. Phản hồi của form cũ chỉ được đối chiếu đúng operation/marker, không sửa form đang xem.
  - POST/PATCH và GET đối chiếu truyền AbortSignal, hết hạn sau 15 giây. Mutation hết hạn giữ payload trong marker chưa rõ kết quả; phản hồi muộn sau timeout không xóa marker hoặc báo thành công.
