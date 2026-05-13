# DATABASE SAFETY RULES

Claude Code (および任意の AI agent) が **本番 Supabase DB** に対して操作する際の安全ルール。
本プロジェクトでは Claude Code への指示で「`docs/DATABASE_SAFETY_RULES.md` に従って」 と一言入れることで
本ルール群を適用する運用とする。

## 背景

過去に他社で AI agent が本番 DB を許可なく削除した事件があった (= 700 ユーザのデータ消失)。
本プロジェクトの Supabase DB も同様のリスクを抱えるため、 destructive な操作を明示的にゲートする。

---

## 0. 適用範囲

- **本番 Supabase DB** (project_id は `.env` を参照、 region: `hnd1`)
- `lib/supabase/migrations/` 配下の SQL ファイル（追加 + 実行）
- Supabase Dashboard SQL Editor / Supabase CLI / 任意の DB client から実行する DDL/DML
- RLS ポリシー、 schema 変更、 データ全件操作
- `service_role` key を使う任意の DB op (= `lib/supabase/admin.ts` 経由含む)
- ローカル開発 DB も同じ作法で扱う (= muscle memory 観点で同一フロー推奨)

---

## 1. ユーザの明示承認なしに実行禁止の操作

以下は **どのコンテキストでも事前承認必須**:

| 操作 | 理由 |
|---|---|
| `DROP TABLE` / `DROP DATABASE` / `DROP SCHEMA` | データ完全消失 |
| `TRUNCATE TABLE` | 全行削除（復旧は backup のみ。 RLS 事情で必要な場合あり、 §2-1 で対応） |
| `DELETE FROM ... ;` (WHERE 句なし) | 全行削除と同義 |
| `DELETE FROM ... WHERE <broad>` (例: `WHERE true`、 主キー範囲外) | 大量削除 |
| `UPDATE ... SET ...;` (WHERE 句なし) | 全行上書き |
| `UPDATE ... WHERE <broad>` (= 大量更新) | データ整合性破壊リスク |
| `ALTER TABLE ... DROP COLUMN` | カラムデータ消失 |
| `ALTER TABLE ... ALTER COLUMN ... TYPE` (data loss 系) | 例: text → uuid で parse 失敗 |
| `DROP POLICY` (RLS ポリシー削除、 特に全削除) | RLS bypass による全件露出 |
| `service_role` key で実行する任意の destructive op | client RLS バイパス、 致命的 |

**例外**: ユーザが該当操作を **明示的に** ("実行してよい" 等で) 指示した場合のみ実行可。
「migration 書いて」 等の包括的指示には destructive op 実行の暗黙承認を **含まない**。

---

## 2. 必須プロセス

### 2-1. 事前提示フォーマット

destructive op を含む or 含む可能性がある作業前は、 以下を必ず提示してユーザ承認を待つ:

```
【実行内容】
  - SQL: <executable SQL>
  - 対象: <table 名 + 影響行数の推定>

【影響範囲】
  - 失われるデータ: <具体的 + 概算行数>
  - 関連テーブル / FK cascade: <あれば>
  - 既存ユーザへの影響: <none / partial / fatal>

【ロールバック手順】
  - <逆操作 SQL or backup 復旧手順>
  - PITR (Point in Time Recovery) 適用可否
```

### 2-2. migration の流れ

1. **feature branch** で書く（main 直書き禁止）
2. **ローカル DB or staging で dry-run** 確認
3. `lib/supabase/migrations/000N_xxx.sql` に追加（連番厳守）
4. §2-1 事前提示フォーマットで承認取得
5. Supabase Dashboard SQL Editor で **ユーザが** 実行（Claude は SQL 実行しない、 ファイル追加のみ）
6. 実行後、 schema/data の状態確認

### 2-3. backup 確認

- Supabase Pro plan: **日次 backup** が自動取得される（https://supabase.com/docs/guides/platform/backups）
- destructive op 前に「最後の backup から N 時間経過、 直近の操作内容: ...」 を提示
- PITR (Point in Time Recovery): Pro plan で 7 日以内の任意時点に復旧可

### 2-4. 事故時の復旧手順

1. **即座に作業停止**、 ユーザに状況報告
2. Supabase Dashboard > Database > Backups > Restore from backup を案内
3. 最新 backup or PITR の選択肢を提示
4. 復旧前に「失われるその後の変更」 を整理して提示

---

## 3. 推奨ルール（明示承認不要）

以下は destructive ではないため、 通常作業として実行可（事後報告で十分）:

- `SELECT` / `EXPLAIN` / その他 **読み取り系** 全般
- `CREATE TABLE` / `CREATE INDEX` / `CREATE FUNCTION` 等の **新規追加系**
- `INSERT INTO ... VALUES ...` **1 件単位**
- `ALTER TABLE ... ADD COLUMN` (NOT NULL 制約なし、 既存データ無影響)
- migration **ファイル追加** (= `.sql` を書くだけ、 実行は §2-2)
- RLS ポリシー **追加** (既存 deny → 新規 allow、 ただし広範な allow は §1 該当)

**条件付き OK** (= 要影響範囲提示):

- `INSERT INTO ... SELECT ...` (一括 insert): 件数推定を事前提示
- `UPDATE ... WHERE id = '<specific>'` (1 件単位): 変更前後を提示
- `DELETE FROM ... WHERE id = '<specific>'` (1 件単位): 削除対象を提示

---

## 4. このルールの参照方法

### ユーザ側の指示パターン

- 「`docs/DATABASE_SAFETY_RULES.md` に従って [操作]」
- 「§1 禁止操作に該当しないか確認して [操作]」
- 「migration を書きたい」（暗黙適用、 Claude は本ドキュメントを自発的に参照）

### Claude Code 側の挙動

DB 関連の作業（SQL / migration / Supabase / RLS 等）を要求された際:

1. 本ドキュメント §1 禁止操作リストと照合
2. 該当する操作なら §2-1 事前提示フォーマットで承認待ち
3. 該当しない操作なら §3 推奨ルールに従い実行可
4. 不明な場合は実行前に確認

---

## 5. 関連リソース

| リソース | リンク / 場所 |
|---|---|
| Supabase Backups 公式 | https://supabase.com/docs/guides/platform/backups |
| Supabase PITR 公式 | https://supabase.com/docs/guides/platform/backups#point-in-time-recovery-pitr |
| 既存 migration | `lib/supabase/migrations/0001_..0007_*.sql` |
| `service_role` 利用箇所 | `lib/supabase/admin.ts` / `app/api/share/*` / `app/api/auth/*` |
| TRUNCATE 必要事例 | RLS 有効 + ポリシーゼロ状態で `DELETE` がゼロ件削除になるケース。 `0006_handrail_settings_isolate.sql` 参照 |

---

## 6. 改訂履歴

| 日付 | 変更 |
|---|---|
| 2026-05-13 | 初版作成（過去事件を契機、 Claude Code 向け運用ルール明文化） |
