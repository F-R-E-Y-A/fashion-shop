---
title: Chiến lược kiểm thử
updated: 2026-09-26
status: đã điền
owner: Duy
---
# Chiến lược kiểm thử

**Chức năng:** Mức nào thì gọi là đã kiểm thử đủ: tầng kiểm thử, độ phủ, phần bắt buộc có test, quy trình xử lý lỗi, dữ liệu kiểm thử.

> **Tài liệu này do Phan Ngọc Duy điền trong HT-04 (Sprint 1), 14–20/09/2026.**
> Cách chạy và khuôn bài kiểm thử ở [testing.md](testing.md).

---

## Tầng kiểm thử

| Tầng | Kiểm cái gì | Công cụ | Ai viết | Chạy lúc nào |
|---|---|---|---|---|
| **Đơn vị** (Unit) | Logic hàm thuần túy: tính giá, validate dữ liệu, BR nghiệp vụ, helper | **Vitest** | Người sở hữu phân hệ | Mỗi pull request (pre-commit + CI) |
| **Tích hợp** (Integration) | API endpoint + DB thật (Postgres test container): request → response → side effects | **Vitest** + **Supertest** + **testcontainers** | Người sở hữu phân hệ | Mỗi pull request (CI) |
| **Đầu cuối** (E2E) | Luồng người dùng hoàn chỉnh qua giao diện trình duyệt | **Playwright** | Phan Ngọc Duy | Khi gộp vào `develop`; hằng đêm (nightly) |
| **Tải và đồng thời** (Load) | Chịu tải cao và race condition: bán vượt kho, thanh toán đồng thời | **k6** | Phan Ngọc Duy | Sprint 4, chạy trên môi trường staging |

---

## Độ phủ mong muốn

| Phân hệ / Tầng | Ngưỡng line coverage | Ghi chú |
|---|---|---|
| **Đơn vị** (toàn dự án) | ≥ 80% | Đo bằng Vitest `--coverage`; báo cáo trong CI |
| **Tích hợp** | Mỗi API endpoint cần ≥ 1 happy path + ≥ 1 sad path | Không dùng con số %, dùng checklist |
| **E2E** | Toàn bộ luồng trong phần "Tiêu chí chấp nhận" của sprint 2 | Xem danh sách bên dưới |
| **Tải** | P95 latency ≤ 200ms tại 200 req/s; error rate < 0.1% | Môi trường staging, 5 phút |

### Phần bắt buộc có kiểm thử dù độ phủ thế nào

| Mã | Nội dung bắt buộc |
|---|---|
| T-M1 | Trừ tồn kho khi đặt hàng — phòng bán vượt kho |
| T-M2 | Xác nhận thanh toán webhook — đảm bảo idempotent, không sinh đơn trùng |
| T-M3 | Hoàn tiền — không gọi cổng thanh toán quá một lần cùng `order_id` |
| T-M4 | Mã hoá / hash mật khẩu — không lưu plaintext |
| T-M5 | Phân quyền API `/api/admin/*` — khách hàng / anonymous phải nhận 403 |

---

## Ba bài toán khó phải có kiểm thử riêng

1. **Chống bán vượt kho** (T-M1): Dùng `SELECT FOR UPDATE` và test với 50 request đồng thời cùng mua 1 SKU còn đúng 1 sản phẩm — chỉ 1 đơn thành công.

2. **Thông báo thanh toán lặp** (T-M2): Gửi webhook thanh toán 3 lần cùng `payment_id` — chỉ 1 đơn hàng được tạo / cập nhật trạng thái.

3. **Hoàn tiền trùng** (T-M3): Gọi API hoàn tiền 2 lần cùng `order_id` — cổng thanh toán chỉ được gọi đúng 1 lần, lần 2 trả 409 `refund_already_processed`.

---

## Quy trình xử lý lỗi

| Nguồn | Hành động |
|---|---|
| CI thất bại trên PR | Bot GitHub comment "❌ Tests failed"; không merge được |
| Reviewer tìm thấy | Comment trực tiếp trên dòng code |
| Tự phát hiện | Tự mở issue trước khi push |

- Label: `bug` + nhãn phân hệ + mức độ: `severity: critical` / `severity: major` / `severity: minor`
- Người sở hữu phân hệ tạo nhánh `fix/ph-xx-ten-loi`, viết test fail trước rồi fix (TDD)
- `critical` cần fix trong cùng ngày; `major` trong cùng sprint

---

## Dữ liệu cho kiểm thử

| Tầng | Nguồn dữ liệu |
|---|---|
| Đơn vị | Dữ liệu inline trong test (fixtures / builder) |
| Tích hợp | `apps/api/prisma/seed/` — chạy trước mỗi suite, rollback sau |
| E2E | Tập seed mở rộng: ≥ 5 sản phẩm, ≥ 2 user (customer + staff), ≥ 1 đơn hàng mẫu |
| Tải (k6) | Script tự tạo đơn hàng ảo trong thời gian chạy; không dùng production data |

> **Không dùng dữ liệu thật của khách hàng trong bất kỳ môi trường kiểm thử nào.**

---

## Danh sách luồng E2E (sprint 2)

| # | Luồng | Phân hệ | Người viết |
|---|---|---|---|
| E2E-01 | Đăng ký → Đăng nhập → Cập nhật thông tin | PH-01 | Duy |
| E2E-02 | Đặt lại mật khẩu qua email | PH-01 | Duy |
| E2E-03 | Duyệt danh mục → Lọc màu/size → Xem chi tiết | PH-03 | Duy |
| E2E-04 | Tìm kiếm từ khoá → Xem kết quả | PH-03 | Duy |
| E2E-05 | Nhập hàng SKU → Kiểm tra tồn kho cập nhật | PH-13 | Duy |
| E2E-06 | Điều chỉnh tồn kho → Xem lịch sử biến động | PH-13 | Duy |
