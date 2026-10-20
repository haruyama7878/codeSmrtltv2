# Triển khai database trên server (k3s) — tài liệu vận hành

## Kiến trúc
Mọi thứ chạy trên server `118.70.169.236` (SSH port 1912, user `sonvx`), trong k3s namespace `default`:

| Thành phần | Cách chạy | Port nội bộ | Port ngoài |
|---|---|---|---|
| PostgreSQL 14 (drizzle app) | StatefulSet `pg-db` + PVC `pg-db-data` (20Gi, local-path) | NodePort **30432** | bị NAT chặn |
| Supabase Auth (GoTrue v2.170 + nginx sidecar) | Deployment `supabase-auth` | NodePort **30800** | bị NAT chặn |
| App Next.js production | process node trên host, `~/app` | **3456** | cần mở port nếu truy cập ngoài LAN |

- DB `app_db` → bảng app: `users` (mã ID học sinh dựa trên ID người dùng duy nhất), `lessons`, `quiz_attempts`, `daily_activity`, `classrooms`, `classroom_memberships`, `classroom_invitations`, `classroom_assignments`, `assignment_submissions` (drizzle-kit push).
- DB `supabase_auth` → schema `auth` của GoTrue (tự migrate).
- GoTrue được đặt sau nginx sidecar để strip prefix `/auth/v1`.
- App Next.js dùng **rewrite proxy** `/auth/v1/*` → `127.0.0.1:30800` (cùng origin, chỉ cần mở 1 port).

## Endpoints
- Supabase Auth (qua tunnel / nội bộ): `http://localhost:30800` hoặc `http://127.0.0.1:30800`
- PostgreSQL: `postgresql://postgres:<DB_PASSWORD>@<host>:30432/app_db`
- App trên server: `http://192.168.167.251:3456` (LAN), `http://127.0.0.1:3456` (server)

## Secret
Xem `d:\Games\rrr\.env.local` / `.env.production` và manifest `~/deploy/*.yaml` trên server.
- `DB_PASSWORD`, `JWT_SECRET`, `OPERATOR_TOKEN`, `ANON_KEY`, `SERVICE_ROLE_KEY`
- Đổi secret = sửa manifest + `.env`, restart pod, **tạo lại ANON_KEY/SERVICE_ROLE_KEY** bằng `generate-secrets.js`.

## Local dev (máy Windows)
1. Cấu hình `.env.local` theo mẫu `.env.example`: dùng Project URL và Publishable key của Supabase Cloud cho `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_INTERNAL_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Tải chứng chỉ CA database chính thức từ [Supabase](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt) hoặc Settings → Database → SSL Configuration trong project Supabase, lưu vào `D:\Games\rrr\supabase-root.crt`. Lấy connection string **Session pooler** trong Project → Connect, lưu vào `SUPABASE_DATABASE_URL`; dùng `sslmode=verify-full` và `sslrootcert` trỏ tới chứng chỉ đã tải (URI-encode đường dẫn Windows). Giữ `DATABASE_URL` trỏ tới PostgreSQL cũ cho tới khi hoàn tất chuyển dữ liệu. Không tắt kiểm tra chứng chỉ, commit hoặc chia sẻ các connection string có mật khẩu.
3. Tạo các bảng của ứng dụng trong Supabase Cloud bằng `npm run db:push`.
4. Xem trước dữ liệu cũ bằng `npm run db:migrate:legacy`; sau khi xác nhận project đích và schema, chạy `npm run db:migrate:legacy -- --execute` để sao chép hồ sơ, tiến độ, bài học, lớp và bài làm. Các bảng ứng dụng ở database đích phải còn trống; chạy lệnh seed curriculum sau khi chuyển dữ liệu.
5. Trong Supabase Authentication → URL Configuration, đặt Site URL `http://localhost:3000` và cho phép callback `http://localhost:3000/**`. Người dùng cần đăng ký lại trên Cloud bằng email cũ để hồ sơ và tiến độ đã chuyển được liên kết; tài khoản của Supabase tự host cũ không được tự chuyển.
6. Khởi chạy app: `npm run dev` → `http://localhost:3000`.
7. Cài và khởi chạy Ollama, bảo đảm đã có model `minicpm-v:latest` (`ollama pull minicpm-v:latest` nếu chưa có). Ollama mặc định được gọi tại `http://localhost:11434`; có thể ghi đè bằng `OLLAMA_BASE_URL` và `OLLAMA_MODEL`.
8. Áp dụng schema bằng `npm run db:push`, sau đó nạp/cập nhật danh mục 40 bài học: `npm run db:seed`. Khi có cả hai biến, lệnh seed dùng `SUPABASE_DATABASE_URL` (cùng database với app) thay vì database legacy trong `DATABASE_URL`. Lượt làm bài mới có khóa ngoại tới bài học đã xuất bản; lệnh seed cũng nối các lượt cũ có slug khớp duy nhất.

