-- Supabase SQL: テーブル作成
-- Supabaseダッシュボードの SQL Editor で実行してください
--
-- ※ 増分マイグレーションは lib/supabase/migrations/ 配下を参照
--   - 0001_add_companies.sql: companies テーブル新規 + 各テーブルに company_id 追加 (Phase 0a)

-- 会社（Phase 0a で追加）
create table if not exists companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz default now()
);

-- プロフィール
-- ※ company_id (Phase 0a) は nullable、Phase 0d で NOT NULL 化予定
create table if not exists profiles (
  id uuid references auth.users primary key,
  company_id uuid references companies(id),
  company_name text,
  logo_url text,
  created_at timestamptz default now()
);

-- プロジェクト
-- ※ company_id (Phase 0a) は nullable、Phase 0d で NOT NULL 化予定
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references profiles(id) on delete cascade,
  company_id uuid references companies(id),
  name text not null,
  address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 図面
-- canvas_data（JSONB）に含まれる主なフィールド:
--   buildings, roofOverhangs, obstacles, handrails, posts, antis, memos,
--   compass, scaffoldStart, scaffoldStart1F, scaffoldStart2F, magnetPins
--   （magnetPins / scaffoldStart1F / scaffoldStart2F は後から追加。
--    undefined の古いデータはストア側で正規化される。
--    scaffoldStart は後方互換のため保持、新規は 1F / 2F 側を使用）
create table if not exists drawings (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  title text default '平面図',
  canvas_data jsonb not null,
  thumbnail_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS ポリシー
alter table profiles enable row level security;
alter table projects enable row level security;
alter table drawings enable row level security;

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users can view own projects"
  on projects for select using (auth.uid() = owner_id);
create policy "Users can insert own projects"
  on projects for insert with check (auth.uid() = owner_id);
create policy "Users can update own projects"
  on projects for update using (auth.uid() = owner_id);
create policy "Users can delete own projects"
  on projects for delete using (auth.uid() = owner_id);

create policy "Users can view own drawings"
  on drawings for select using (
    project_id in (select id from projects where owner_id = auth.uid())
  );
create policy "Users can insert own drawings"
  on drawings for insert with check (
    project_id in (select id from projects where owner_id = auth.uid())
  );
create policy "Users can update own drawings"
  on drawings for update using (
    project_id in (select id from projects where owner_id = auth.uid())
  );
create policy "Users can delete own drawings"
  on drawings for delete using (
    project_id in (select id from projects where owner_id = auth.uid())
  );

-- トリガー: auth.users作成時にprofileを自動作成
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
