---
title: Môi trường thử — dựng và vận hành
updated: 2026-10-03
status: đang dùng
owner: Bảo
---
# Môi trường thử: dựng và vận hành

**Chức năng:** Dựng môi trường thử Render và Vercel lần đầu, luồng tự triển khai, xem log, quay về bản trước, ba cái bẫy đã biết.

Máy chủ chạy **Render**, giao diện chạy **Vercel**. Đây là lựa chọn **tạm** để có địa chỉ chạy được ngay trong tuần đầu và bắt đầu đếm số lần triển khai. Kế hoạch chuyển sang **Azure** từ S3, xem [TECH_DEBT.md](../../TECH_DEBT.md) mục ND-07.

| | Địa chỉ |
|---|---|
| Giao diện | điền sau khi tạo dự án Vercel |
| Máy chủ | điền sau khi tạo dịch vụ Render |
| Đặc tả API | `<máy chủ>/api/docs` |
| Tín hiệu sống | `<máy chủ>/api/healthz` |

## Ai bấm gì

Triển khai **tự chạy sau khi gộp vào `develop` và CI xanh**: CI chạy sáu chặng → `cd-staging.yml` gọi Render Deploy Hook → đợi `/api/healthz` trả đúng mã commit vừa gộp → gọi thử một đường dẫn thật. Render để `autoDeployTrigger: off` để không dựng hai lần cho cùng commit. Vercel theo dõi `develop` trực tiếp và tự dựng giao diện mỗi khi nhánh có commit mới.

Làm vậy để lịch sử triển khai và thời gian từ commit tới khi lên môi trường thử đều nằm trong GitHub Actions, đúng thứ rubric TC2.6 đòi. Nếu để Render tự dựng khi thấy commit mới thì mã chưa qua kiểm cũng lên, và không có số liệu nào để nộp.

## Dựng lần đầu

### 1. Render, cho máy chủ

1. Đăng nhập Render bằng tài khoản GitHub, cho phép đọc tổ chức `F-R-E-Y-A`.
2. **New → Blueprint**, chọn kho `fashion-shop`, nhánh `develop`. Render đọc `render.yaml` ở gốc và tạo API, PostgreSQL và Key Value dùng cho Redis. Blueprint phải được tạo từ commit đã có đầy đủ biến môi trường; chưa được đẩy lên GitHub thì dashboard vẫn đọc bản cũ.
3. Render hỏi `CORS_ORIGINS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` vì được đánh dấu `sync: false`. Điền CORS tạm `http://localhost:5174` nếu chưa có Vercel URL. SMTP phải là dịch vụ thực sự dùng được trên cổng ngoài `25`, `465`, `587` (Render Free chặn ba cổng này). Nếu SMTP cần xác thực, thêm `SMTP_USER` và `SMTP_PASS` trong Environment của Render; tuyệt đối không ghi mật khẩu vào repo. Với Blueprint đã tạo từ trước, các biến `sync: false` mới phải thêm thủ công trong dashboard.
4. Vào **Settings → Deploy Hook**, sao chép địa chỉ.

`DATABASE_URL` và `REDIS_URL` do Blueprint tự nối; ba secret `JWT_ACCESS_SECRET`, `OTP_PEPPER`, `RATE_LIMIT_PEPPER` được Render tạo. `TRUST_PROXY_HOPS=1` theo cấu hình một reverse proxy. Kiểm tra tất cả trong Environment trước khi deploy, không sao chép giá trị bí mật ra tài liệu.

### 2. Vercel, cho giao diện

1. Đăng nhập Vercel bằng GitHub, **Add New → Project**, chọn kho `fashion-shop`.
2. **Root Directory** đặt là `apps/web`. Vercel đọc `apps/web/vercel.json` cho lệnh cài và lệnh dựng, vì hai lệnh đó phải chạy từ gốc kho mã do dùng npm workspaces.
3. **Environment Variables**: thêm `VITE_API_URL` bằng `<địa chỉ Render>/api`. Biến `VITE_*` được nhúng vào mã **lúc dựng**, nên đổi địa chỉ máy chủ thì phải dựng lại, không sửa biến rồi khởi động lại là xong.
4. **Settings → Environments → Production → Branch Tracking**, đặt nhánh sản xuất là `develop`. Đây là thiết lập trong Vercel dashboard, `vercel.json` không đặt được nhánh này.
5. Quay lại Render sửa `CORS_ORIGINS` thành địa chỉ Vercel vừa có. Quên bước này thì trang tải được nhưng không gọi được API, và lỗi hiện trong bảng điều khiển trình duyệt chứ không hiện trên trang.

