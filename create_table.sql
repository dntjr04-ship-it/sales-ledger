-- ==============================================
-- 🚀 리사님의 소싱 레이더를 위한 Supabase 테이블 생성 SQL
-- ==============================================

create table if not exists public.categories_cache (
    category_id text primary key,
    category_name text not null,
    item_count int default 0,
    products jsonb not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 보물창고 데이터 읽기/쓰기 권한 허용 (보안 설정)
alter table public.categories_cache enable row level security;

create policy "Allow public read access"
on public.categories_cache
for select
using (true);

create policy "Allow all access"
on public.categories_cache
for all
using (true)
with check (true);
