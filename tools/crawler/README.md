# HT-03 raw product collector

Collector này lấy dữ liệu sản phẩm công khai từ YODY cho Issue #5. Nó chỉ tạo bằng chứng
JSONL cục bộ; không ghi PostgreSQL và không gọi Catalog import.

## Chạy

Yêu cầu Node.js 24 trở lên. Từ thư mục gốc repository:

```bash
npm run crawler -- --source yody --limit 5
```

Mặc định `--limit` là 10. Mỗi lần chạy mới tạo một thư mục timestamp trong:

```text
tools/crawler/output/ht-03/<run-id>/
```

Có thể chọn thư mục rõ ràng:

```bash
npm run crawler -- --source yody --limit 5 --output tools/crawler/output/ht-03/review-01
```

Tiếp tục cùng output mà không fetch lại URL đã thành công:

```bash
npm run crawler -- --source yody --limit 5 \
  --output tools/crawler/output/ht-03/review-01 --resume
```

Thêm `--force` cùng `--resume` khi thực sự cần fetch lại item thành công. Raw identity vẫn là
`YODY + sourceProductId`; file raw không tạo hai dòng cho cùng identity.

Chuẩn hóa một run đã review sang M2 contract v2, không dùng network hoặc database:

```bash
npm run crawler:normalize -- \
  --input tools/crawler/output/ht-03/review-20260925
```

## Discovery và parsing

- Discovery dùng `https://yody.vn/sitemap_products_1.xml`.
- URL được canonicalize, bỏ query/fragment và dedupe theo thứ tự sitemap.
- Detail parser chỉ đọc structured payload `self.PDPData` trong server HTML.
- `product` trong raw envelope giữ nguyên toàn bộ PDPData, kể cả field chưa sử dụng.
- SHA-256 được tính từ canonical serialization của source-native `product`, không phải URL.

## Output

| File | Nội dung |
|---|---|
| `raw-products.jsonl` | Một raw envelope cho mỗi source product identity |
| `manifest.jsonl` | Pending/result, attempts, HTTP status, latency và checksum |
| `failures.jsonl` | Lỗi có cấu trúc, không chứa cookie/header |
| `run-summary.json` | Tổng số discovery/request/success/failure/duplicate |
| `normalized-candidates.jsonl` | Candidate contract v2, status và validation messages |
| `normalization-summary.json` | Tổng trạng thái cùng issue/warning counts |

`tools/crawler/output/` đã được Git ignore. Giữ output cục bộ cho kiểm tra trước khi chạy bộ lớn.

## Chính sách an toàn

- Concurrency 1; delay ngẫu nhiên 2–3 giây giữa product requests.
- Timeout 15 giây; tối đa hai retry cho timeout/network, 408, 429 và 5xx.
- Backoff 5 giây rồi 15 giây, có jitter; tôn trọng `Retry-After`.
- 403 hoặc active challenge dừng run; không bypass CAPTCHA/Cloudflare.
- User-Agent khai rõ project nghiên cứu, không giả trình duyệt.
- Không login, không dùng cookie/session và không thu thập user/order/reviewer/PII.

## Kiểm thử

```bash
npm run test -w @fashion-shop/crawler
npm run typecheck -w @fashion-shop/crawler
```

Tests dùng fixture local, không phụ thuộc YODY live.

Normalizer chỉ map vào leaf category M2 đã duyệt, giữ brand `null` khi payload không có brand
đáng tin cậy, không tự gán size `FREE` hay color `mac-dinh`. Giá và SKU được chuẩn hóa dạng chuỗi
deterministic. Unknown category/size, missing source data, invalid price và variant conflict được
giữ lại dưới trạng thái `PENDING_REVIEW`.

## Giới hạn hiện tại

- Chưa chạy collection 300–500 sản phẩm.
- Chưa ghi `staging.raw_product_records`.
- Chưa ghi candidate contract v2 vào PostgreSQL.
- `ProductsService.importProducts()` chưa được triển khai, nên collector không ghi Catalog.
