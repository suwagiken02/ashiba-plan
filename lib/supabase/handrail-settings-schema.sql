-- =========================================================================
-- 部材設定（手摺の使用可能サイズ）テーブル
-- 会社ごとに保有するサイズが異なるため、ユーザー側で ON/OFF 切替可能。
-- テスト段階ではレコード 1 行を全員共有（owner_id=null）。
-- 将来、アカウント単位の切替に拡張する場合は owner_id で filter する。
-- =========================================================================

create table if not exists handrail_settings (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid default null,
  -- company_id は Phase 0a で追加（nullable、Phase 0d で NOT NULL 化予定）
  company_id uuid references companies(id),
  enabled_sizes jsonb not null default '[1800,1200,900,600,400,300,200]'::jsonb,
  updated_at timestamptz default now()
);

-- RLS: 全員読み書き可（今日の projects/drawings と同じ方針）
alter table handrail_settings enable row level security;

drop policy if exists "Shared: anyone can read handrail_settings" on handrail_settings;
drop policy if exists "Shared: anyone can insert handrail_settings" on handrail_settings;
drop policy if exists "Shared: anyone can update handrail_settings" on handrail_settings;

create policy "Shared: anyone can read handrail_settings"
  on handrail_settings for select using (true);
create policy "Shared: anyone can insert handrail_settings"
  on handrail_settings for insert with check (true);
create policy "Shared: anyone can update handrail_settings"
  on handrail_settings for update using (true);

-- 初期レコード: まだ無ければ 1 行だけ作成（owner_id=null 共通）
insert into handrail_settings (owner_id, enabled_sizes)
select null, '[1800,1200,900,600,400,300,200]'::jsonb
where not exists (select 1 from handrail_settings where owner_id is null);

-- 優先部材リスト機能（自動割付用）
alter table handrail_settings
  add column if not exists priority_config jsonb not null default '{
    "order": [1800, 1500, 1200, 1000, 900, 800, 600, 500, 400, 300, 200, 100],
    "mainCount": 1,
    "subCount": 6,
    "adjustCount": 5
  }'::jsonb;
