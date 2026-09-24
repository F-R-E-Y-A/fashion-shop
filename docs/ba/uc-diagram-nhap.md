# Use Case Diagram — Website thương mại điện tử thời trang

> Bản duyệt v1.0, ngày 13/09/2026. Mã phân hệ khớp với bảng chia việc theo sprint trong [kho docs](https://github.com/F-R-E-Y-A/docs/blob/main/ke-hoach/ChiaViecTheoSprint_TLCN.docx).
>
> **Cách xem:** cài extension `Markdown Preview Mermaid Support` trong VS Code, rồi bấm `Ctrl+Shift+V`. Bản PlantUML ở cuối tệp dùng cho báo cáo, cài extension `PlantUML` nếu muốn xem.

---

## 1. Sơ đồ Mermaid (xem nhanh)

```mermaid
graph LR
    %% ===== TÁC NHÂN =====
    G["Khách vãng lai"]
    C["Khách hàng"]
    S["Nhân viên vận hành"]
    AD["Quản trị viên"]
    PG["Cổng thanh toán sandbox"]
    ML["Dịch vụ thư điện tử"]

    C -.->|kế thừa| G
    AD -.->|kế thừa| S

    %% ===== PHÂN HỆ =====
    subgraph P1 ["UC-01 Xác thực và quản trị người dùng"]
        U0101(["Đăng ký tài khoản"])
        U0102(["Đăng nhập"])
        U0103(["Khôi phục mật khẩu"])
        U0104(["Xác thực bằng mã OTP"])
        U0105(["Quản trị tài khoản người dùng"])
    end

    subgraph P2 ["UC-02 Hồ sơ và sổ địa chỉ"]
        U0201(["Quản lý hồ sơ cá nhân"])
        U0202(["Quản lý sổ địa chỉ giao hàng"])
    end

    subgraph P3 ["UC-03 Danh mục và quản trị sản phẩm"]
        U0301(["Xem danh mục sản phẩm"])
        U0302(["Xem chi tiết sản phẩm và chọn biến thể"])
        U0303(["Lưu sản phẩm yêu thích"])
        U0304(["Quản lý sản phẩm, biến thể và danh mục"])
    end

    subgraph P4 ["UC-04 Tìm kiếm sản phẩm"]
        U0401(["Tìm kiếm và lọc sản phẩm"])
    end

    subgraph P5 ["UC-05 Giỏ hàng"]
        U0501(["Quản lý giỏ hàng"])
    end

    subgraph P6 ["UC-06 Tồn kho"]
        U0601(["Quản lý tồn kho và nhập hàng"])
    end

    subgraph P7 ["UC-07 Đặt hàng"]
        U0701(["Đặt hàng"])
        U0702(["Theo dõi và hủy đơn hàng"])
    end

    subgraph P8 ["UC-08 Thanh toán"]
        U0801(["Thanh toán đơn hàng"])
    end

    subgraph P9 ["UC-09 Khuyến mãi"]
        U0901(["Áp dụng mã khuyến mãi"])
        U0902(["Quản lý chương trình khuyến mãi"])
    end

    subgraph P10 ["UC-10 Đánh giá sản phẩm"]
        U1001(["Đánh giá sản phẩm đã mua"])
        U1002(["Kiểm duyệt đánh giá"])
    end

    subgraph P11 ["UC-11 Thông báo"]
        U1101(["Nhận thông báo về đơn hàng"])
    end

    subgraph P12 ["UC-12 Giao hàng và quản trị đơn"]
        U1201(["Xử lý đơn hàng và cập nhật giao hàng"])
    end

    subgraph P13 ["UC-13 Đổi trả và hoàn tiền"]
        U1301(["Yêu cầu đổi hoặc trả hàng"])
        U1302(["Duyệt yêu cầu đổi trả"])
        U1303(["Hoàn tiền cho khách"])
    end

    subgraph P14 ["UC-14 Báo cáo thống kê"]
        U1401(["Xem và xuất báo cáo thống kê"])
    end

    %% ===== KHÁCH VÃNG LAI =====
    G --- U0101
    G --- U0102
    G --- U0103
    G --- U0301
    G --- U0302
    G --- U0303
    G --- U0401
    G --- U0501
    G --- U0701
    G --- U0702

    %% ===== KHÁCH HÀNG =====
    C --- U0201
    C --- U0202
    C --- U0801
    C --- U0901
    C --- U1001
    C --- U1101
    C --- U1301

    %% ===== NHÂN VIÊN VẬN HÀNH =====
    S --- U1201
    S --- U1302
    S --- U1303

    %% ===== QUẢN TRỊ VIÊN =====
    AD --- U0105
    AD --- U0304
    AD --- U0601
    AD --- U0902
    AD --- U1002
    AD --- U1401

    %% ===== HỆ THỐNG NGOÀI =====
    U0801 --- PG
    U1303 --- PG
    U0104 --- ML
    U1101 --- ML

    %% ===== QUAN HỆ =====
    U0101 -.->|include| U0104
    U0103 -.->|include| U0104

    U0801 -.->|extend| U0701
    U0901 -.->|extend| U0701
    U1301 -.->|extend| U0702
    U1303 -.->|extend| U1302
```

---

## 2. Bảng ánh xạ use case sang phân hệ và người phụ trách

Cột phân hệ và sprint lấy đúng từ bảng phân công công việc, để hai tài liệu tra chéo được.

| Mã use case | Tên use case | Tác nhân chính | Phân hệ | Người | Sprint | Mức |
|---|---|---|---|---|---|---|
| UC-01.1 | Đăng ký tài khoản | Khách vãng lai | UC-01 | Tài | S2 | Phải có |
| UC-01.2 | Đăng nhập | Khách vãng lai | UC-01 | Tài | S2 | Phải có |
| UC-01.3 | Khôi phục mật khẩu | Khách vãng lai | UC-01 | Tài | S2 | Nên có |
| UC-01.4 | Xác thực bằng mã OTP | Khách vãng lai, Dịch vụ thư | UC-01 | Tài | S2 | Phải có |
| UC-01.5 | Quản trị tài khoản người dùng | Quản trị viên | UC-01 | Tài | S3 | Phải có |
| UC-02.1 | Quản lý hồ sơ cá nhân | Khách hàng | UC-02 | Tài | S4 | Phải có |
| UC-02.2 | Quản lý sổ địa chỉ giao hàng | Khách hàng | UC-02 | Tài | S4 | Phải có |
| UC-03.1 | Xem danh mục sản phẩm | Khách vãng lai | UC-03 | Bảo | S2 | Phải có |
| UC-03.2 | Xem chi tiết sản phẩm và chọn biến thể | Khách vãng lai | UC-03 | Bảo | S4 | Phải có |
| UC-03.3 | Lưu sản phẩm yêu thích | Khách vãng lai | UC-03 | Bảo | S4 | Nên có |
| UC-03.4 | Quản lý sản phẩm, biến thể và danh mục | Quản trị viên | UC-03 | Bảo | S4 | Phải có |
| UC-04.1 | Tìm kiếm và lọc sản phẩm | Khách vãng lai | UC-04 | Bảo | S3, S8 | Phải có |
| UC-05.1 | Quản lý giỏ hàng | Khách vãng lai | UC-05 | Duy | S2, S3 | Phải có |
| UC-06.1 | Quản lý tồn kho và nhập hàng | Quản trị viên | UC-06 | Duy | S4 | Phải có |
| UC-07.1 | Đặt hàng | Khách vãng lai | UC-07 | Duy | S5 | Phải có |
| UC-07.2 | Theo dõi và hủy đơn hàng | Khách vãng lai | UC-07 | Duy | S6 | Phải có |
| UC-08.1 | Thanh toán đơn hàng | Khách hàng, Cổng thanh toán | UC-08 | Bảo | S6, S7 | Phải có |
| UC-09.1 | Áp dụng mã khuyến mãi | Khách hàng | UC-09 | Duy | S7 | Phải có |
| UC-09.2 | Quản lý chương trình khuyến mãi | Quản trị viên | UC-09 | Duy | S7 | Phải có |
| UC-10.1 | Đánh giá sản phẩm đã mua | Khách hàng | UC-10 | Tài | S5 | Phải có |
| UC-10.2 | Kiểm duyệt đánh giá | Quản trị viên | UC-10 | Tài | S5 | Nên có |
| UC-11.1 | Nhận thông báo về đơn hàng | Khách hàng, Dịch vụ thư | UC-11 | Bảo | S9 | Phải có |
| UC-12.1 | Xử lý đơn hàng và cập nhật giao hàng | Nhân viên vận hành | UC-12 | Duy | S8 | Phải có |
| UC-13.1 | Yêu cầu đổi hoặc trả hàng | Khách hàng | UC-13 | Tài | S7 | Phải có |
| UC-13.2 | Duyệt yêu cầu đổi trả | Nhân viên vận hành | UC-13 | Tài | S7 | Phải có |
| UC-13.3 | Hoàn tiền cho khách | Nhân viên vận hành, Cổng thanh toán | UC-13 | Tài | S8 | Phải có |
| UC-14.1 | Xem và xuất báo cáo thống kê | Quản trị viên | UC-14 | Tài | S6 | Phải có |

**Tổng: 27 use case, 14 phân hệ.** Theo người: Bảo 8 use case, Duy 6, Tài 13. Tài nhiều use case nhỏ, Bảo và Duy ít use case nhưng mỗi cái kéo dài hai tuần, nên ngày công vẫn bằng nhau ở mức 66.

---

## 3. Quan hệ giữa các use case

| Quan hệ | Loại | Điều kiện | Vì sao |
|---|---|---|---|
| Đăng ký tài khoản → Xác thực bằng mã OTP | include | Luôn thực hiện | Không xác thực email thì không tạo được tài khoản. Hành vi này dùng lại ở hai chỗ nên tách ra là đúng nghĩa include |
| Khôi phục mật khẩu → Xác thực bằng mã OTP | include | Luôn thực hiện | Cùng một hành vi, dùng lại |
| Thanh toán đơn hàng ⇢ Đặt hàng | extend | Khách chọn trả trực tuyến | Hệ thống có thanh toán khi nhận hàng, nên đơn vẫn tạo được mà không thanh toán. Dùng include ở đây là sai |
| Áp dụng mã khuyến mãi ⇢ Đặt hàng | extend | Khách nhập mã hợp lệ | Không phải đơn nào cũng có mã giảm |
| Yêu cầu đổi hoặc trả hàng ⇢ Theo dõi và hủy đơn hàng | extend | Đơn đã giao và còn trong thời hạn đổi trả | Khách vào trang theo dõi đơn rồi mới tạo yêu cầu |
| Hoàn tiền cho khách ⇢ Duyệt yêu cầu đổi trả | extend | Duyệt trả hàng, không áp dụng khi đổi kích thước | Đổi kích thước thì không hoàn tiền, yêu cầu bị từ chối cũng không hoàn |

**Vì sao chỉ có hai include.** Include nghĩa là use case gốc luôn thực hiện hành vi được gộp, và hành vi đó thường dùng lại ở nhiều nơi. Hệ thống này ít chỗ như vậy. Những thứ trông giống include mà thực ra không phải: đặt hàng đọc giỏ hàng là phụ thuộc dữ liệu, giữ tồn kho khi đặt hàng là hành vi nội bộ hệ thống, kiểm tra đã mua khi đánh giá là điều kiện tiên quyết. Ba thứ đó viết trong đặc tả use case, không vẽ thành quan hệ.

---

## 4. Ghi chú phạm vi

**Không vẽ thành use case vì là hành vi nội bộ hệ thống, sẽ mô tả trong đặc tả và trong lược đồ tuần tự:** giữ tồn kho có thời hạn khi đặt hàng, hoàn kho tự động khi hết hạn, xử lý thông báo lặp từ cổng thanh toán, đối soát giao dịch theo lịch, cập nhật chỉ mục tìm kiếm, ghi nhật ký thao tác quản trị.

**Ngoài phạm vi, đã thống nhất với giảng viên:** tồn kho theo cửa hàng và nhận hàng tại cửa hàng, chương trình khách hàng thân thiết, sàn nhiều người bán, thanh toán thật ngoài môi trường thử nghiệm, kết nối đơn vị vận chuyển thật. Nhân viên vận hành cập nhật trạng thái giao hàng thủ công.

**Bốn tác nhân:** Khách vãng lai, Khách hàng kế thừa Khách vãng lai, Nhân viên vận hành, Quản trị viên kế thừa Nhân viên vận hành. Hai hệ thống ngoài: cổng thanh toán môi trường thử nghiệm và dịch vụ thư điện tử.

**Đặt hàng và theo dõi đơn nối với Khách vãng lai**, không phải Khách hàng, vì hệ thống cho phép mua không cần tài khoản và tra đơn bằng mã đơn kèm thư điện tử. Khách hàng kế thừa nên vẫn dùng được.

---

## 5. Bản PlantUML cho báo cáo

Đặt tệp này vào `docs/ba/use-case-diagram.puml` khi dựng kho mã ở Sprint 1.

```plantuml
@startuml use-case-diagram
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false
skinparam actorStyle awesome

actor "Khách vãng lai" as G
actor "Khách hàng" as C
actor "Nhân viên vận hành" as S
actor "Quản trị viên" as AD
actor "Cổng thanh toán\nsandbox" as PG
actor "Dịch vụ thư\nđiện tử" as ML

C --|> G
AD --|> S

rectangle "Website thương mại điện tử thời trang" {

  package "UC-01 Xác thực và quản trị người dùng" {
    usecase "Đăng ký tài khoản" as U0101
    usecase "Đăng nhập" as U0102
    usecase "Khôi phục mật khẩu" as U0103
    usecase "Xác thực bằng mã OTP" as U0104
    usecase "Quản trị tài khoản người dùng" as U0105
  }

  package "UC-02 Hồ sơ và sổ địa chỉ" {
    usecase "Quản lý hồ sơ cá nhân" as U0201
    usecase "Quản lý sổ địa chỉ giao hàng" as U0202
  }

  package "UC-03 Danh mục và quản trị sản phẩm" {
    usecase "Xem danh mục sản phẩm" as U0301
    usecase "Xem chi tiết sản phẩm\nvà chọn biến thể" as U0302
    usecase "Lưu sản phẩm yêu thích" as U0303
    usecase "Quản lý sản phẩm,\nbiến thể và danh mục" as U0304
  }

  package "UC-04 Tìm kiếm sản phẩm" {
    usecase "Tìm kiếm và lọc sản phẩm" as U0401
  }

  package "UC-05 Giỏ hàng" {
    usecase "Quản lý giỏ hàng" as U0501
  }

  package "UC-06 Tồn kho" {
    usecase "Quản lý tồn kho và nhập hàng" as U0601
  }

  package "UC-07 Đặt hàng" {
    usecase "Đặt hàng" as U0701
    usecase "Theo dõi và hủy đơn hàng" as U0702
  }

  package "UC-08 Thanh toán" {
    usecase "Thanh toán đơn hàng" as U0801
  }

  package "UC-09 Khuyến mãi" {
    usecase "Áp dụng mã khuyến mãi" as U0901
    usecase "Quản lý chương trình\nkhuyến mãi" as U0902
  }

  package "UC-10 Đánh giá sản phẩm" {
    usecase "Đánh giá sản phẩm đã mua" as U1001
    usecase "Kiểm duyệt đánh giá" as U1002
  }

  package "UC-11 Thông báo" {
    usecase "Nhận thông báo về đơn hàng" as U1101
  }

  package "UC-12 Giao hàng và quản trị đơn" {
    usecase "Xử lý đơn hàng\nvà cập nhật giao hàng" as U1201
  }

  package "UC-13 Đổi trả và hoàn tiền" {
    usecase "Yêu cầu đổi hoặc trả hàng" as U1301
    usecase "Duyệt yêu cầu đổi trả" as U1302
    usecase "Hoàn tiền cho khách" as U1303
  }

  package "UC-14 Báo cáo thống kê" {
    usecase "Xem và xuất báo cáo thống kê" as U1401
  }
}

G -- U0101
G -- U0102
G -- U0103
G -- U0301
G -- U0302
G -- U0303
G -- U0401
G -- U0501
G -- U0701
G -- U0702

C -- U0201
C -- U0202
C -- U0801
C -- U0901
C -- U1001
C -- U1101
C -- U1301

S -- U1201
S -- U1302
S -- U1303

AD -- U0105
AD -- U0304
AD -- U0601
AD -- U0902
AD -- U1002
AD -- U1401

U0801 -- PG
U1303 -- PG
U0104 -- ML
U1101 -- ML

U0101 ..> U0104 : <<include>>
U0103 ..> U0104 : <<include>>

U0801 ..> U0701 : <<extend>>\n(chọn trả trực tuyến)
U0901 ..> U0701 : <<extend>>\n(có mã giảm giá)
U1301 ..> U0702 : <<extend>>\n(đơn đã giao,\ncòn thời hạn)
U1303 ..> U1302 : <<extend>>\n(duyệt trả hàng)

@enduml
```

---

## 6. Khác gì so với bản nháp trước

| Đã sửa | Chi tiết |
|---|---|
| Mã use case | Đánh lại theo phân hệ để khớp bảng phân công và cây `docs/ba/uc-NN.md` |
| Quan hệ | Bỏ bốn quan hệ sai, thêm hai include đúng nghĩa và bốn extend có điều kiện |
| Thiếu chức năng | Thêm quản lý tồn kho và nhập hàng, quản lý chương trình khuyến mãi, kiểm duyệt đánh giá, khôi phục mật khẩu |
| Tác nhân | Đăng ký và đăng nhập chuyển sang Khách vãng lai; đặt hàng và theo dõi đơn cũng sang Khách vãng lai vì có mua không cần tài khoản; tách yêu cầu đổi trả của khách khỏi duyệt đổi trả của nhân viên |
| Tên use case | Bỏ hết chi tiết kỹ thuật và giải pháp: đa diện, giữ chỗ tồn kho, qua cổng trực tuyến, thời gian thực và email, xác thực, tính giá, đối soát, nhật ký |
