-- 0008_add_contractor_name_to_projects.sql
-- projects テーブルに contractor_name (元請け様名) カラム追加。
-- DATABASE_SAFETY_RULES.md §3 推奨範囲: ADD COLUMN、 NOT NULL 制約なし、
-- デフォルトなし → 既存全行で contractor_name=NULL 自動設定、 非破壊。

ALTER TABLE projects ADD COLUMN contractor_name text;