### 3. Khai báo trong GitHub

Trong kho, **Settings → Secrets and variables → Actions**:

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `RENDER_DEPLOY_HOOK_URL` | địa chỉ hook ở bước 1.4 |
| Variable | `STAGING_API_URL` | `https://fashion-shop-api.onrender.com` |
| Variable | `STAGING_WEB_URL` | địa chỉ Vercel |

Địa chỉ hook là một **bí mật**: ai có nó thì kích hoạt được triển khai. Đừng dán vào chat nhóm hay vào tài liệu.

## Dữ liệu và backup

Prisma migration trong `apps/api/docker-entrypoint.sh` chỉ tạo và cập nhật cấu trúc DB. `SEED_ON_START=true` chỉ upsert danh mục và bảng tra cứu, **không nạp sản phẩm đã crawl trên máy local**. Muốn staging hiển thị sản phẩm, phải nhập dữ liệu riêng sau khi có DB và kiểm tra quyền sử dụng ảnh; không trỏ staging vào DB local.

Blueprint hiện khai báo PostgreSQL **Free**. Render Free không có backup/PITR và DB hết hạn sau 30 ngày; vì vậy không dùng nó để giữ dữ liệu quan trọng hoặc coi là môi trường liên tục dài hạn. Quyết định gói DB và nơi lưu bản sao ngoài Render phải chốt trước khi nạp dữ liệu không thể tạo lại.

| Phương án | Cách bảo vệ và khôi phục | Điểm cần lưu ý |
|---|---|---|
| DB trả phí trên Render | Render tự sao lưu liên tục với PITR: workspace Hobby khôi phục trong 3 ngày, Pro trở lên 7 ngày. Thử khôi phục sang DB mới trước khi chuyển `DATABASE_URL`. Xuất thêm `pg_dump` ra nơi lưu ngoài Render để giữ lâu. | Có phí; PITR ngắn hạn và không thay thế bản sao lưu ngoài nhà cung cấp. |
| DB Free cho demo tạm | Chạy `pg_dump -Fc` định kỳ từ máy/runner bên ngoài bằng external DB URL, lưu file mã hóa ở nơi khác, giữ bản theo chính sách và thử `pg_restore` vào DB trống. | Phải tự vận hành lịch chạy, lưu trữ và cảnh báo; không có PITR, có thể mất dữ liệu từ lần dump gần nhất; DB vẫn hết hạn. |

Không đưa database URL hoặc file dump vào Git. Trước migration có rủi ro và trước nhập dữ liệu lớn, tạo backup và thử đọc bằng `pg_restore -l`; định kỳ thử phục hồi vào DB tách biệt. Mục HT-08 trong kế hoạch nhóm mới là việc xây lịch backup, script restore và diễn tập, chưa phải bằng chứng rằng staging đã có backup.

## Xem log và sửa khi hỏng

| Việc | Ở đâu |
|---|---|
| Log máy chủ | Render → dịch vụ → tab **Logs** |
| Log dựng giao diện | Vercel → dự án → **Deployments** → chọn lượt |
| Log triển khai | GitHub → **Actions** → **CD staging** |
| Quay về bản trước | Render → **Events** → lượt cũ → **Rollback**; Vercel → **Deployments** → lượt cũ → **Promote to Production** |

## Ba cái bẫy đã biết

**Gọi lần đầu rất chậm.** Gói miễn phí của Render cho máy chủ ngủ sau một thời gian không ai dùng, đánh thức mất khoảng một phút. Lúc trình bày thì mở trang trước vài phút. Bước đợi trong `cd-staging.yml` đã cho tới 10 phút vì lý do này.

**Đổi địa chỉ máy chủ phải dựng lại giao diện.** Xem bước 2.3.

**Quên sửa `CORS_ORIGINS`.** Triệu chứng: trang hiện nhưng không có dữ liệu, bảng điều khiển trình duyệt báo lỗi CORS. Sửa trong Render rồi khởi động lại dịch vụ.

## Chạy cả cụm trên máy như môi trường thật

Không cần Render để thử cấu hình sản xuất:

```bash
npm run prod:up      # dựng hai image rồi chạy cùng Postgres
npm run prod:down
```

Xong thì mở `http://localhost:8080` thấy giao diện, `http://localhost:3001/api/healthz` thấy tín hiệu sống. Đây cũng chính là thứ sẽ đem sang Azure ở S3.
