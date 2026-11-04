# Google Sign-in và logging miễn phí

## Trạng thái triển khai (30/10/2026)

- Billing dashboard: Workers Free active, không có payment method; Observability đang Free. Không nâng cấp/hủy Workers.
- Baseline dashboard lúc khoảng 10:19 giờ Việt Nam: 0,02/0,50 GB hôm nay; chu kỳ 01–31/10 có 0,46 GB, 514,3K events, trung bình 887 bytes; Workers Logs chiếm 100%. Đây là số đo tại thời điểm kiểm tra, không phải dự báo chi phí.
- Nguồn nhiễu quan sát được: log Nest khởi động/ánh xạ route lặp lại, cùng invocation logs. Bản mới tắt hai nguồn này; cron mỗi phút vẫn giữ nguyên nghiệp vụ.
- Migration `20261030120000_google_oauth.sql` đã áp dụng cho schema `travel_cloud`; runtime role xác minh kết nối được, 2 người dùng hiện có được giữ nguyên.
- Backend Cloudflare hiện deploy version `1aa2df3f-7c76-4aaf-baaf-ff1bf4566841`; health/revision/planner smoke test đã qua. Settings đã xác nhận logs sampling 100%, invocation logs tắt, traces/issues tắt, query string được che.
- Web Vercel production deployment `dpl_7gMv6aiFM8ydRWR2HkKdKAEKJi3x` đã READY và alias về URL hiện có, bao gồm trang `/privacy`.
- Chủ tài khoản đã bật 2SV và xác nhận Google API Services: User Data Policy. Google Auth Platform đã cấu hình trong project `Travel Planner Auth` (`travel-planner-auth-513203`, project number `699577140047`), branding `Horizon Travel Planner`, External audience.
- Đã tạo client `Horizon Web Production` và `Horizon Web Local`, mỗi client chỉ có origin/callback tương ứng như hướng dẫn. Secret production đã vào Cloudflare; client local đã vào `.env` (mode 0600, Git ignored). Không bật Billing/free trial.
- Data Access chỉ có openid, userinfo.email và userinfo.profile, không có sensitive/restricted scope. Audience đã chuyển sang **In production** sau khi chủ dự án đồng ý phát hành công khai.
- Trang `/privacy` song ngữ đã được chủ dự án duyệt, deploy và kiểm tra HTTP 200. Branding đã lưu homepage/privacy URL production và domain tương ứng.
- Google OAuth backend đã bật (version hiện tại ghi ở trên, marker `google-oauth-20261030`); `/api/auth/providers` trả google=true. Client local cũng bật qua `.env`.
- Smoke Google thật trên production đã thành công: callback về `/plan`, menu hiển thị đúng tài khoản, tải lại trang giữ phiên, đăng xuất và đăng nhập lại thành công. Không tạo lịch trình/AI job trong quá trình smoke.
- Google OAuth hiện bật với Google Audience Production; Grafana adapter đã kiểm thử với HTTP giả lập; chưa có Grafana credentials để kiểm tra ingest thật.

## Giới hạn và nguyên tắc chi phí

Google OAuth trực tiếp dùng `openid email profile`; không đăng ký Firebase/Identity Platform/Supabase Auth. Chi phí compute, database và băng thông của hệ thống vẫn độc lập.

Cloudflare Observability Free theo chính sách từ 01/12/2026: 0,5 GB/ngày, retention 7 ngày; ngừng ingest khi hết quota, reset 00:00 UTC (07:00 Việt Nam). Không tự nâng cấp. Grafana Cloud Free: 50 GB logs/tháng, retention 14 ngày; 14 ngày là thời gian giữ log, không phải thời hạn sử dụng gói. Mục tiêu vận hành: dưới 0,25 GB/ngày; kiểm tra Billing sau mọi thay đổi plan. Cảnh báo không phải hard spending cap.

Nguồn: https://developers.cloudflare.com/observability/pricing/ và https://grafana.com/pricing/

## Bật Google trên local

