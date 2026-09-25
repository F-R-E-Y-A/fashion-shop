---
title: Môi trường thử — dựng và vận hành
updated: 2026-09-24
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

Triển khai **không tự chạy khi đẩy mã**. Thứ tự là: gộp vào `develop` → CI chạy sáu chặng → CI xanh thì `cd-staging.yml` tự chạy → gọi Render dựng → đợi `/api/healthz` trả đúng mã commit vừa gộp → gọi thử một đường dẫn thật.

Làm vậy để lịch sử triển khai và thời gian từ commit tới khi lên môi trường thử đều nằm trong GitHub Actions, đúng thứ rubric TC2.6 đòi. Nếu để Render tự dựng khi thấy commit mới thì mã chưa qua kiểm cũng lên, và không có số liệu nào để nộp.

## Dựng lần đầu

### 1. Render, cho máy chủ

1. Đăng nhập Render bằng tài khoản GitHub, cho phép đọc tổ chức `F-R-E-Y-A`.
2. **New → Blueprint**, chọn kho `fashion-shop`. Render đọc `render.yaml` ở gốc và tạo hai thứ: dịch vụ web `fashion-shop-api` và cơ sở dữ liệu `fashion-shop-db`.
3. Render hỏi giá trị cho `CORS_ORIGINS` vì nó được đánh dấu `sync: false`. Chưa có địa chỉ Vercel thì điền tạm `http://localhost:5174`, xong bước 2 thì quay lại sửa.
4. Vào **Settings → Deploy Hook**, sao chép địa chỉ.

Biến `DATABASE_URL` do Render tự nối từ cơ sở dữ liệu, không phải điền tay.

### 2. Vercel, cho giao diện

1. Đăng nhập Vercel bằng GitHub, **Add New → Project**, chọn kho `fashion-shop`.
2. **Root Directory** đặt là `apps/web`. Vercel đọc `apps/web/vercel.json` cho lệnh cài và lệnh dựng, vì hai lệnh đó phải chạy từ gốc kho mã do dùng npm workspaces.
3. **Environment Variables**: thêm `VITE_API_URL` bằng `<địa chỉ Render>/api`. Biến `VITE_*` được nhúng vào mã **lúc dựng**, nên đổi địa chỉ máy chủ thì phải dựng lại, không sửa biến rồi khởi động lại là xong.
4. **Settings → Git**, đặt nhánh sản xuất là `develop`.
5. Quay lại Render sửa `CORS_ORIGINS` thành địa chỉ Vercel vừa có. Quên bước này thì trang tải được nhưng không gọi được API, và lỗi hiện trong bảng điều khiển trình duyệt chứ không hiện trên trang.

### 3. Khai báo trong GitHub

Trong kho, **Settings → Secrets and variables → Actions**:

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `RENDER_DEPLOY_HOOK_URL` | địa chỉ hook ở bước 1.4 |
| Variable | `STAGING_API_URL` | `https://fashion-shop-api.onrender.com` |
| Variable | `STAGING_WEB_URL` | địa chỉ Vercel |

Địa chỉ hook là một **bí mật**: ai có nó thì kích hoạt được triển khai. Đừng dán vào chat nhóm hay vào tài liệu.

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
