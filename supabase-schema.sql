-- Supabase 카테고리 캐시 테이블 생성 SQL
-- Supabase 대시보드의 'SQL Editor'에 붙여넣고 RUN을 누르시면 됩니다!

create table if not exists public.categories_cache (
    category_id text primary key,
    category_name text not null,
    item_count int default 0,
    products jsonb not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 누구나 읽을 수 있도록 읽기 권한(RLS) 공개 허용
alter table public.categories_cache enable row level security;

create policy "Allow public read access"
on public.categories_cache
for select
using (true);

create policy "Allow all access with service or anon key"
on public.categories_cache
for all
using (true)
with check (true);