1. Tạo Google Cloud project/OAuth clients loại Web application, tách client local và production. Chỉ dùng scopes `openid email profile`.
2. Local: authorized origin `http://localhost:3000`, redirect URI chính xác `http://localhost:3000/api/auth/google/callback`. Nếu dùng `127.0.0.1`, đăng ký riêng URL đó và cập nhật cấu hình tương ứng; không trộn hai hostname.
3. Đặt trong `.env` (không commit): `GOOGLE_AUTH_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. `.env.example` có placeholders. Restart server.
4. Chạy bootstrap local hiện có để áp dụng migration và RLS policies. Dùng role ứng dụng riêng, không dùng admin làm runtime.
5. `GET /api/auth/providers` phải trả `{"google":true}`. Nút Google trên login/signup tự hiện; khi cấu hình thiếu sẽ ẩn.

## Bật Google trên production

1. Cấu hình Google Auth Platform: thông tin ứng dụng, audience, support email, domain và URL chính sách/điều khoản do chủ dự án duyệt. Xử lý xác minh nếu Google yêu cầu; chọn trạng thái production khi phát hành công khai. Không thêm scopes Drive/Gmail/Calendar.
2. Origin: `https://ai-powered-travel-planner-api.vercel.app`.
3. Redirect URI: `https://ai-powered-travel-planner-api.vercel.app/api/auth/google/callback`. Callback đi qua Next proxy để cookie thuộc web origin. Không dùng trực tiếp Worker URL làm callback, không wildcard preview URLs.
4. Thêm secrets qua prompt, không dán vào chat/Git/command arguments:

   ```sh
   pnpm dlx wrangler@4.155.0 secret put GOOGLE_CLIENT_ID --config apps/server/wrangler.jsonc
   pnpm dlx wrangler@4.155.0 secret put GOOGLE_CLIENT_SECRET --config apps/server/wrangler.jsonc
   ```

5. Đổi `vars.GOOGLE_AUTH_ENABLED` thành `"true"` trong Wrangler, giữ `AUTH_PROVIDER=local`; deploy backend qua pipeline hiện có. Các lần deploy sau phải giữ flag này trong source; không chỉ sửa dashboard rồi để deploy ghi đè.
6. Kiểm tra `/api/auth/providers`, đăng nhập Google thật bằng thao tác người dùng, đăng xuất/đăng nhập lại và kiểm tra lịch trình. Không dùng user thật cho kiểm thử phá hủy. Không ghi/copy code hoặc token callback vào báo cáo.
7. Khi email trùng: đăng nhập tài khoản cũ, menu tài khoản → Liên kết Google → xác nhận mật khẩu → chọn Google cùng email. Việc xác nhận hết hạn sau 5 phút và phụ thuộc phiên chưa bị thu hồi. Không tự merge email. Identity dựa trên Google `sub`, không dựa trên email.
8. Tài khoản chỉ Google có `password_hash=null`; password login trả lỗi bình thường. Muốn đặt mật khẩu dùng luồng quên mật khẩu hiện có, yêu cầu SMTP hoạt động.

## Logging và chuyển Grafana

- `LOG_SINK=cloudflare` mặc định: log JSON warn/error, không log request thành công/cron rỗng. Nest production không log payload/stack/message tùy ý. Mỗi dòng tối đa 4 KB; chỉ có event, severity, time, requestId/jobId, code, durationMs.
- `LOG_SINK=off`: tắt application logs. Không bảo đảm tắt mọi log hệ thống hoặc mọi dataset khác trong account.
- `LOG_SINK=grafana`: xuất application logs trực tiếp tới Loki bằng HTTPS, không dùng Cloudflare Logpush/OTel export có phí riêng. Tối đa 20 dòng/invocation; phần dư bị bỏ. `waitUntil` ở Workers, timeout 2 giây, không retry, không ghi trùng Cloudflare; lỗi sink không làm hỏng API/job.
- Secret `GRAFANA_LOKI_TOKEN` chỉ cần quyền ghi log; `GRAFANA_LOKI_USER` lấy từ Grafana Cloud. `GRAFANA_LOKI_URL` phải là URL ingestion chính thức dạng `https://<logs-host>.grafana.net/loki/api/v1/push`, không có query/credentials trong URL. Đặt ba giá trị bằng `wrangler secret put`; không đưa lên frontend.
- Tạo/kiểm tra đúng Grafana **Free** và quota trước khi bật. Sau khi secrets đủ, đổi `vars.LOG_SINK` trong Wrangler thành `grafana`, deploy, thực hiện smoke test trên local với lỗi tổng hợp để xác minh đường nhận log, rồi kiểm tra dữ liệu trên Grafana. Không tạo lỗi từ dữ liệu người dùng thật.
- Sink này chỉ nhận application logs; không thay thế infrastructure metrics. Vẫn tiêu thụ compute/network hiện có, không cam kết tổng hóa đơn server không đổi.
- Nếu thiếu credentials hoặc Grafana trả lỗi/quota: bỏ batch, không tự nâng cấp hoặc chuyển lại sink trả phí. Khi phát hiện phí Cloudflare, kiểm tra line item, dừng ingest dataset trả phí không cần thiết và xác nhận Observability Free/ngày hiệu lực. Chuyển sink không xóa phí đã phát sinh hoặc phí lưu dữ liệu cũ.

## Kiểm thử tái lập

