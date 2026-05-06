-- =========================================================================
-- Day 7 commit B: shared-test-patch 解除 + RLS 元ポリシー復活
--
-- 目的:
--   テスト段階用の「全件共有」 ポリシー (= shared-test-patch.sql) を削除し、
--   schema.sql の元ポリシー (= owner_id ベース) を復活させる。
--   これによりユーザーは自分の projects と drawings のみアクセス可能になる。
--
-- 適用方法:
--   Supabase ダッシュボードの SQL Editor で本ファイルを実行。
--
-- 注意:
--   - profiles は shared-test-patch で除外されていたため、 触らない (= 元の owner-only 維持)。
--   - handrail_settings は別設計 (= 全員共有、 Day 7 スコープ外)、 触らない。
--   - データクリーンアップ (= delete from drawings/projects/profiles + auth.users 削除) は
--     本 migration とは別に手動で実施する (= 末尾コメントの指示参照)。
-- =========================================================================

-- =========================================================================
-- Section 1: shared-test-patch ポリシーを drop (= 計 8 つ)
-- =========================================================================
drop policy if exists "Shared: anyone can view projects" on projects;
drop policy if exists "Shared: anyone can insert projects" on projects;
drop policy if exists "Shared: anyone can update projects" on projects;
drop policy if exists "Shared: anyone can delete projects" on projects;

drop policy if exists "Shared: anyone can view drawings" on drawings;
drop policy if exists "Shared: anyone can insert drawings" on drawings;
drop policy if exists "Shared: anyone can update drawings" on drawings;
drop policy if exists "Shared: anyone can delete drawings" on drawings;

-- =========================================================================
-- Section 2: schema.sql の元ポリシーを再 create (= 計 8 つ、 owner_id ベース)
-- =========================================================================

-- projects (= owner_id = auth.uid())
create policy "Users can view own projects"
  on projects for select using (auth.uid() = owner_id);
create policy "Users can insert own projects"
  on projects for insert with check (auth.uid() = owner_id);
create policy "Users can update own projects"
  on projects for update using (auth.uid() = owner_id);
create policy "Users can delete own projects"
  on projects for delete using (auth.uid() = owner_id);

-- drawings (= project_id 経由で auth.uid() = owner_id を確認)
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

-- =========================================================================
-- 検証クエリ (= 適用後に手動で実行)
--
-- 1. ポリシーが正しく置換されたか確認:
--   select tablename, policyname, cmd from pg_policies
--   where tablename in ('projects','drawings')
--   order by tablename, policyname;
--   → 期待: "Users can ..." パターンの 8 行のみ、 "Shared: ..." はゼロ
--
-- =========================================================================
-- 手動データクリーンアップ (= migration 適用後、 別途実施)
--
-- 順序 (= cascade を考慮):
--   delete from drawings;     -- 全 drawings 削除
--   delete from projects;     -- 全 projects 削除 (= 残った drawings は cascade で削除)
--   delete from profiles;     -- 全 profiles 削除
--   -- auth.users は Supabase Dashboard > Authentication > Users で手動削除
--
-- handrail_settings は残置推奨 (= Default Company 1 行、 削除すると初期設定が消える)
--
-- =========================================================================
-- Rollback (= 万が一の場合の戻し方)
--
-- 本 migration を rollback するには、 lib/supabase/shared-test-patch.sql の
-- 内容を SQL Editor で再実行することで「全件共有」 状態に戻せる。
-- ただしデータクリーンアップ後は元データに戻せない (= バックアップ必須)。
-- =========================================================================
