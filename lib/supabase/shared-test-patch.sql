-- =========================================================================
-- テスト段階用: 全テスターで現場データを共有するための RLS パッチ
-- Supabase ダッシュボードの SQL Editor で実行してください。
-- 本番公開時は schema.sql の元ポリシー（auth.uid() = owner_id）に戻すこと。
-- =========================================================================

-- projects: 既存の所有者限定ポリシーを全件許可に置換
drop policy if exists "Users can view own projects" on projects;
drop policy if exists "Users can insert own projects" on projects;
drop policy if exists "Users can update own projects" on projects;
drop policy if exists "Users can delete own projects" on projects;

create policy "Shared: anyone can view projects"
  on projects for select using (true);
create policy "Shared: anyone can insert projects"
  on projects for insert with check (true);
create policy "Shared: anyone can update projects"
  on projects for update using (true);
create policy "Shared: anyone can delete projects"
  on projects for delete using (true);

-- drawings: 同様に全件許可
drop policy if exists "Users can view own drawings" on drawings;
drop policy if exists "Users can insert own drawings" on drawings;
drop policy if exists "Users can update own drawings" on drawings;
drop policy if exists "Users can delete own drawings" on drawings;

create policy "Shared: anyone can view drawings"
  on drawings for select using (true);
create policy "Shared: anyone can insert drawings"
  on drawings for insert with check (true);
create policy "Shared: anyone can update drawings"
  on drawings for update using (true);
create policy "Shared: anyone can delete drawings"
  on drawings for delete using (true);

-- profiles は従来通り（自分のプロフィールのみ編集可）