Dùng PostgreSQL **local cô lập có tên chứa `test`/`e2e`**, áp dụng toàn bộ migrations bằng bootstrap local. Không trỏ các lệnh sau tới production.

```sh
pnpm --filter @travel/server type-check
pnpm --filter @travel/web type-check
pnpm test:security
pnpm exec vitest run tests/unit/apps/server/observability/logger.test.ts
E2E_POSTGRES_URL='<local-test-db-url>' pnpm test:e2e:google
E2E_POSTGRES_URL='<local-test-db-url>' pnpm --filter @travel/server exec tsx ../../e2e/regression/google-oauth-postgres.mjs
pnpm dlx wrangler@4.155.0 deploy --dry-run --config apps/server/wrangler.jsonc
```

E2E dùng API và PostgreSQL thật, chỉ giả lập transport Google trong process test riêng; không có endpoint/token bypass trong ứng dụng production. Kiểm thử chữ ký bằng RSA/JWKS thật ở unit tests. Phải smoke test Google thật sau khi nhập credentials.

## Theo dõi và rollback

- Đã tạo heartbeat trong chat: 09:00 giờ Việt Nam mỗi ngày, 7 lần, chỉ báo khi có thay đổi đáng kể hoặc cần hành động.
- Theo dõi 7 ngày sau deploy: quota theo dataset, số lỗi callback, session/refresh và lỗi job. Thông báo khi usage vượt 0,25 GB/ngày hoặc có thay đổi plan/phí; không tự nâng cấp.
- Ngày 1/3/7 so sánh baseline, chú ý tổng dung lượng có tính dữ liệu trước deploy. Không suy ra mức giảm từ một lần đọc dashboard ngay sau triển khai.
- Rollback Google: đặt `GOOGLE_AUTH_ENABLED=false`, deploy. Phiên email/mật khẩu và dữ liệu cũ giữ nguyên; không drop bảng identity/transaction.
- Rollback sink: đặt `LOG_SINK=cloudflare` **sau khi xác nhận Observability Free**, deploy. Không bật lại invocation logs/traces chỉ để rollback.
- Không sửa migration đã áp dụng. Cả bootstrap Cloudflare và local đều cấp quyền/RLS riêng cho hai bảng mới; Data API/browser không có quyền.

## Kết quả kiểm thử đã thực hiện

- 98 unit/security tests qua, bao gồm auth/session/RBAC/CORS và logger.
- 3 browser E2E qua với API + PostgreSQL thật và Google transport giả lập: Google sign-in/cookie/replay, trùng email và xác nhận liên kết giữ ID, denied/invalid callback/external redirect.
- Regression PostgreSQL thật qua: concurrent identity creation, email collision, explicit linking, revoked session, null password, browser binding, replay, expiry, RLS bằng runtime role hạn chế.
- Type-check server/web, lint các file web thay đổi, Worker dry-run đều qua. Wrangler có các cảnh báo import default đã tồn tại ở modules itinerary/cities; không có cảnh báo cấu hình logging mới.
- Dry-run và apply migration production qua; hai bảng OAuth được SELECT metadata bằng runtime role và xác nhận RLS bật.
- Smoke Google thật đã qua: callback, restore khi reload, logout và đăng nhập lại identity đã có. Trang privacy đã công khai và Google Audience đã In production. Chưa xác minh Grafana ingest thật (chưa có credentials).

## Bản sửa lỗi callback production (30/10/2026)

- Nguyên nhân: Cloudflare Workers không hỗ trợ `redirect: "error"`; lệnh exchange bị TypeError trước khi gửi tới Google. Đổi sang `manual` và từ chối mọi phản hồi không thành công (kể cả 3xx), không follow redirect và không chuyển tiếp credentials. Loki adapter dùng cùng chế độ tương thích này. Nguồn: https://developers.cloudflare.com/workers/runtime-apis/request/
- Thêm mã chẩn đoán theo bước exchange/verify/identity; chỉ ghi mã kỹ thuật chuẩn hóa, không ghi message, response body, code/token hoặc dữ liệu hồ sơ.
- Regression mới kiểm tra token endpoint trả redirect không được follow; 18 OAuth tests và 4 logger tests qua. Chạy lại toàn bộ `test:security`: 93 tests qua; server/web type-check và lint file web thay đổi qua.
- Footer auth bỏ link `/terms` chưa có nội dung; Support dùng email hỗ trợ đã được duyệt thay vì route `/support` không tồn tại. Không công bố điều khoản pháp lý chưa được chủ dự án duyệt.
- Hai bản credentials JSON tạm đã được xóa sau khi lưu đúng Worker secrets và `.env` bị Git bỏ qua.
