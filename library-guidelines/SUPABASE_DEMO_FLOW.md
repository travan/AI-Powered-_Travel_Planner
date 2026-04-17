# Supabase Demo Data Flow

## Overview
Khi chạy Playwright test suite, Supabase demo seed script sẽ tự động chạy thông qua **global setup** để khởi tạo dữ liệu demo trước các test.

## Files

### 1. Migration
- **File**: `supabase/migrations/002_demo_itineraries.sql`
- **Mục đích**: Tạo bảng `public.demo_itineraries` với dữ liệu demo ban đầu
- **Seed dữ liệu**:
  - `Weekend in Hanoi` (2 người, $420.50)
  - `Da Nang Beach Break` (4 người, $1580)

### 2. Seed Script
- **File**: `apps/api/scripts/seed-demo-itineraries.mjs`
- **Mục đích**: Chèn dữ liệu demo vào database Supabase
- **Hành động**:
  - Xóa hàng cũ có cùng tên
  - Insert dữ liệu demo mới
- **Skip logic**: Bỏ qua nếu `SUPABASE_URL` hoặc `SUPABASE_SERVICE_KEY` là placeholder

### 3. Query Script
- **File**: `apps/api/scripts/query-demo-itineraries.mjs`
- **Mục đích**: Truy vấn dữ liệu demo từ Supabase
- **Chạy**: `pnpm run supabase:query-demo`

### 4. Global Setup
- **File**: `e2e/global-setup.ts`
- **Mục đích**: Chạy seed script trước tất cả Playwright test
- **Cách hoạt động**:
  ```
  Playwright test starts
  → global-setup.ts runs
  → seed-demo-itineraries.mjs executes
  → Demo data seeded (or skipped if placeholder env)
  → Tests start
  ```

### 5. Test Spec
- **File**: `e2e/specs/supabase-demo.contract.spec.ts`
- **Mục đích**: Demo test với logic skip nếu Supabase chưa configure

## Lệnh

```bash
# Chạy toàn bộ Playwright test (với global setup seed)
pnpm exec playwright test

# Chạy chỉ web
pnpm exec playwright test --project=web-desktop

# Chạy chỉ mobile
pnpm exec playwright test --project=mobile-web

# Seed dữ liệu thủ công (ngay bây giờ)
pnpm run supabase:seed-demo

# Query dữ liệu demo
pnpm run supabase:query-demo
```

## Cấu hình môi trường

Để hoạt động đầy đủ với Supabase thực, thay các giá trị placeholder trong `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

**Lưu ý**: Nếu vẫn là placeholder, script sẽ tự động bỏ qua (skip) mà không gây lỗi.

## Data Structure

```json
{
  "id": "uuid",
  "name": "string",
  "city": "string",
  "start_date": "date",
  "end_date": "date",
  "traveler_count": "int",
  "budget": "numeric",
  "currency": "string (default USD)",
  "is_public": "boolean",
  "tags": "string[]",
  "metadata": "jsonb",
  "created_at": "timestamptz"
}
```
