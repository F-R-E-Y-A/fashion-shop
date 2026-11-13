---
title: Môi trường thử — dựng và vận hành
updated: 2026-11-12
status: đang dùng
owner: Bảo
---
# Môi trường thử: dựng và vận hành

**Chức năng:** Dựng Render và Vercel lần đầu, luồng tự triển khai, sao lưu và khôi phục DB, xem log, quay về bản trước, bẫy đã biết.

Máy chủ chạy **Render**, giao diện chạy **Vercel**. Đây là lựa chọn **tạm** để có địa chỉ chạy được ngay trong tuần đầu và bắt đầu đếm số lần triển khai. Kế hoạch chuyển sang **Azure** từ S3, xem [TECH_DEBT.md](../../TECH_DEBT.md) mục ND-07.

| | Địa chỉ |
|---|---|
| Giao diện | điền sau khi tạo dự án Vercel |
| Máy chủ | điền sau khi tạo dịch vụ Render |
| Đặc tả API | `<máy chủ>/api/docs` |
| Tín hiệu sống | `<máy chủ>/api/healthz` |

## Ai bấm gì

Triển khai **tự chạy sau khi gộp vào `develop` và CI xanh**: CI chạy bảy chặng → `cd-staging.yml` gọi Render Deploy Hook → đợi `/api/healthz` trả đúng mã commit vừa gộp → gọi thử một đường dẫn thật. Render để `autoDeployTrigger: off` để không dựng hai lần cho cùng commit. Vercel theo dõi `develop` trực tiếp và tự dựng giao diện mỗi khi nhánh có commit mới.

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

Đặt trong **environment `staging`** (đã có sẵn): **Settings → Environments → staging**, mục **Environment secrets** và **Environment variables**. Job của `cd-staging.yml` khai `environment: staging` nên đọc được cả biến đặt ở đây lẫn biến cấp kho; đặt ở environment thì chỉ job triển khai thấy secret.

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `RENDER_DEPLOY_HOOK_URL` | địa chỉ hook ở bước 1.4 |
| Variable | `STAGING_API_URL` | địa chỉ Render cấp cho dịch vụ API, có thể có hậu tố sau tên. Đang dùng: `https://fashion-shop-api-rivi.onrender.com` (`gh variable list -e staging`, 12/11) |
| Variable | `STAGING_WEB_URL` | địa chỉ Vercel |

Địa chỉ hook là một **bí mật**: ai có nó thì kích hoạt được triển khai. Đừng dán vào chat nhóm, vào tài liệu hay vào khung chat với AI; tự dán vào ô secret của GitHub.

### 4. Nạp sản phẩm cho staging

Blueprint chỉ seed danh mục, màu, cỡ, thương hiệu, nên staging lúc đầu có 0 sản phẩm; CD vẫn xanh vì bước kiểm chỉ xem `items` là mảng. `npm run catalog:refresh` **không** dùng được cho staging: script chỉ chạy trên CSDL `localhost` ([refresh-approved-catalog.ts:132-134](../../../apps/api/scripts/refresh-approved-catalog.ts)) và đọc bảng `staging.*` chỉ có ở máy đã crawl.

Cách dùng: chép **8 bảng catalog** từ CSDL local đã nạp sản phẩm sang staging, giữ nguyên id. Tám bảng `brands`, `categories`, `colors`, `sizes`, `products`, `product_variants`, `product_images`, `inventory` chỉ khoá ngoại tới nhau, không chép người dùng hay đơn hàng.

1. **Xuất trên máy có dữ liệu** (Git Bash), tệp nằm ngoài Git:

   ```bash
   D=../work/staging-catalog-$(date +%Y%m%d); mkdir -p "$D"
   cat > "$D/catalog.sql" <<'SQL'
   DO $$ BEGIN
     IF (SELECT count(*) FROM public.products) > 0 OR (SELECT count(*) FROM public.orders) > 0 THEN
       RAISE EXCEPTION 'Staging da co san pham hoac don hang: dung lai, khong ghi de';
     END IF;
   END $$;
   TRUNCATE public.brands, public.categories, public.colors, public.sizes, public.products,
     public.product_variants, public.product_images, public.inventory CASCADE;
   SQL
   docker exec fashion-shop-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d fashion_shop --data-only --no-owner --no-privileges -t public.brands -t public.categories -t public.colors -t public.sizes -t public.products -t public.product_variants -t public.product_images -t public.inventory' >> "$D/catalog.sql"
   ```

   `pg_dump` cảnh báo khoá ngoại vòng ở `categories` (cột cha trỏ cùng bảng). Không sao nếu hàng cha nằm trước hàng con; kiểm bằng truy vấn so `ctid` của con với cha phải trả 0.
