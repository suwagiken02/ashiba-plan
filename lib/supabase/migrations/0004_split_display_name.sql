-- =========================================================================
-- Day 4-5 Step 2b: display_name を last_name + first_name に分離
--
-- 目的:
--   日本のフォーム標準パターンに合わせ、 display_name (text) を
--   last_name (text) + first_name (text) の 2 カラムに分割する。
--   姓 + 名で別々に保存することで、 将来の検索や宛名表示で活きる。
--
-- 適用方法:
--   Supabase ダッシュボードの SQL Editor で本ファイルを実行。
--
-- 戦略 (= 案 A クリーン削除):
--   既存の ID 認証ユーザー (= display_name not null) は事前確認で 0 件。
--   よって display_name を DROP しても データ損失なし。
--
-- 注意:
--   - last_name / first_name は NULL 可 (= ID 認証以外のユーザーは NULL のまま)。
--   - 既存ユーザーがいる環境で本 migration を再適用する場合は、
--     事前に display_name の値を退避すること。
--   - RLS は本マイグレーションでは変更しない (= shared-test-patch 維持)。
-- =========================================================================

-- 1. last_name / first_name 追加 (= NULL 可)
alter table profiles
  add column if not exists last_name text,
  add column if not exists first_name text;

-- 2. display_name を削除 (= 案 A クリーン削除、 既存 0 件確認済)
alter table profiles
  drop column if exists display_name;

-- 3. コメント (= 運用上の注意)
comment on column profiles.last_name is 'ID 認証ユーザーの姓 (= 1〜32 文字)。 NULL = ID 認証未利用 (= メアド/PW or Google OAuth ユーザー)';
comment on column profiles.first_name is 'ID 認証ユーザーの名 (= 1〜32 文字)。 NULL = ID 認証未利用';

-- =========================================================================
-- 検証クエリ (= 適用後に手動で実行して確認)
--
-- 1. last_name / first_name が追加され、 display_name が削除されたか確認:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'profiles'
--     and column_name in ('last_name','first_name','display_name')
--   order by column_name;
--   → 期待: last_name と first_name の 2 行が返り、 display_name は返らない
--
-- 2. 既存ユーザーが NULL のまま (= 既存ユーザー数と等しい) か確認:
--   select count(*) from profiles where last_name is null;
-- =========================================================================
