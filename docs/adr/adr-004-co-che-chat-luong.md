# ADR-004. Ép ranh giới và chất lượng bằng máy, không bằng lời nhắc

- **Ngày**: 19/09/2026
- **Trạng thái**: Đã chốt
- **Người quyết định**: Bảo

## Bối cảnh

Từ Thứ Hai 21/09, ba người cùng viết mã vào một kho, mỗi người khoảng mười hai giờ một tuần, trong mười một tuần. Ba luật làm việc đã được viết ra từ 13/09 trong `CONTRIBUTING.md`: một phân hệ do một người làm trọn, không ai ghi vào bảng của người khác, controller không gọi thẳng Prisma.

Vấn đề là ba luật đó tồn tại dưới dạng **lời nhắc trong tài liệu**. Tới tuần thứ tư, khi ai cũng vội, lời nhắc trong tài liệu thua đường tắt trong mã.

Thêm một ràng buộc nữa: rubric của khoa chấm 25 trên 100 điểm cho những thứ chỉ tích luỹ được theo thời gian, gồm nhật ký AI đối chiếu với commit, tỷ lệ tuần có commit, tỷ lệ thay đổi qua pull request có duyệt, số chặng trong pipeline, số lần triển khai tự động. Những con số này không nhồi được vào tuần cuối.

## Quyết định

**Mọi luật nào máy kiểm được thì máy kiểm, ngay trong sprint 1.** Cụ thể:

1. **Luật ranh giới viết thành luật ESLint cục bộ** trong `tools/eslint/boundaries.mjs`, thông báo lỗi bằng tiếng Việt chỉ thẳng luật nào bị phạm.
2. **Chính luật đó có bộ kiểm riêng**, `tools/eslint/verify-boundaries.mjs`, chạy trong CI.
3. **Kiểm thử hai tầng có khuôn mẫu sẵn** để chép: đơn vị với Prisma giả, và qua HTTP thật trên Postgres riêng.
4. **CI sáu chặng** chặn gộp: định dạng và lint, kiểm kiểu và dựng, kiểm thử đơn vị, migration và kiểm thử HTTP, quét bí mật và thư viện, dựng image rồi chạy thử.
5. **Hook ở máy** chặn commit sai quy ước và chặn đẩy thẳng vào nhánh chung.
6. **Nhật ký AI nằm trong kho**, mỗi commit có phần AI sinh mang dòng `AI-Assisted`, tra được bằng `git log --grep`.

## Lý do

Ranh giới là thứ duy nhất cho phép ba người viết song song mà không chờ nhau. Ép nó ở khâu duyệt pull request nghĩa là phát hiện sau khi mã đã viết xong, lúc đó sửa rất đắt và người duyệt ngại nói. Ép ở khâu lint nghĩa là biết ngay khi vừa gõ, lúc đó sửa là hai phút.

Bộ kiểm cho chính luật ranh giới nghe có vẻ thừa, nhưng một luật lint âm thầm hỏng thì tệ hơn là không có luật: cả nhóm vẫn tin rằng ranh giới đang được giữ. Tám trường hợp trong bộ kiểm là tám điều đã kiểm chứng tự tay, không phải giả định.

Nhật ký AI để trong kho thay vì trên Notion vì rubric đòi **đối chiếu được với lịch sử commit**. Bằng chứng phải nằm cùng chỗ với thứ nó chứng minh.

Về nguyên tắc chung, mượn đúng một câu để tự nhắc: **gọn trước, luôn sẵn sàng mở rộng.** Cơ chế thì xong sớm vì ba người sẽ chép nó suốt mười một tuần. Dịch vụ thì đến đúng tuần mà phân hệ sở hữu nó cần tới.

## Hệ quả

Chấp nhận:

- Mỗi pull request phải qua sáu chặng, mất vài phút. Đổi lại lỗi bị bắt ở máy CI chứ không ở buổi ghép Chủ Nhật.
- Luật ranh giới là mã tự viết nên phải tự bảo trì. Đã trả giá đó có ý thức: một luật cục bộ 150 dòng rẻ hơn kéo về một plugin lớn rồi phải uốn cấu hình theo nó.
- Thêm một phân hệ tốn thêm vài dòng cấu hình: một dòng trong `app.module.ts`, một dòng trong `routes.tsx`, một tệp `index.ts`, vài dòng trong `CODEOWNERS`.

Được lại:

- Người mới đọc thông báo lỗi là biết phạm luật nào, không phải đi hỏi.
- Bốn con số rubric chấm bắt đầu được đếm từ tuần đầu chứ không phải tuần cuối.
- Khi tách phân hệ thành dịch vụ riêng về sau, ranh giới đã được giữ sạch suốt quá trình nên việc tách là chuyện cắt theo đường đã vạch.

## Phương án đã cân nhắc và bỏ

| Phương án | Vì sao bỏ |
|---|---|
| Chỉ ghi luật trong `CONTRIBUTING.md`, tin nhau | Đây là hiện trạng từ 13/09. Không có gì ngăn đường tắt vào tuần bận |
| Dùng plugin `eslint-plugin-boundaries` có sẵn | Cấu hình theo mô hình thẻ và loại của nó, không khớp mô hình "một phân hệ một người"; thông báo lỗi tiếng Anh chung chung, không chỉ được luật nào của nhóm bị phạm |
| Tách mỗi phân hệ thành một gói riêng trong `packages/` để ép ranh giới bằng ranh giới gói | Đúng về cơ chế nhưng quá nặng cho ba người: mỗi gói một `package.json`, một `tsconfig`, một nhịp dựng. Để dành cho lúc thật sự có ứng dụng thứ hai |
| Chạy SonarQube hoặc SonarCloud để phân tích tĩnh | Kho riêng tư nên bản miễn phí không dùng được; ESLint cộng báo cáo độ phủ đã phủ đúng những chỉ số rubric hỏi |
| Đặt ngưỡng độ phủ kiểm thử ngay bây giờ | Chưa có mã nghiệp vụ thì con số chỉ là hình thức. Xuất báo cáo trước, ngưỡng do Duy chốt ở S2 |