Khi chạy production, tiến trình Next.js cũng cần truy cập được Ollama. Thiết lập `OLLAMA_BASE_URL` trỏ đến Ollama từ máy chạy Next.js và `OLLAMA_MODEL` nếu dùng model khác.

Khi cập nhật schema, áp dụng schema lên database được cấu hình bằng `npm run db:push` trước khi dùng các API liên quan.

### Thư viện ảnh và tách nền
- Thư viện ảnh bài tập được đọc từ `library/canh_vat` và `library/do_vat`; giữ hai thư mục này trong bản triển khai.
- Tách nền dùng dịch vụ `rembg` tự host, không gửi ảnh tới nhà cung cấp bên ngoài. Cài/chạy rembg trên máy mà app Next.js truy cập được, ví dụ `rembg s --host 0.0.0.0 --port 7000`.
- Đặt `REMBG_API_URL` trong môi trường của Next.js trỏ tới endpoint rembg, ví dụ `http://127.0.0.1:7000/api/remove`. Endpoint nhận multipart field `file` và trả ảnh PNG hoặc WebP có alpha trong response body. Nếu rembg chưa được cấu hình, thao tác tách nền sẽ báo lỗi cấu hình thay vì giả lập thành công.
- Tệp tải lên được thu nhỏ/nén trong trình duyệt; ảnh được lưu cùng nội dung câu hỏi của bài tập.

## Deploy lên server
```bash
# đóng gói (loại node_modules/.next/ui_game_level deploy-k8s)
tar -czf app-src.tar.gz --exclude=node_modules --exclude=.next --exclude=ui_game_level --exclude=deploy-k8s --exclude=.env.local --exclude=tsconfig.tsbuildinfo .
scp -P 1912 app-src.tar.gz sonvx@118.70.169.236:~/
ssh -p 1912 sonvx@118.70.169.236 "rm -rf ~/app && mkdir -p ~/app && tar -xzf ~/app-src.tar.gz -C ~/app && cd ~/app && npm ci && npm run build"
ssh -p 1912 sonvx@118.70.169.236 "cd ~/app && (nohup env HOSTNAME=0.0.0.0 PORT=3456 npm run start > app.log 2>&1 &)"
# ui_game_level/src phải upload riêng nếu đổi:
tar -czf game-src.tar.gz -C ui_game_level src && scp -P 1912 game-src.tar.gz sonvx@118.70.169.236:~/ && ssh -p 1912 sonvx@118.70.169.236 "tar -xzf ~/game-src.tar.gz -C ~/app/ui_game_level"
```

## Ghi chú quan trọng
- Server nằm sau NAT: từ Internet chỉ mở port **1912 (SSH)**. Muốn truy cập app từ ngoài phải nhờ quản trị mạng forward 1 port (vd 3456) vào máy, rồi đổi `NEXT_PUBLIC_SUPABASE_URL` trong `.env.production` thành địa chỉ công khai + build lại.
- Không chạy app ở port 3000 (đã có service khác dùng). Các port 5430/5431/5435/15432 là của hệ thống lab, đừng đụng vào.
- Pod app (nohup) không tự khởi động khi máy reboot — dùng `~/app/start.sh`.
- `sonvx` không có sudo/docker; mọi thứ chạy qua k3s (toàn quyền namespace `default`).
