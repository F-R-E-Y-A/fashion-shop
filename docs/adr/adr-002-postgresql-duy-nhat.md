# ADR-002. Dùng PostgreSQL làm cơ sở dữ liệu duy nhất

- **Ngày**: 14/09/2026
- **Trạng thái**: Đã chốt
- **Người quyết định**: Cả nhóm

## Bối cảnh

Hội đồng chấm rất kỹ sơ đồ quan hệ thực thể, nên bắt buộc phải có cơ sở dữ liệu quan hệ. Câu hỏi đặt ra là có cần thêm MongoDB cho phần dữ liệu sản phẩm nhiều thuộc tính và phần dữ liệu thu thập được hay không.

## Quyết định

Chỉ dùng **PostgreSQL**. Không thêm MongoDB.

## Lý do

Thứ được cho là điểm mạnh của MongoDB ở đây là lưu dữ liệu hình dạng không cố định. Postgres làm được việc đó bằng kiểu `JSONB` kèm chỉ mục `GIN`, mà vẫn giữ nguyên ràng buộc khóa ngoại và giao dịch cho phần còn lại.

Thêm một cơ sở dữ liệu thứ hai thì phải đồng bộ hai nơi, và sơ đồ quan hệ thực thể sẽ thủng một mảng, đúng chỗ hội đồng nhìn kỹ nhất.

Phần tìm kiếm sau này dùng Meilisearch, nhưng đó là **chỉ mục dẫn xuất**, dựng lại được từ Postgres bất cứ lúc nào, không phải nơi lưu trữ gốc. Nguồn sự thật vẫn chỉ có một.

## Hệ quả

Chấp nhận:

- Dữ liệu thu thập thô phải nằm trong một schema riêng tên `staging`, tách khỏi bảng nghiệp vụ.
- Truy vấn trên `JSONB` phải có chỉ mục đúng, nếu không sẽ chậm. Phần đo và tối ưu nằm ở HT-08 tuần 9.

Được lại:

- Một sơ đồ quan hệ thực thể duy nhất, đầy đủ, đúng thứ hội đồng đòi.
- Một giao dịch bao được nhiều bảng, cần thiết cho luồng đặt hàng và thanh toán.
- Một chỗ để sao lưu và phục hồi, việc của HT-08 tuần 10 nhẹ đi.