2. **Nạp lên staging** (PowerShell). Lấy **External Database URL** ở Render → `fashion-shop-db` → **Connect**, nhập bằng `Read-Host -MaskInput` để không lưu vào lịch sử lệnh. `-e DBURL` không kèm giá trị: docker lấy giá trị từ biến môi trường của phiên, nên URL không nằm trong dòng lệnh `docker` trên máy. Trong container, URL vẫn là tham số của `psql` tới khi lệnh xong; script ở mục "Sao lưu và khôi phục bằng script" tách URL thành biến `PG*` nên không còn chỗ hở này.

   ```powershell
   $env:DBURL = Read-Host -MaskInput 'External Database URL'
   docker cp ..\work\staging-catalog-<ngay>\catalog.sql fashion-shop-postgres:/tmp/catalog.sql
   docker exec -e DBURL fashion-shop-postgres sh -c 'psql "$DBURL" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/catalog.sql'
   docker exec fashion-shop-postgres rm /tmp/catalog.sql; Remove-Item Env:DBURL
   ```

   Cả tệp chạy trong một transaction: lỗi ở đâu thì không ghi gì. Staging đã có sản phẩm hoặc đơn hàng thì khối `DO` dừng ngay; muốn nạp lại thì người quyết xoá dữ liệu trước, không sửa khối chặn.

Diễn tập ngày 08/11 trên CSDL tạm đã migrate và seed giống Render: lần một nạp 90 sản phẩm (87 đang bán), 339 biến thể, 1199 ảnh, 339 dòng tồn; lần hai bị chặn; seed chạy lại sau đó không lỗi. Ảnh sản phẩm vẫn là địa chỉ của nguồn crawl, kiểm quyền dùng ảnh trước khi mở staging cho người ngoài nhóm.

### 5. Chạy thử CD lần đầu

Render triển khai nhánh `develop`, nên CD chỉ kiểm được đầu cuối sau khi có một lần gộp vào `develop`. Sau khi đặt đủ secret và variable: **Actions → CD staging → Run workflow** trên `develop`. Lượt xanh có ba bước: gọi hook, `/api/healthz` trả đúng `gitSha` của commit `develop`, `GET /api/products` trả đúng hình dạng. Bảng tóm tắt của lượt chạy ghi địa chỉ máy chủ, giao diện và đặc tả API.

## Dữ liệu và backup

Prisma migration trong `apps/api/docker-entrypoint.sh` chỉ tạo và cập nhật cấu trúc DB. `SEED_ON_START=true` chỉ upsert danh mục và bảng tra cứu, **không nạp sản phẩm đã crawl trên máy local**. Muốn staging hiển thị sản phẩm, phải nhập dữ liệu riêng sau khi có DB và kiểm tra quyền sử dụng ảnh; không trỏ staging vào DB local.

Blueprint hiện khai báo PostgreSQL 17 gói **Free** ([render.yaml:65-68](../../../render.yaml)). Render Free không có backup/PITR và DB hết hạn sau 30 ngày; vì vậy không dùng nó để giữ dữ liệu quan trọng hoặc coi là môi trường liên tục dài hạn. Quyết định gói DB và nơi lưu bản sao ngoài Render phải chốt trước khi nạp dữ liệu không thể tạo lại.

| Phương án | Cách bảo vệ và khôi phục | Điểm cần lưu ý |
|---|---|---|
| DB trả phí trên Render | Render tự sao lưu liên tục với PITR: workspace Hobby khôi phục trong 3 ngày, Pro trở lên 7 ngày. Thử khôi phục sang DB mới trước khi chuyển `DATABASE_URL`. Xuất thêm `pg_dump` ra nơi lưu ngoài Render để giữ lâu. | Có phí; PITR ngắn hạn và không thay thế bản sao lưu ngoài nhà cung cấp. |
| DB Free cho demo tạm | Chạy `pg_dump -Fc` định kỳ từ máy/runner bên ngoài bằng external DB URL, lưu file mã hóa ở nơi khác, giữ bản theo chính sách và thử `pg_restore` vào DB trống. | Phải tự vận hành lịch chạy, lưu trữ và cảnh báo; không có PITR, có thể mất dữ liệu từ lần dump gần nhất; DB vẫn hết hạn. |

Không đưa database URL hoặc file dump vào Git. Trước migration có rủi ro và trước nhập dữ liệu lớn, tạo backup và thử đọc bằng `pg_restore -l`; định kỳ thử phục hồi vào DB tách biệt. Mục HT-08 trong kế hoạch nhóm gồm lịch backup, script restore và diễn tập: script và diễn tập trên máy đã có (bên dưới), lịch chạy định kỳ thì chưa. Staging chỉ có bản sao lưu khi Bảo chạy bước 1 với URL thật.

### Sao lưu và khôi phục bằng script

