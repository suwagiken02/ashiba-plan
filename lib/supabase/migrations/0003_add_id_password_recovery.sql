-- =========================================================================
-- Day 4-5: ID/PW 認証 + 4 桁 PIN 復旧 用カラム追加
--
-- 目的:
--   ID/PW 認証 (= 擬似メアド `<id>@cadpassport.local` 方式) と、
--   4 桁 PIN による PW/ID 復旧フローを実現するためのカラムを profiles に追加。
--
-- 適用方法:
--   Supabase ダッシュボードの SQL Editor で本ファイルを実行。
--
-- 注意:
--   - 既存ユーザー (= メアド/PW + Google OAuth) はこれらのカラムが NULL のまま。
--   - ID 認証ユーザーのみ NOT NULL 相当の値を持つ。
--   - 4 桁 PIN は必ずアプリ側で bcrypt ハッシュ化してから保存する (= 平文禁止)。
--   - RLS は本マイグレーションでは変更しない (= shared-test-patch 維持)。
--
-- 追加カラム:
--   username (text、 unique 部分インデックス、 ID/PW 認証の ID)
--   display_name (text、 名前 / 復旧時の照合用)
--   birth_date (date、 生年月日 / 復旧時の照合用)
--   recovery_pin_hash (text、 4 桁 PIN の bcrypt ハッシュ)
--   failed_recovery_attempts (int、 復旧失敗回数)
--   recovery_locked_until (timestamptz、 ロック解除時刻、 NULL=未ロック)
-- =========================================================================

-- 1. profiles に各カラム追加 (= 既存ユーザーは NULL のまま)
alter table profiles
  add column if not exists username text,
  add column if not exists display_name text,
  add column if not exists birth_date date,
  add column if not exists recovery_pin_hash text,
  add column if not exists failed_recovery_attempts int not null default 0,
  add column if not exists recovery_locked_until timestamptz;

-- 2. username に unique 部分インデックス (= NULL は重複 OK、 ID 認証ユーザーのみ unique)
create unique index if not exists profiles_username_unique
  on profiles(username) where username is not null;

-- 3. コメント (= 運用上の注意)
comment on column profiles.username is 'ID/PW 認証のユーザー指定 ID (= 半角英数字 + アンダースコア + ハイフン、 3〜32 文字)。 NULL = ID 認証未利用 (= メアド/PW or Google OAuth ユーザー)';
comment on column profiles.recovery_pin_hash is '4 桁 PIN の bcrypt ハッシュ。 平文保存禁止。';
comment on column profiles.recovery_locked_until is 'NULL = 未ロック / timestamp = ロック解除時刻 (= 通常 +1 hour)';

-- =========================================================================
-- 検証クエリ (= 適用後に手動で実行して確認)
--
-- 1. カラムが追加されたか確認:
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'profiles'
--     and column_name in ('username','display_name','birth_date','recovery_pin_hash','failed_recovery_attempts','recovery_locked_until')
--   order by column_name;
--
-- 2. unique インデックスが作成されたか確認:
--   select indexname, indexdef from pg_indexes where tablename = 'profiles' and indexname = 'profiles_username_unique';
--
-- 3. 既存ユーザーが NULL のまま (= 既存ユーザー数と等しい) か確認:
--   select count(*) from profiles where username is null;
-- =========================================================================
