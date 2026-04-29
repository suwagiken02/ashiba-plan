-- =========================================================================
-- Phase J-5: 寸法線の段別表示設定 (dimension_visibility)
--
-- 寸法線レイヤー (1F/2F の屋根・外壁・足場) を個別 ON/OFF できる。
-- 会社単位 (handrail_settings と同じスコープ) で保存。
--
-- デフォルト:
--   roof1F=true, wall1F=true, scaffold1F=false,
--   roof2F=true, wall2F=true, scaffold2F=false
-- (足場線は OFF が標準、必要に応じて ON にする)
-- =========================================================================

ALTER TABLE handrail_settings
  ADD COLUMN IF NOT EXISTS dimension_visibility jsonb
  DEFAULT '{"roof1F":true,"wall1F":true,"scaffold1F":false,"roof2F":true,"wall2F":true,"scaffold2F":false}'::jsonb;

-- 既存レコードに defaults を backfill (NULL のものだけ更新)
UPDATE handrail_settings
SET dimension_visibility = '{"roof1F":true,"wall1F":true,"scaffold1F":false,"roof2F":true,"wall2F":true,"scaffold2F":false}'::jsonb
WHERE dimension_visibility IS NULL;
