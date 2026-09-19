# Luật làm việc chung

## Ba luật không được phá

**1. Một phân hệ do một người làm trọn.** Từ bảng dữ liệu, API, giao diện, kiểm thử tới tài liệu, tất cả trên một nhánh `feature/`. Không tách API cho người này và giao diện cho người kia.

**2. Không ai ghi vào bảng của người khác.** Khóa ngoại trỏ sang bảng người khác thì được. Ghi vào thì không. Cần thay đổi dữ liệu của họ thì gọi service họ đã công bố qua `index.ts`.

**3. Controller không gọi thẳng Prisma.** Phải đi qua tầng service. Lý do: khi phân hệ khác cần dữ liệu, họ tiêm service đó, và luật số hai tự nhiên được giữ.

**Ba luật này được ép bằng máy**, không phải bằng lời nhắc. Phạm luật thì `npm run lint` báo lỗi tiếng Việt chỉ thẳng luật nào bị phạm, và CI không cho gộp. Lý do chọn cách này nằm ở `adr/adr-004-co-che-chat-luong.md`.

## Ranh giới được ép thế nào

Ở máy chủ:

| Ai | Được import gì |
|---|---|
| `modules/<của tôi>/**` | `common/`, `infra/`, và `modules/<người khác>/index.js` |
| `common/`, `infra/` | Chỉ lẫn nhau. Không biết `modules/` tồn tại |
| `modules/**/*.controller.ts`, `modules/**/dto/**` | Không được chạm Prisma |

Ở giao diện:

| Ai | Được import gì |
|---|---|
| `features/<của tôi>/**` | `@/core`, `@/ui`, và `@/features/<người khác>` qua cửa `index` |
| `core/`, `ui/` | Chỉ lẫn nhau. Không biết `features/` hay `app/` tồn tại |
| `app/` | Mọi thứ. Đây là nơi duy nhất ráp các feature lại |

Vào một tầng hay một phân hệ **chỉ qua cửa `index`**. Cần thứ gì bên trong phân hệ người khác thì bảo họ xuất ra ở `index.ts` của họ, đừng với tay vào.

## Quyền sở hữu bảng dữ liệu

Lược đồ tách theo chủ sở hữu, mỗi người một tệp trong `apps/api/prisma/schema/`. Tài dựng và giữ sơ đồ quan hệ thực thể tổng.

| Người | Tệp | Bảng được ghi |
|---|---|---|
| Bảo | `catalog.prisma` | sản phẩm, biến thể, danh mục, ảnh sản phẩm, yêu thích, đã xem, thanh toán, giao dịch thanh toán, khuyến mãi, mã giảm giá, bảng ghi sự kiện, tác vụ nền |
| Duy | `orders.prisma` | giỏ hàng, dòng giỏ hàng, tồn kho, biến động kho, giữ hàng, đơn hàng, dòng đơn hàng, lịch sử trạng thái đơn, vận đơn, thông báo |
| Tài | `identity.prisma` | người dùng, vai, mã một lần, token làm mới, địa chỉ, bảng phí vận chuyển, đánh giá, ảnh đánh giá, đổi trả, hoàn tiền, nhật ký thao tác, schema `staging`, schema `reporting` |

Muốn thêm chỉ mục trên bảng người khác thì đề xuất kèm số đo, chủ bảng tự áp dụng.

**Một pull request chỉ kèm một migration.** Ba người cùng tạo migration trong một tuần thì gộp nhanh, ai gộp sau chạy lại `npm run db:migrate`. CI có bước kiểm lệch lược đồ nên ai sửa tệp `.prisma` mà quên tạo migration sẽ bị bắt.

## Chín bước thêm một phân hệ

1. Mở phiếu công việc theo mẫu, điền câu chuyện người dùng và tiêu chí chấp nhận.
2. Tạo nhánh `feature/ph-NN-ten-ngan` từ `develop`.
3. Thêm bảng vào tệp `.prisma` **của chính mình**, chạy `npm run db:migrate`, đặt tên migration theo việc.
4. Thêm dữ liệu giả vào `prisma/seed/<phân hệ>.seed.ts`, gọi từ `seed/index.ts`.
5. Chép `modules/products`, đổi tên, giữ `index.ts` làm cửa. Đăng ký vào `app.module.ts`.
6. Chép `features/products`, đổi tên. Thêm `Route` trong `app/routes.tsx`.
7. Viết kiểm thử: một bài đơn vị cho service, một bài HTTP cho đường dẫn, một bài cho trang.
8. Viết đặc tả use case vào `docs/ba/`. Thêm dòng sở hữu vào `.github/CODEOWNERS`.
9. `npm run check`, rồi mở pull request vào `develop`, điền danh sách kiểm.

## Điều kiện hoàn thành

Một dòng việc chỉ được coi là xong khi đủ hết, không cắt bớt cái nào:

- Có migration nếu có đụng bảng, và có dữ liệu giả kèm theo.
- API khớp đặc tả tại `/api/docs`.
- Có giao diện chạy được, không chỉ có API, và đủ ba trạng thái đang tải, lỗi, không có dữ liệu.
- Có kiểm thử cho phần lõi, tên bài ghi mã tiêu chí chấp nhận.
- Tài liệu use case của phân hệ đã cập nhật.
- Chạy được trên máy người khác sau khi kéo về.
- Pull request được người khác duyệt và CI xanh cả sáu chặng.

## Nhịp làm việc

| Lúc | Việc |
|---|---|
| Thứ Hai tới Thứ Sáu, buổi tối | Khoảng hai giờ mỗi người |
| Thứ Tư 21h30 | Chốt chung ba mươi phút, chỉ bàn việc chạm từ hai người trở lên |
| Thứ Bảy | Khối làm việc dài |
| Chủ Nhật sáng chiều | Ghép, tắt dữ liệu giả, duyệt chéo, soạn demo |
| Chủ Nhật, trước buổi họp | Điền `tien-do/SNN.md` và `ai-log/YYYY-Www.md` trong [kho docs](https://github.com/F-R-E-Y-A/docs) |
| **Chủ Nhật 19h** | **Họp giảng viên, trình bày sản phẩm chạy được của tuần** |
| Sau buổi họp | Nhìn lại mười lăm phút, lập kế hoạch tuần sau ba mươi phút |
| Trước 22h mỗi ngày | Ba dòng báo tiến độ trong nhóm chat |

## Khi kẹt

| Tình huống | Làm gì |
|---|---|
| Xong sớm | Lấy phần Nên có trong đặc tả, hoặc kéo dòng kế tiếp của mình lên |
| Không kịp | Không kéo dài sprint. Giữ phần Phải có, cắt phần Nên có. Phần dở xếp lại vào Chủ Nhật |
| Hụt giờ giữa tuần | Báo ở buổi chốt Thứ Tư, đừng đợi tới Chủ Nhật |
| Chờ hợp đồng của người khác | Chạy trên dữ liệu giả, đổi sang thật khi họ xong. Không ngồi đợi |
| Lint báo lỗi ranh giới mà thấy vô lý | Mang ra buổi Thứ Tư. Có thể luật sai, sửa `tools/eslint/boundaries.mjs`. Đừng tự tắt luật |
| Quyết định chạm từ hai người | Đưa ra buổi chốt Thứ Tư |
| Quyết định về kiến trúc hoặc phạm vi | Hỏi giảng viên tối Chủ Nhật. Chốt xong thì viết ADR |
| Thấy thứ biết là nợ mà chưa sửa được | Thêm một dòng vào `TECH_DEBT.md`, đừng để trong đầu |
