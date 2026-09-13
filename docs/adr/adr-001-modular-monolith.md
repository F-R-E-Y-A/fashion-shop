# ADR-001. Dựng một khối module hóa, không dựng microservices

- **Ngày**: 14/09/2026
- **Trạng thái**: Đã chốt
- **Người quyết định**: Cả nhóm, Bảo đề xuất

## Bối cảnh

Ba sinh viên, mười một tuần, mỗi người khoảng mười hai giờ một tuần vì ban ngày đi thực tập. Yêu cầu chấm gồm nghiệp vụ đầy đủ, tài liệu tốt, triển khai thật và thanh toán qua cổng thử nghiệm.

Ba người cần làm song song mà không giẫm chân nhau. Đây là lý do người ta hay nghĩ tới microservices.

## Quyết định

Dựng **một ứng dụng duy nhất, chia thành module có ranh giới rõ**. Mỗi phân hệ là một thư mục trong `apps/api/src/modules`, có controller, service và bảng dữ liệu riêng. Module gọi nhau bằng cách tiêm service, không gọi qua mạng.

## Lý do

Ranh giới giữa ba người là thứ chúng tôi cần, còn tách tiến trình thì không. Module của NestJS cho ranh giới đó ngay trong ngôn ngữ, thêm tệp `CODEOWNERS` là pull request chạm vào thư mục người khác tự động đòi người đó duyệt.

Microservices trả ranh giới đó với giá quá đắt cho quy mô này: phải dựng nhiều tiến trình, nhiều cơ sở dữ liệu, xử lý giao dịch phân tán, dựng hạ tầng theo dõi tương quan giữa các dịch vụ. Với mười hai giờ một tuần, phần lớn thời gian sẽ đổ vào hạ tầng thay vì vào nghiệp vụ mà hội đồng chấm.

Chọn một khối cũng giữ được đường lùi. Module nào về sau cần tách thì đã có sẵn ranh giới để tách.

## Hệ quả

Chấp nhận:

- Cả hệ thống lên xuống cùng nhau. Một lỗi nặng làm sập cả ứng dụng, nên phần chịu lỗi ở tuần 10 phải làm cho tử tế.
- Ba người dùng chung một cơ sở dữ liệu, nên phải có luật quyền sở hữu bảng, xem `docs/CONTRIBUTING.md`.

Được lại:

- Một lệnh chạy được cả hệ thống trên máy cá nhân.
- Gọi giữa các phân hệ là gọi hàm, có kiểm kiểu lúc biên dịch, không phải gọi mạng có thể hỏng.
- Một giao dịch cơ sở dữ liệu bao được nhiều bảng, nên không cần tới các mẫu bù trừ phức tạp.

## Phương án đã cân nhắc và bỏ

| Phương án | Vì sao bỏ |
|---|---|
| Microservices | Chi phí hạ tầng vượt xa lợi ích ở quy mô ba người, mười một tuần |
| Một khối không chia module | Không có gì ép ranh giới, ba người sẽ viết chồng lên nhau từ tuần thứ tư |
| Mỗi người một ứng dụng riêng | Không ghép được thành một sản phẩm để demo |
