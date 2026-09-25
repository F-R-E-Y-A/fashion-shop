# AGENTS.md — luật cho người và mọi agent trong kho `fashion-shop`

Claude Code, Codex, Copilot, Cursor, Gemini và người viết đọc file này trước khi sửa mã hay tài liệu. Muốn hiểu nhanh cả dự án: [docs/README.md](docs/README.md).

## Mã nguồn

- Ba luật không được phá và chín bước thêm một phân hệ: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md). Ba luật do ESLint ép; lint báo lỗi ranh giới thì mang ra buổi chốt Thứ Tư, không tắt luật.
- Quy ước: viết mã [shared/code.md](docs/shared/code.md) · API [shared/api.md](docs/shared/api.md) · kiểm thử [shared/testing.md](docs/shared/testing.md) · nhánh và commit [shared/git.md](docs/shared/git.md) · giao diện [shared/design.md](docs/shared/design.md).
- Chép module mẫu `apps/api/src/modules/products` và `apps/web/src/features/products`, không chép hướng dẫn trên mạng: NestJS 12 chỉ còn ESM, Prisma 7 đổi cách kết nối ([LOG#adr-003](docs/LOG.md#adr-003)).
- `npm run check` xanh trước khi nói "xong". Không commit, không push khi người chưa yêu cầu. Commit có phần AI sinh mang dòng `Co-Authored-By:`, theo luật nhật ký AI ở kho docs.

## Tài liệu: mười luật

1. **Theo tính năng, không theo tầng.** `docs/features/<module>/` chứa mọi thứ về một tính năng; `docs/shared/` chứa thứ đúng cho mọi tính năng; gốc `docs/` chỉ có `README`, `LOG`, `CONTRIBUTING`, `TECH_DEBT`. Tên thư mục feature trùng tên module trong mã.
2. **Một feature tối thiểu có `README.md` và `LOG.md`.** README là bản đồ và trạng thái hôm nay; thêm `use-cases.md` khi có đặc tả. Chỉ tách thêm file khi một file phải trả lời hai câu hỏi.
3. **`LOG.md` chỉ thêm vào cuối, và là nơi duy nhất trả lời "vì sao".** `docs/LOG.md` cho quyết định chạm cả nhóm; `docs/features/<x>/LOG.md` cho quyết định của một feature. Khuôn ở [shared/templates/LOG-entry.md](docs/shared/templates/LOG-entry.md). Quyết định có neo `<a id="adr-NNN">` và dòng `Trạng thái`: đề xuất → đã chốt → thay thế bởi → huỷ. **Chỉ người đổi trạng thái; agent chỉ viết `đề xuất`.** Sai thì thêm mục mới; ngoại lệ duy nhất là dòng `Trạng thái` và phần `Thực tế`.
4. **Hình dạng API thật là Swagger `/api/docs`, sinh từ mã.** Tài liệu chỉ giữ quy ước ([shared/api.md](docs/shared/api.md)), hợp đồng giữa các module (`README.md` trong thư mục module) và endpoint mới **đề xuất** (README feature). Endpoint đã cài đặt thì không chép hình dạng sang tài liệu.
5. **Frontmatter `title · updated · status · owner`, và dưới H1 một dòng `**Chức năng:**`** tối đa 25 từ nói file trả lời câu hỏi gì. Không có bảng lịch sử hay "ngày soạn" trong thân; lịch sử ở LOG và git.
6. **Bằng chứng, không cảm nhận.** Nhận định về mã kèm `đường dẫn:dòng`; số liệu kèm lệnh đo; "đã chạy" kèm lệnh, kết quả và commit. Chưa biết thì ghi `[TBD — hỏi <ai>]`; suy luận thì ghi "(suy luận)".
7. **Link bấm được.** Tài liệu trong kho dùng link tương đối. Commit và file theo phiên bản dùng link theo **mã commit**, không theo tên nhánh, vì nhánh bị xoá sau khi gộp.
8. **Tối đa 300 dòng một file**, trừ `LOG.md`. Dài hơn thì tách trong cùng thư mục.
9. **Mã là sự thật, tài liệu là giả thuyết.** Tài liệu nói sai mã thì sửa tài liệu trong cùng pull request; chưa sửa được thì ghi một dòng `ND` vào [TECH_DEBT.md](docs/TECH_DEBT.md).
10. **Tài liệu đi cùng mã trong một pull request.** Kế hoạch, sổ tiến độ, nhật ký AI, minh chứng và báo cáo nằm ở kho [`F-R-E-Y-A/docs`](https://github.com/F-R-E-Y-A/docs). Ghi chú phiên làm việc của agent không để trong kho này.

## Hệ mã: bốn họ, không thêm họ thứ năm

| Họ | Mã | Là gì | Nguồn duy nhất | Ví dụ |
|---|---|---|---|---|
| Việc | `PH-NN` | Dòng việc chức năng: một Issue, một nhánh, một người. Đánh số theo báo cáo tuần, tuần S2: `PH-01` Khám phá sản phẩm (Bảo), `PH-02` Giỏ hàng (Duy), `PH-03` Xác thực và nạp dữ liệu (Tài) | GitHub Issue nhãn `ph` | `PH-01`, nhánh `feature/ph-01-product-catalog`, commit `feat(ph-01): …` |
| Việc | `HT-NN` | Hạng mục nền tảng | GitHub Issue nhãn `ht` | `HT-01`, commit `docs(ht-01): …` |
| Use case | `UC-NN.m` | Use case: nhóm `NN`, số thứ tự `m` | [shared/use-case-index.md](docs/shared/use-case-index.md) | `UC-03.4` |
| Use case | `UC-NN.m/ACk`, `/BRk`, `/Ek` | Tiêu chí chấp nhận, luật nghiệp vụ, ngoại lệ **trong** một use case | `docs/features/<x>/use-cases.md` | tên bài kiểm thử `UC-03.4/AC2 …` |
| Quyết định | `ADR-NNN` | Một quyết định. **Một dãy số chung** cho mọi LOG | `docs/LOG.md`, `docs/features/*/LOG.md` | `ADR-007` |
| Nợ | `ND-NN` | Nợ kỹ thuật cố ý, có hạn xử lý | [docs/TECH_DEBT.md](docs/TECH_DEBT.md) | `ND-10` |

Việc là **thứ nhóm làm trong tuần**, use case là **thứ hệ thống phải làm được**. Hai trục khác nhau nên hai tiền tố khác nhau: `PH-01` gồm `UC-03.1` và `UC-03.4`.

Số `ADR` kế tiếp: `grep -rhoE "adr-[0-9]{3}" docs | sort | tail -1`, cộng một. Phạm vi commit viết thường: `feat(ph-01)`, không `feat(PH-01)`.

**Cẩn thận ba nghĩa cũ của chữ `PH`.** Bảng PH-01 tới PH-16 trong `ke-hoach/PhanCongCongViec.md` (kho docs) là cách đánh số cũ, ở đó PH-01 là *Tài khoản*, PH-03 là *Khám phá sản phẩm*: **không dùng nữa**. Danh mục use case của Duy từng dùng `PH-NN.m`, nay là `UC-NN.m`. Issue tạo ngày 20/09 ghi `PH1`–`PH3`, cùng thứ tự với `PH-01`–`PH-03`.

Không dùng nữa: `UC-NN` của bản nháp 13/09, `R1`–`R5` của lộ trình nền tảng (đã chưng cất vào LOG). `E0`–`E14` và `S3-B1` là mã của kế hoạch nộp khoa, chỉ sống trong kho docs; `H-NN` là mã sổ lỗi AI của kho docs.

## Tạm thời

Những chỗ biết là chưa theo luật, sửa khi có người chạm tới:

- Hai tệp vượt 300 dòng: [shared/code-tour.md](docs/shared/code-tour.md), [features/platform/github-setup.md](docs/features/platform/github-setup.md).
- Pull request #9 của Duy (danh mục use case, sơ đồ, ba đặc tả, chiến lược kiểm thử) chưa gộp và còn theo cây cũ, mã `PH-NN.m`; `shared/use-case-index.md` và `shared/test-strategy.md` hiện là khuôn trống chờ nội dung đó.
- Tên bài kiểm thử của module mẫu `products` còn dạng `PH-03`/`AC-1` (mã cũ); PH-01 viết lại theo `UC-NN.m/ACk`.
- Tiêu đề Issue #6, #7, #8 còn `PH1`–`PH3` và phạm vi cũ; đổi theo báo cáo tuần.

## Kiểm

`npm run docs:lint` hoặc `node tools/docs/lint.mjs <tệp hay thư mục>`: frontmatter, dòng Chức năng, trần dòng, link nội bộ gãy, neo `#adr-NNN`, số ADR trùng. **Chạy tay**, chưa gắn hook hay CI ([LOG#adr-006](docs/LOG.md#adr-006)).
