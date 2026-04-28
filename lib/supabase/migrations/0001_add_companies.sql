-- =========================================================================
-- Phase 0a: companies テーブル新規作成 + 既存テーブルに company_id 追加
--
-- 目的:
--   アカウントシステム（会社単位のマルチテナント）の土台を作る。
--   既存3テーブル (profiles / projects / handrail_settings) に
--   nullable な company_id を追加し、デフォルト company に backfill する。
--
-- 適用方法:
--   Supabase ダッシュボードの SQL Editor で本ファイルを実行。
--
-- 注意:
--   - 既存データは「Default Company」(固定UUID) に紐付けられる。
--   - company_id は nullable のまま（NOT NULL 化は Phase 0d）。
--   - RLS は本マイグレーションでは変更しない（shared-test-patch は維持）。
--   - drawings は projects.company_id 経由で属するため、直接 company_id を持たせない。
-- =========================================================================

-- 1. companies テーブル新規作成
create table if not exists companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz default now()
);

-- 2. profiles に company_id 追加（nullable）
alter table profiles
  add column if not exists company_id uuid references companies(id);

-- 3. projects に company_id 追加（nullable）
alter table projects
  add column if not exists company_id uuid references companies(id);

-- 4. handrail_settings に company_id 追加（nullable）
alter table handrail_settings
  add column if not exists company_id uuid references companies(id);

-- 5. デフォルト company レコードを INSERT（固定UUID）
--    既に存在する場合はスキップ（idempotent）
insert into companies (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default Company')
on conflict (id) do nothing;

-- 6. 既存レコードを backfill（NULL のものをデフォルト company に紐付け）
update profiles
  set company_id = '00000000-0000-0000-0000-000000000001'
  where company_id is null;

update projects
  set company_id = '00000000-0000-0000-0000-000000000001'
  where company_id is null;

update handrail_settings
  set company_id = '00000000-0000-0000-0000-000000000001'
  where company_id is null;

-- =========================================================================
-- 検証クエリ（適用後に手動で実行して確認）
--
-- 以下すべて 0 になっていれば backfill 成功:
--
--   select count(*) as profiles_null from profiles where company_id is null;
--   select count(*) as projects_null from projects where company_id is null;
--   select count(*) as handrail_settings_null from handrail_settings where company_id is null;
--
-- companies に Default Company があることを確認:
--   select * from companies where id = '00000000-0000-0000-0000-000000000001';
--
-- 各テーブルがデフォルト company に紐付いていることを確認:
--   select count(*) from profiles where company_id = '00000000-0000-0000-0000-000000000001';
--   select count(*) from projects where company_id = '00000000-0000-0000-0000-000000000001';
--   select count(*) from handrail_settings where company_id = '00000000-0000-0000-0000-000000000001';
-- =========================================================================
