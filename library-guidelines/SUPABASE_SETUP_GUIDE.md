# Hướng dẫn cấu hình Supabase thực cho Travel Planner

## Tổng quan
Khi cấu hình Supabase thực (thay vì placeholder), script sẽ tự động push dữ liệu demo vào database mỗi khi chạy Playwright test suite thông qua **global setup**.

## Bước 1: Tạo Supabase Project

1. Truy cập [supabase.com](https://supabase.com)
2. Đăng ký tài khoản (nếu chưa có)
3. Tạo project mới:
   - **Name**: `travel-planner-demo`
   - **Database Password**: Chọn mật khẩu mạnh
   - **Region**: Chọn region gần nhất (ví dụ: `Singapore` cho Việt Nam)

## Bước 2: Lấy API Credentials

Sau khi project tạo xong (khoảng 2-3 phút):

1. Vào **Settings** → **API**
2. Copy các giá trị:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role secret key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Bước 3: Cập nhật file .env

Thay thế các giá trị placeholder trong `.env`:

```env
# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-secret-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

**Ví dụ thực tế:**
```env
SUPABASE_URL=https://abcdefghijk.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY0MzE5MzYwMCwiZXhwIjoxOTU4NzY5NjAwfQ.example
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDMxOTM2MDAsImV4cCI6MTk1ODc2OTYwMH0.example
```

## Bước 4: Chạy Migration

Áp dụng schema và dữ liệu demo:

```bash
# Cài đặt Supabase CLI (nếu chưa có)
npm install -g supabase

# Link project
supabase link --project-ref your-project-id

# Chạy migration
supabase db push
```

Hoặc chạy trực tiếp SQL trong Supabase Dashboard:
- Vào **SQL Editor**
- Copy nội dung từ `supabase/migrations/002_demo_itineraries.sql`
- Chạy query

## Bước 5: Verify Setup

### Test seed script
```bash
# Chạy seed thủ công
pnpm run supabase:seed-demo
```

Kết quả mong đợi:
```
Seeded 2 demo itinerary rows.
```

### Test query script
```bash
# Query dữ liệu demo
pnpm run supabase:query-demo
```

### Verify toàn bộ setup
```bash
# Kiểm tra toàn bộ cấu hình Supabase
pnpm run supabase:verify-setup
```

**Với placeholder env (hiện tại):**
```
🔍 Verifying Supabase setup...

❌ Supabase credentials are still placeholder values
   Please follow SUPABASE_SETUP_GUIDE.md to configure real credentials
```

**Với credentials thực:**
```
🔍 Verifying Supabase setup...

✅ Environment variables configured
✅ Database connection successful
✅ demo_itineraries table exists (0 rows)
✅ Seed capability verified

🎉 Supabase setup is ready!
   Run 'pnpm exec playwright test' to see auto-seeding in action
```

## Bước 6: Chạy Playwright Test Suite

```bash
# Chạy toàn bộ test (sẽ tự động seed dữ liệu)
pnpm exec playwright test
```

**Quan sát log:**
```
Running Supabase demo seed before Playwright tests...
Seeded 2 demo itinerary rows.
Running 6 tests using 3 workers
...
6 passed
```

## Troubleshooting

### Lỗi "Permission denied" khi seed
- Kiểm tra `SUPABASE_SERVICE_KEY` có đúng không
- Service role key cần có quyền insert vào bảng

### Lỗi "Table doesn't exist"
- Chạy lại migration: `supabase db push`
- Hoặc chạy SQL trong Supabase Dashboard

### Seed script bị skip
- Kiểm tra `.env` có được load đúng không
- Restart terminal sau khi thay đổi `.env`

### Test fail
- Kiểm tra web servers có start được không
- Verify mock API server chạy trên port 3101

## Cấu trúc dữ liệu demo

```sql
-- Bảng demo_itineraries
CREATE TABLE public.demo_itineraries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  city text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  traveler_count int NOT NULL DEFAULT 1,
  budget numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  is_public boolean NOT NULL DEFAULT false,
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Dữ liệu mẫu:**
- **Weekend in Hanoi**: 2 người, $420.50, public
- **Da Nang Beach Break**: 4 người, $1580, private

## Lệnh hữu ích

```bash
# Verify setup
pnpm run supabase:verify-setup

# Seed dữ liệu
pnpm run supabase:seed-demo

# Query dữ liệu
pnpm run supabase:query-demo

# Chạy test web
pnpm exec playwright test --project=web-desktop

# Chạy test mobile
pnpm exec playwright test --project=mobile-web

# Xem report test
pnpm exec playwright show-report
```

## Bảo mật

⚠️ **Quan trọng:**
- Không commit `.env` với credentials thực vào Git
- Thêm `.env` vào `.gitignore`
- Sử dụng service role key chỉ cho server-side operations
- Anon key an toàn cho client-side

Sau khi cấu hình xong, mỗi lần chạy `pnpm exec playwright test`, dữ liệu demo sẽ tự động được push vào Supabase database!