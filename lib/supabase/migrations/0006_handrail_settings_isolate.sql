-- =========================================================================
-- Day 7 commit C: handrail_settings 個別化 (= owner_id ベース RLS)
--
-- 目的:
--   テスト段階用「全員共有」 RLS ポリシー (= shared) を削除し、
--   owner_id = auth.uid() ベースの個別 RLS に置換。
--
-- 注意:
--   - company_id カラムは温存 (= 削除しない、 nullable のまま、
--     projects/drawings と同じパターン、 Day 7 commit B 踏襲)。
--   - 既存「全員共有」 1 行 (= owner_id=null) は削除、
--     各ユーザーが初回設定時に新規 INSERT する設計 (= store 既存ロジック対応済)。
--   - owner_id を NOT NULL 化 (= 個別化保証)。
-- =========================================================================

-- Section 1: shared-test-patch ポリシー drop (= 計 3 つ)
drop policy if exists "Shared: anyone can read handrail_settings" on handrail_settings;
drop policy if exists "Shared: anyone can insert handrail_settings" on handrail_settings;
drop policy if exists "Shared: anyone can update handrail_settings" on handrail_settings;

-- Section 2: 既存「全員共有」 1 行を削除 (= owner_id=null のレコード)
--   師匠が customize 記憶なし、 worst case でも再設定 2-3 分のため案 1 採用。
--   ⚠ DELETE は RLS の影響を受けるため、 Section 1 の drop policy 後はゼロポリシー
--      状態で何も削除できない。 TRUNCATE は DDL で RLS bypass するため確実。
--   個別ユーザーデータは存在しない (= 全員共有 1 行のみ) ので全削除で問題なし。
truncate table handrail_settings;

-- Section 3: owner_id を NOT NULL 化 (= 個別化保証)
alter table handrail_settings
  alter column owner_id set not null;

-- Section 4: owner_id ベース RLS ポリシーを create (= 計 4 つ: select/insert/update/delete)
create policy "Users can view own handrail_settings"
  on handrail_settings for select using (auth.uid() = owner_id);
create policy "Users can insert own handrail_settings"
  on handrail_settings for insert with check (auth.uid() = owner_id);
create policy "Users can update own handrail_settings"
  on handrail_settings for update using (auth.uid() = owner_id);
create policy "Users can delete own handrail_settings"
  on handrail_settings for delete using (auth.uid() = owner_id);

-- =========================================================================
-- 検証クエリ (= 適用後に手動で実行)
--
-- 1. ポリシー置換確認:
--   select tablename, policyname, cmd from pg_policies
--   where tablename = 'handrail_settings' order by policyname;
--   → 期待: "Users can ..." パターンの 4 行のみ、 "Shared: ..." はゼロ
--
-- 2. owner_id NOT NULL 確認:
--   select column_name, is_nullable from information_schema.columns
--   where table_name = 'handrail_settings' and column_name = 'owner_id';
--   → 期待: is_nullable = 'NO'
--
-- 3. データ削除確認:
--   select count(*) from handrail_settings where owner_id is null;
--   → 期待: 0
-- =========================================================================
-- Rollback (= 万が一の場合の戻し方)
--
--   alter table handrail_settings alter column owner_id drop not null;
--   drop policy if exists "Users can view own handrail_settings" on handrail_settings;
--   drop policy if exists "Users can insert own handrail_settings" on handrail_settings;
--   drop policy if exists "Users can update own handrail_settings" on handrail_settings;
--   drop policy if exists "Users can delete own handrail_settings" on handrail_settings;
--   create policy "Shared: anyone can read handrail_settings"
--     on handrail_settings for select using (true);
--   create policy "Shared: anyone can insert handrail_settings"
--     on handrail_settings for insert with check (true);
--   create policy "Shared: anyone can update handrail_settings"
--     on handrail_settings for update using (true);
--   insert into handrail_settings (owner_id, enabled_sizes)
--   select null, '[1800,1200,900,600,400,300,200]'::jsonb
--   where not exists (select 1 from handrail_settings where owner_id is null);
--
-- ただし削除済の個別ユーザーデータは復元できない (= バックアップ必須)。
-- =========================================================================
