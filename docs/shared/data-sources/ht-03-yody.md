---
title: Nguồn dữ liệu YODY cho HT-03
updated: 2026-09-25
status: đề xuất
owner: Tài
---
# Nguồn dữ liệu YODY cho HT-03

**Chức năng:** Ghi nguồn, chính sách thu thập và chất lượng dataset YODY của HT-03.

## Nguồn và mục đích

- Nguồn công khai: [YODY](https://yody.vn/).
- Discovery: `https://yody.vn/sitemap_products_1.xml`.
- Detail URL lấy từ sitemap; parser chỉ đọc structured payload `self.PDPData` trong HTML công khai.
- Ngày collection: 25/09/2026.
- Dữ liệu phục vụ đề tài học thuật/nghiên cứu Website thương mại điện tử thời trang.
- Dự án không tuyên bố liên kết, tài trợ hay quan hệ đối tác với YODY.

Collector không đăng nhập, không dùng cookie/session, không bypass CAPTCHA/Cloudflare và không thu
thập user, order, reviewer hay dữ liệu định danh cá nhân. Raw identity là
`YODY + String(PDPData.id)`, không phải URL.

## Chính sách collection

- Concurrency 1, delay ngẫu nhiên 2–3 giây giữa product request.
- Timeout 15 giây; tối đa hai retry cho network/timeout, HTTP 408, 429 và 5xx.
- Backoff 5 giây rồi 15 giây, có jitter và tôn trọng `Retry-After`.
- HTTP 403, active challenge hoặc CAPTCHA dừng run; không tìm cách vượt qua.
- User-Agent khai rõ crawler nghiên cứu của dự án.
- Checkpoint JSONL cho phép resume mà không gọi lại request đã thành công.

Mã thực thi: [crawler README](../../../tools/crawler/README.md),
[collector CLI](../../../tools/crawler/src/cli.ts) và
[YODY adapter](../../../tools/crawler/src/sources/yody/yody-source-adapter.ts).

## Hợp đồng normalization và baseline

Normalized contract hiện là version 2. Business scope nằm tại
[scope policy](../../../tools/crawler/src/scope/scope-policy.ts), tách khỏi YODY parser để adapter
nguồn khác có thể tái sử dụng.

Baseline category leaf:

`ao-thun`, `ao-so-mi`, `ao-khoac`, `quan-dai`, `quan-short`, `mu`, `that-lung`.

Baseline size:

`XS`, `S`, `M`, `L`, `XL`, `29`, `30`, `31`, `32`, `FREE`.

Phân loại scope:

- `IN_SCOPE`: category và mọi size thuộc baseline.
- `OUT_OF_SCOPE`: dữ liệu đã hiểu nhưng Catalog baseline chưa hỗ trợ.
- `REVIEW_REQUIRED`: category/size mới hoặc mơ hồ chưa đủ bằng chứng để phân loại.

Scope reason được giữ trong `attributes.scope`. Business scope không được trộn với lỗi kỹ thuật.
Out-of-scope raw data vẫn được lưu đầy đủ để nghiên cứu và re-normalize sau này.

Metric acceptance riêng của Issue #5, `minimumValidProduct`, yêu cầu đồng thời: product name không
rỗng, source category có name hoặc slug dùng được làm evidence, và có ít nhất một effective variant
price dương hợp lệ. Metric này không đồng nghĩa với `APPROVED`; candidate ngoài Catalog scope vẫn có
thể đạt minimum fields.

## Kết quả collection và top-up

Lệnh:

```bash
npm run crawler -- --source yody --limit 315 \
  --output tools/crawler/output/ht-03/bulk-20260925-300 --resume
```

Kết quả:

| Chỉ số | Giá trị |
|---|---:|
| Discovered/requested | 315 / 315 |
| Raw unique thành công | 314 |
| Failed | 1 |
| Duplicate | 0 |
| Parse success rate | 99.68% |

Baseline trước top-up có 299 raw unique và 297 minimum-valid. Resume checkpoint skip 299 URL thành
công, retry failure cũ và thu thêm 15 URL mới; kết quả cuối có 314 raw unique. Failure logic duy nhất
là HTTP 200 nhưng trang không chứa `self.PDPData` cho URL
`/product/ao-polo-the-thao-nu-airycool-phoi-nep`. Run không gặp 403/challenge.

## Issue #5 minimum dataset acceptance

| Nhóm dữ liệu | Số lượng | Ý nghĩa |
|---|---:|---|
| Raw products collected | 314 | Raw unique giữ đủ provenance và source-native `PDPData` |
| Minimum-valid products | 312 | Có name + source category + positive effective price |
| Catalog-scope `APPROVED` | 90 | In-scope và không có technical issue |
| `PENDING_REVIEW` | 224 | Bao gồm out-of-scope, review-required hoặc technical issue |

Minimum-valid rate là 99.36%: missing name `0`, missing source category `0`, missing valid positive
price `2`. Hai record thiếu giá vẫn được giữ trong raw/staging, không sửa hay bịa dữ liệu nguồn.

## Chất lượng normalization

| Trạng thái | Số lượng | Tỉ lệ |
|---|---:|---:|
| `APPROVED` | 90 | 28.66% |
| `PENDING_REVIEW` | 224 | 71.34% |
| `DUPLICATE` | 0 | 0% |
| `REJECTED` | 0 | 0% |

| Scope | Số lượng | Tỉ lệ |
|---|---:|---:|
| `IN_SCOPE` | 106 | 33.76% |
| `OUT_OF_SCOPE` | 160 | 50.96% |
| `REVIEW_REQUIRED` | 48 | 15.29% |

Scope reason counts: `OUT_OF_SCOPE_SIZE=242`, `OUT_OF_SCOPE_CATEGORY=38`,
`UNKNOWN_SIZE=57`, `UNKNOWN_CATEGORY=63`. Một candidate có thể có nhiều reason theo các giá trị
size khác nhau nên tổng reason không bằng tổng candidate.

Technical issues: `MISSING_SIZE=50`, `NO_VARIANT=2`, `DUPLICATE_VARIANT=2`. Warnings:
`INVALID_HEX=354`, `NO_VALID_IMAGE=8`. Business scope reason không nằm trong technical issue count.

## Coverage

Category target: `ao-thun=82`, `ao-so-mi=40`, `ao-khoac=8`, `quan-dai=45`,
`quan-short=23`, `mu=3`, `that-lung=12`, out-of-scope category `38`, unknown category `63`.

Known out-of-scope category nguồn: `dam-va-chan-vay-nu=28`,
`dam-va-chan-vay-be-gai=9`, `ao-phao-tre-em=1`. Unknown category gồm phụ kiện/đồ mặc ngoài
chưa có baseline như tất, giày, ví, túi, đồ lót, áo len và category rộng `nam`.

Size nổi bật theo số lần xuất hiện trong source variants: `XS=12`, `S=212`, `M=226`, `L=218`,
`XL=195`, `2XL=103`, `3XL=59`, `4XL=24`, `5XL=2`, `FREE/F=1`. Numeric size có 717 lần;
ngoài baseline còn có waist size 25–28, 33–43 và children/range size.

Image hợp lệ: 306/314 sản phẩm, tương đương 97.45%. Giá hợp lệ: 312/314, tương đương 99.36%;
minimum effective price `4500`, median `49000`, maximum `629000` VND. Các giá trị thấp bất thường
được báo cáo nguyên trạng, chưa suy đoán hay sửa nguồn.

## Staging và giới hạn

Dry-run top-up dự kiến create 15 và update 299 record hiện có, database vẫn giữ 299 row trong bước
này. Ghi thật tạo 15 và update 299; chạy lại cùng dataset tạo 0 và update 314. PostgreSQL có 314 raw
YODY và 314 linked candidate, không duplicate, không `IMPORTED` và mọi `imported_at` vẫn null.

Machine-readable output nằm ở `tools/crawler/output/ht-03/bulk-20260925-300/` và bị Git ignore;
không commit bulk source data. `ProductsService.importProducts()` chưa tồn tại, vì vậy HT-03 chưa
ghi `Product`, `ProductVariant`, `ProductImage` hay bất kỳ bảng Catalog nào.

Commit và pull request evidence được lưu trong Git history và GitHub của repository.
