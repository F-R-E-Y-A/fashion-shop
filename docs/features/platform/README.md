---
title: Nền tảng — bản đồ
updated: 2026-10-04
status: đang làm
owner: Bảo
---
# Nền tảng dùng chung

**Chức năng:** Cửa vào của phần nền tảng: gồm những gì, tài liệu vận hành nào, trạng thái hôm nay, lộ trình còn lại tới bản 1.0.

| | |
|---|---|
| **Người sở hữu** | Bảo · `tools/`, `.github/`, `infra/`, `apps/api/src/{common,infra}`, `apps/web/src/{app,core,ui}` (bản đồ sở hữu ở [README docs](../../README.md) mục 1) |
| **Dòng việc** | HT-01 (Issue #1, pull request #2); các hạng mục `HT-` sau theo kế hoạch ở kho docs |

## Nền tảng gồm những gì

| Mảng | Ở đâu | Đọc thêm |
|---|---|---|
| Luật ranh giới ép bằng ESLint, kèm bộ kiểm cho chính luật | `tools/eslint/` | [code-tour.md](../../shared/code-tour.md) mục 4.1, 4.2 |
| Hook máy: định dạng khi commit, dạng commit, chặn đẩy thẳng | `tools/git/`, `package.json` mục `simple-git-hooks` | [git.md](../../shared/git.md) |
| CI sáu chặng | `.github/workflows/ci.yml` | [code-tour.md](../../shared/code-tour.md) mục 5 |
| Tự triển khai môi trường thử | `.github/workflows/cd-staging.yml`, `render.yaml`, `apps/web/vercel.json` | [staging.md](staging.md) |
| Image Docker hai ứng dụng, chạy cả cụm trên máy | `apps/*/Dockerfile`, `infra/compose.prod.yml` | [staging.md](staging.md) mục cuối |
| Số liệu minh chứng rubric từ GitHub | `tools/evidence/github-metrics.mjs` | `npm run evidence:github` |

## Tài liệu vận hành

| Tệp | Trả lời câu gì |
|---|---|
| [staging.md](staging.md) | Dựng Render và Vercel lần đầu, luồng tự triển khai, xem log, quay về bản trước |
| [github-setup.md](github-setup.md) | Lệnh đã dùng để dựng hai kho GitHub; chạy lại khi phải dựng lại |
| [LOG.md](LOG.md) | Nền tảng đã đi qua những bản nào, đánh giá nào, số đo gì |

## Trạng thái hôm nay (04/10/2026)

- **Pull request #2 của HT-01 đã gộp** ngày 24/09 bằng merge commit `892cf12`: `develop` có module mẫu mới, luật ranh giới và CI sáu chặng (đo bằng `git log origin/develop`).
- **CI của PH-01 đợt 2 thành công** trên `1809122`, [run 37119852674](https://github.com/F-R-E-Y-A/fashion-shop/actions/runs/37119852674): `gh pr checks 28 --json name,state,link` trả sáu gate `SUCCESS`; PR #28 đã gộp vào `develop` tại `ee46445` ngày 03/10. Số đo và output được lưu ở `minh-chung/2026-W40-doi-chieu.md` của [kho hồ sơ](https://github.com/F-R-E-Y-A/docs), hiện là thay đổi local chưa push.
- **Môi trường thử chưa triển khai thành công.** Log [CD run 37128704142](https://github.com/F-R-E-Y-A/fashion-shop/actions/runs/37128704142) báo `Chua dat RENDER_DEPLOY_HOOK_URL`; đọc lại bằng `gh run view 37128704142 --log-failed` ngày 04/10. Blueprint và hướng dẫn staging đang có thay đổi local chưa commit. Việc còn lại ở [staging.md](staging.md) mục "Dựng lần đầu".
- **Runtime local đã có Redis và Mailpit**, cấu hình tại `docker-compose.yml:28` và `:40`. Seed chỉ nạp bảng tra cứu (`apps/api/prisma/seed/catalog.seed.ts:51`); Catalog thật cần bước persist/import riêng.
- **Kho riêng tư gói Free không khoá được nhánh** ([TECH_DEBT.md](../../TECH_DEBT.md) ND-08, ND-11).

## Lộ trình còn lại

Nguyên tắc: **cơ chế xong sớm, dịch vụ đến đúng tuần** ([LOG#adr-004](../../LOG.md#adr-004)). Dịch vụ chỉ thêm vào tuần phân hệ cần nó, trong cùng pull request.

| Thứ | Khi nào | Ai cần |
|---|---|---|
| Kho ảnh: tải ảnh lên, trả địa chỉ công khai | Khi feature đầu tiên cần tải ảnh; PH-01 tuần này dùng địa chỉ ảnh có sẵn nên chưa cần | Bảo, Tài |
| Nhật ký có cấu trúc và mã yêu cầu | HT-05 | Cả nhóm (ND-04) |
| Redis | Đã có từ PH3.4 cho rate limit; hàng đợi/tác vụ nền còn chờ HT-05 | Xác thực, gợi ý tìm kiếm |
| Meilisearch | Chưa dùng; UC-03.2 hiện dùng luật/từ điển trong API, ngưỡng nâng cấp ở ADR-019 | Bảo |
| Kiểu dữ liệu giao diện sinh từ OpenAPI | Khi ba phân hệ đầu chốt hợp đồng | Cả nhóm (ND-02) |
| Kiểm thử đầu cuối, kiểm thử tải | Tuần 9 và 10 | Duy |
| Chuyển môi trường thử sang Azure | Sau khi Render chạy ổn | Bảo (ND-07) |
| Phát hành, sao lưu, bàn giao | Cuối kỳ | Bảo |
