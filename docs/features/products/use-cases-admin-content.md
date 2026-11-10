---
title: UC-04.2 — sửa nội dung sản phẩm quản trị
updated: 2026-11-10
status: đề xuất, đang triển khai Issue77
owner: Tài
---
# UC-04.2 · Quản lý thông tin sản phẩm — sửa nội dung

**Chức năng:** Đặc tả AC19–28 của lát chỉnh sửa bốn trường và bảo vệ nội dung admin qua import.

Tiếp nối AC1–18 ở [use-cases.md](use-cases.md). Tài xác nhận làm API/web/test/docs tới PR,
ủy quyền khuyến nghị chính sách import; chọn giữ từng trường admin đã thay đổi, các trường khác theo nguồn.
Không coi việc triển khai là tự chốt ADR hoặc được owner nghiệp vụ review.

## Luồng và luật

ADMIN mở chi tiết, chọn Sửa nội dung, đổi tên/mô tả/chất liệu/bảo quản rồi Lưu. Modal giữ snapshot/version
lúc mở; GET nền không đè bản đang gõ. Trường có thay đổi hiệu lực được bảo vệ qua import, kể cả đổi về null.
Tên1–200, mô tả nullable≤20000, chất liệu nullable≤500, bảo quản nullable≤5000; trim và trắng→null cho trường tùy chọn.
Body đủ bốn trường + version dự kiến; unknown/trùng loại sai/thiếu bị từ chối, server vẫn kiểm ADMIN.
409 giữ draft, cần chủ động tải bản mới trước lưu; lỗi mạng/timeout/5xx báo chưa rõ, không gửi lại tự động.
Import/admin khóa cùng hàng; contentVersion riêng với statusVersion. Version tăng khi nội dung hiệu lực đổi,
không tăng khi import chỉ thay giá/ảnh hoặc nội dung đã được bảo vệ. No-op không đánh dấu thêm trường.
Không gỡ bảo vệ từng trường trong MVP; thao tác này cần use case/Issue sau. Không đổi slug/SKU/giá/kho/đơn cũ.

## Tiêu chí chấp nhận

- **AC19** (âm) ADMIN trước validation; guest401/CUSTOMER403; UUID/body sai400, thiếu404; phản hồi allowlist/no-store, Swagger đủ.
- **AC20** (thuận) Lưu chuẩn hóa đúng4trường, nullable và giới hạn; chỉ trường thay đổi được bảo vệ; detail phản ánh version/fields, dữ liệu công khai cập nhật.
- **AC21** (biên) CAS phát hiện cùng version/ABA; no-op giữ version/updatedAt/bảo vệ/revision; một version chỉ một thay đổi thành công.
- **AC22** (biên) Import/admin khóa cùng hàng, đọc lại sau khóa; import hai thứ tự không đè trường đã sửa, trường khác tiếp tục theo nguồn; import đổi nội dung tăng version, lặp không tăng.
- **AC23** (âm) Payload không đổi slug/SKU/giá/status/hold/ảnh/kho/đơn, không lộ thuộc tính ngoài DTO; migration version0/fields[] giữ giá trị cũ; không áp DB dev.
- **AC24** (thuận) Modal dùng token/tiếng Việt, nhãn/hạn ký tự, hủy không PATCH, lưu có feedback/focus; mở/đóng giữ query và vị trí về danh sách.
- **AC25** (biên) Chặn bấm lặp/Enter;409 giữ draft và tải mới rõ ràng; lỗi4xx không retry, timeout/5xx/network phải GET đối chiếu trước lưu mới, marker giữ qua điều hướng.
- **AC26** (biên) Actor/epoch/AbortSignal/accessgeneration; logout/A→B/A→A/403 dọn cache và chặn response muộn/notice/invalidate; GET cũ không đè mutation và mutation version cũ không đè GET mới.
- **AC27** (biên) Nội dung/trạng thái chỉ cập nhật các trường thuộc mutation của mình; response status muộn không ghi đè tên mới; cache danh sách/total/filter/sort lấy lại từ API.
- **AC28** (biên, tay) Chromium1280×800/360px, bàn phím/focus, reduced-motion và zoom200% thật có kịch bản/ảnh; check/build/docs lint/HTTP/E2E/CI đúng head và review trước merge.

## Kịch bản tay AC28

Dùng fixture tổng hợp với API thật trên DB/Redis test riêng, ghi commit. Tab tới Sửa nội dung, nhập tiếng Việt,
hủy bằng Escape và kiểm focus; mở lại/lưu, thử offline và phục hồi GET. Kiểm360px/desktop, reduced-motion thật.
Phóng200% bằng trình duyệt, đọc đủ trường/nút và không mất thao tác; không dùng CSS zoom hoặc viewport thay thế.
Giữ mục chưa làm là chưa kiểm; Ready chỉ mở review, không thay nghiệm thu/CI hoặc tự merge.
