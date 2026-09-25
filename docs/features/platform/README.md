---
title: Nền tảng — bản đồ
updated: 2026-09-24
status: đang làm
owner: Bảo
---
# Nền tảng dùng chung

**Chức năng:** Cửa vào của phần nền tảng: gồm những gì, tài liệu vận hành nào, trạng thái hôm nay, lộ trình còn lại tới bản 1.0.

| | |
|---|---|
| **Người sở hữu** | Bảo · `tools/`, `.github/`, `infra/`, `apps/api/src/{common,infra}`, `apps/web/src/{app,core,ui}` (xem `.github/CODEOWNERS`) |
| **Dòng việc** | HT-01 (Issue #1, pull request #2); các hạng mục `HT-` sau theo kế hoạch ở kho docs |

## Nền tảng gồm những gì

| Mảng | Ở đâu | Đọc thêm |
|---|---|---|
| Luật ranh giới ép bằng ESLint, kèm bộ kiểm cho chính luật | `tools/eslint/` | [code-tour.md](../../shared/code-tour.md) mục 4.1, 4.2 |
| Hook máy: định dạng khi commit, dạng commit, chặn đẩy thẳng | `tools/git/`, `package.json` mục `simple-git-hooks` | [git.md](../../shared/git.md) |
| CI sáu chặng | `.github/workflows/ci.yml` | [code-tour.md](../../shared/code-tour.md) mục 5 |
| Tự triển khai môi trường thử | `.github/workflows/cd-staging.yml`, `render.yaml`, `apps/web/vercel.json` | [staging.md](staging.md) |
| Gán người duyệt theo `CODEOWNERS` | `.github/workflows/pr-reviewers.yml` | [github-setup.md](github-setup.md) mục 6 |
| Image Docker hai ứng dụng, chạy cả cụm trên máy | `apps/*/Dockerfile`, `infra/compose.prod.yml` | [staging.md](staging.md) mục cuối |
| Số liệu minh chứng rubric từ GitHub | `tools/evidence/github-metrics.mjs` | `npm run evidence:github` |

## Tài liệu vận hành

| Tệp | Trả lời câu gì |
|---|---|
| [staging.md](staging.md) | Dựng Render và Vercel lần đầu, luồng tự triển khai, xem log, quay về bản trước |
| [github-setup.md](github-setup.md) | Lệnh đã dùng để dựng hai kho GitHub; chạy lại khi phải dựng lại |
| [LOG.md](LOG.md) | Nền tảng đã đi qua những bản nào, đánh giá nào, số đo gì |

## Trạng thái hôm nay (24/09/2026)

- **Pull request #2 của HT-01 đã gộp** ngày 24/09 bằng merge commit `892cf12`: `develop` có module mẫu mới, luật ranh giới và CI sáu chặng (đo bằng `git log origin/develop`).
- **CI của pull request #9 vẫn đỏ từ lượt chạy 22/09**, vì lượt đó dùng `ci.yml` cũ, lỗi số 1 trong [LOG ngày 15/09](LOG.md). Cần một sự kiện mới trên pull request (đóng rồi mở lại, hoặc cập nhật nhánh) để CI chạy bằng bản mới.
- **Môi trường thử chưa nối.** `gh variable list` và `gh secret list` trên kho đều rỗng: chưa có `RENDER_DEPLOY_HOOK_URL`, `STAGING_API_URL`, `STAGING_WEB_URL`. Việc còn lại ở [staging.md](staging.md) mục "Dựng lần đầu".
- **Kho riêng tư gói Free không khoá được nhánh** ([TECH_DEBT.md](../../TECH_DEBT.md) ND-08, ND-11).

## Lộ trình còn lại

Nguyên tắc: **cơ chế xong sớm, dịch vụ đến đúng tuần** ([LOG#adr-004](../../LOG.md#adr-004)). Dịch vụ chỉ thêm vào tuần phân hệ cần nó, trong cùng pull request.

| Thứ | Khi nào | Ai cần |
|---|---|---|
| Kho ảnh: tải ảnh lên, trả địa chỉ công khai | Khi feature đầu tiên cần tải ảnh; PH-01 tuần này dùng địa chỉ ảnh có sẵn nên chưa cần | Bảo, Tài |
| Nhật ký có cấu trúc và mã yêu cầu | HT-05 | Cả nhóm (ND-04) |
| Redis, hàng đợi, tác vụ nền, bảng ghi sự kiện | HT-05 | Giỏ khách vãng lai, đặt hàng |
| Meilisearch | Khi làm tìm kiếm UC-03.2 | Bảo |
| Kiểu dữ liệu giao diện sinh từ OpenAPI | Khi ba phân hệ đầu chốt hợp đồng | Cả nhóm (ND-02) |
| Kiểm thử đầu cuối, kiểm thử tải | Tuần 9 và 10 | Duy |
| Chuyển môi trường thử sang Azure | Sau khi Render chạy ổn | Bảo (ND-07) |
| Phát hành, sao lưu, bàn giao | Cuối kỳ | Bảo |