`tools/db/backup-db.ps1` và `tools/db/restore-db.ps1` chỉ hỏi URL rồi gọi hàm trong `tools/db/pg-backup.psm1`. Cần PowerShell 7 (`pwsh`) và Docker Desktop đang chạy: `pg_dump` và `pg_restore` 17 chạy trong image `postgres:17-alpine` đã có trên máy, script không tự tải image. URL nhập qua ô che ký tự (`Read-Host -MaskInput`), không nhận qua tham số, không in, không ghi ra đĩa. Script tách URL thành biến `PG*` và chuyển vào container bằng `-e TÊN`, nên mật khẩu không nằm trong dòng lệnh nào; xong lệnh thì xoá biến. Phần còn hở ghi ở [pg-backup.psm1:88-92](../../../tools/db/pg-backup.psm1#L88). Host ngoài máy mặc định `sslmode=require` ([pg-backup.psm1:56-59](../../../tools/db/pg-backup.psm1#L56)): mã hoá đường truyền nhưng không kiểm chứng chỉ.

1. **Sao lưu.** Ở gốc kho:

   ```powershell
   ./tools/db/backup-db.ps1          # đổi chỗ lưu: -OutDir <thư mục ngoài kho>
   ```

   Dán **External Database URL** (Render → `fashion-shop-db` → **Connect**; URL Internal chỉ dùng được bên trong Render). File `staging-db-<yyyyMMdd-HHmmss>.dump` (định dạng custom) nằm ở `../work/backups/staging-db/` cạnh thư mục kho chính, kể cả khi chạy từ worktree; thư mục nằm trong kho bị từ chối. Script ghi ra `.partial`, đọc lại bằng `pg_restore --list`, đọc được mới đổi tên thành `.dump`. Sau đó in kích thước, SHA-256, số mục TOC, số bảng và `SourceRows`, tức số dòng `products`, `product_variants`, `users`, `orders` đếm ngay sau khi dump. Ghi lại tên file, SHA-256 và `SourceRows`.
2. **Giữ bản sao mã hoá ngoài máy.** File chứa email và mật khẩu đã băm của người dùng: chỉ mang ra khỏi máy ở dạng mã hoá, không gửi qua chat. Nơi lưu, cách mã hoá, thời gian giữ: [TBD — hỏi Bảo].
3. **Khôi phục vào DB mới trước ngày hết hạn** [TBD — Bảo xem ngày hết hạn trên Render]. DB đích phải trống và chạy PostgreSQL 17 trở lên. Đặt DB đích ở đâu: [TBD — hỏi Bảo: Render trả phí, Render Free mới hay nhà cung cấp khác].

   ```powershell
   ./tools/db/restore-db.ps1 -DumpFile ..\work\backups\staging-db\staging-db-<ngày-giờ>.dump
   ```

   Dán URL của DB **đích**. Script đọc lại file, dừng nếu đích dưới PostgreSQL 17 hoặc đã có bảng trong `public`, `staging`, `reporting`, rồi chạy `pg_restore --no-owner --no-acl --single-transaction --exit-on-error` ([pg-backup.psm1:295-304](../../../tools/db/pg-backup.psm1#L295)). User của DB đích thành chủ mọi đối tượng; lỗi ở đâu thì rollback cả lượt, DB đích giữ nguyên.
4. **Kiểm.** So `TargetRows` script in ra với `SourceRows` ở bước 1. Sau khi API trỏ sang DB mới: `/api/healthz` trả lời, `GET /api/products` có sản phẩm, đăng nhập được bằng một tài khoản cũ.

**Thứ tự khi chuyển hẳn sang DB mới.** Tạm dừng API (Render → dịch vụ → **Suspend**) rồi mới sao lưu lần cuối, để không có ghi mới sau lúc dump. Khôi phục **trước khi** API trỏ vào DB mới: API khởi động là chạy `prisma migrate deploy` rồi seed ([docker-entrypoint.sh:6-13](../../../apps/api/docker-entrypoint.sh)), DB đích có bảng thì script dừng. Khôi phục và kiểm xong mới đổi `DATABASE_URL` của API (Blueprint đang lấy từ `fashion-shop-db`, [render.yaml:35-38](../../../render.yaml)) rồi **Resume**. Đã lỡ thì chạy lại với `-Force`: script bắt gõ lại `<nhãn đầu của host>/<tên DB>` của DB đích, vì DB cũ và mới tạo từ cùng Blueprint đều tên `fashion_shop` ([render.yaml:66](../../../render.yaml)), rồi thêm `--clean --if-exists` để xoá và tạo lại mọi đối tượng có trong file dump trong cùng transaction; đối tượng không có trong dump giữ nguyên. Bảng `_prisma_migrations` đi theo dump, nên `migrate deploy` lần sau không còn migration nào để chạy (suy luận, chưa chạy Prisma trên DB khôi phục).

Diễn tập ngày 12/11 trên máy, không chạm Render. Nguồn là DB dev `fashion_shop` (chỉ đọc); đích là DB tạm `fs_backup_restore_check` thuộc một role **không** phải superuser, mô phỏng user Render sở hữu DB (suy luận). Dump 1,37 MB, 362 mục TOC, 56 bảng. Khôi phục vào DB trống cho `products=90, product_variants=339, users=4, orders=22` và 15 dòng `_prisma_migrations`, khớp nguồn; 200 quan hệ đều thuộc role đích. Lần hai không `-Force` bị chặn; `-Force` khôi phục lại vẫn khớp; sai mật khẩu thì dừng, không để `.partial`, không in mật khẩu. Hai wrapper chạy đầu-cuối với `Read-Host` giả lập; ô che ký tự thật chưa gõ tay. DB và role tạm đã xoá.

## Xem log và sửa khi hỏng

| Việc | Ở đâu |
|---|---|
| Log máy chủ | Render → dịch vụ → tab **Logs** |
| Log dựng giao diện | Vercel → dự án → **Deployments** → chọn lượt |
| Log triển khai | GitHub → **Actions** → **CD staging** |
| Quay về bản trước | Render → **Events** → lượt cũ → **Rollback**; Vercel → **Deployments** → lượt cũ → **Promote to Production** |

## Bảy cái bẫy đã biết

**Gọi lần đầu rất chậm.** Gói miễn phí của Render cho máy chủ ngủ sau một thời gian không ai dùng, đánh thức mất khoảng một phút. Lúc trình bày thì mở trang trước vài phút. Bước đợi trong `cd-staging.yml` đã cho tới 10 phút vì lý do này.

**Máy chủ treo hẳn sau một quãng không ai gọi.** Ngày 08/11 API treo nhiều lần: log dừng, `/api/healthz` giữ kết nối mà không trả lời, Restart không sinh dòng log nào, chỉ Manual Deploy chữa được. Lần có request đều đặn (gọi `healthz` mỗi 30 giây, 19:24–19:55) thì không treo; các lần treo quan sát được đều sau một quãng log không có request (sau 12:32, sau 21:51). Bản có cache catalog (`489b0b3`) vẫn treo, nên không phải do nạp catalog. Nguyên nhân phía Render chưa rõ (suy luận: đánh thức thất bại), chưa gửi ticket. Cách giữ: một dịch vụ ping ngoài (Bảo chọn UptimeRobot) gọi `/api/healthz` khoảng 5–10 phút một lần [TBD — Bảo xác nhận đã bật]. Treo thì Render → **Manual Deploy → Deploy latest commit**.

**Sửa `render.yaml` là Render tự deploy.** Dịch vụ do Blueprint quản lý, nên khi `render.yaml` trên `develop` đổi, Render đồng bộ và dựng lại ngay lúc gộp (trigger "Blueprint"), dù `autoDeployTrigger: off`. Lượt CD sau đó gọi hook dựng thêm một lần nữa; không hại, chỉ tốn vài phút.

**Đổi địa chỉ máy chủ phải dựng lại giao diện.** Xem bước 2.3.

**Quên sửa `CORS_ORIGINS`.** Triệu chứng: trang hiện nhưng không có dữ liệu, bảng điều khiển trình duyệt báo lỗi CORS. Sửa trong Render rồi khởi động lại dịch vụ.

**`gitSha` trả `unknown`.** Render không truyền `--build-arg GIT_SHA`, còn `apps/api/Dockerfile` luôn đặt `GIT_SHA` với mặc định `unknown`. Trước 06/11, `/api/healthz` trả `unknown` thay vì `RENDER_GIT_COMMIT` nên CD đợi đủ 10 phút rồi báo lỗi dù bản mới đã chạy; `runningSha` trong `health.controller.ts` nay bỏ qua giá trị rỗng và `unknown`.

**CD kẹt hàng giờ khi máy chủ treo.** Trước 08/11, bước đợi gọi `curl` không có `--max-time` và job không có `timeout-minutes`: máy chủ treo thì `curl` chờ mãi, giữ nhóm `concurrency: cd-staging` và chặn lượt CD của lần gộp sau (run 42489840316 kẹt hơn một giờ, phải huỷ tay). Nay mỗi `curl` có trần, vòng đợi tính hạn 10 phút theo đồng hồ, cả job tối đa 20 phút.

## Chạy cả cụm trên máy như môi trường thật

Không cần Render để thử cấu hình sản xuất:

```bash
npm run prod:up      # dựng hai image rồi chạy cùng Postgres
npm run prod:down
```

Xong thì mở `http://localhost:8080` thấy giao diện, `http://localhost:3001/api/healthz` thấy tín hiệu sống. Đây cũng chính là thứ sẽ đem sang Azure ở S3.
