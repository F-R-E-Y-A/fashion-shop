# Chiến lược kiểm thử

> **Duy điền tệp này trong tuần 1 (HT-04).** Bảo dựng sẵn khuôn, không điền nội dung.
> Một trang là đủ. Mục tiêu là để ba người hiểu giống nhau về mức nào thì gọi là đã kiểm thử.

## Tầng kiểm thử

| Tầng | Kiểm cái gì | Công cụ | Ai viết | Chạy lúc nào |
|---|---|---|---|---|
| Đơn vị | | | Người sở hữu phân hệ | Mỗi pull request |
| Tích hợp | | | Người sở hữu phân hệ | Mỗi pull request |
| Đầu cuối | | | Duy | Khi gộp vào `develop` |
| Tải và đồng thời | | | Duy | Tuần 10 |

## Độ phủ mong muốn

<Con số cụ thể, và quan trọng hơn là phần nào bắt buộc phải có kiểm thử dù độ phủ thế nào.>

## Quy trình xử lý lỗi

<Phát hiện lỗi thì mở phiếu ra sao, gắn nhãn gì, ai sửa, sửa xong đóng thế nào.>

## Dữ liệu cho kiểm thử

<Dùng bộ dữ liệu giả trong `apps/api/prisma/seed.ts` hay dựng riêng.>

## Ba bài toán khó phải có kiểm thử riêng

Ghi ở đây để không quên khi tới tuần:

1. **Chống bán vượt kho** khi nhiều người cùng mua một biến thể.
2. **Thông báo thanh toán lặp** không được sinh đơn trùng.
3. **Hoàn tiền** không được gọi ra ngoài hai lần.
