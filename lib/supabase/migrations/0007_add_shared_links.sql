-- =========================================================================
-- 共有 URL 機能: shared_links テーブル新規追加
--
-- 目的:
--   プロジェクト単位で URL 発行型の共有機能を実装。 受信者は URL から
--   元プロジェクト + 関連 drawings をコピーして自分のプロジェクトとして
--   取り込み可能。
--
-- 仕様:
--   - 共有範囲: プロジェクト単位 (= projects + drawings)
--   - 有効期限: 7 日 (= server-side で expires_at 検証)
--   - 使用回数: 期限内なら何度でも
--   - 元データ: 送信者保持 (= コピー作成のみ、 元 projects/drawings 無変更)
--   - token: UUID v4 (= 推測困難 122 bit)
-- =========================================================================

create table if not exists shared_links (
  id uuid default gen_random_uuid() primary key,
  token uuid default gen_random_uuid() unique not null,
  project_id uuid references projects(id) on delete cascade,
  created_by uuid references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists shared_links_token_idx on shared_links(token);
create index if not exists shared_links_created_by_idx on shared_links(created_by);

alter table shared_links enable row level security;

create policy "Users can create shared links for own projects"
  on shared_links for insert
  with check (
    auth.uid() = created_by
    and project_id in (select id from projects where owner_id = auth.uid())
  );

create policy "Users can view own created shared links"
  on shared_links for select
  using (auth.uid() = created_by);

create policy "Users can delete own shared links"
  on shared_links for delete
  using (auth.uid() = created_by);

-- 注: 受信者の token 検証 + projects/drawings コピーは Service Role Key 経由
-- (= /api/share/[token] route で supabaseAdmin 使用、 RLS bypass)。
-- ここで public select policy を作らない理由: token 単独でアクセスを許可すると
-- 列挙攻撃 (= 大量の token を試す) のリスクあり、 API Route で server-side
-- validation を経由させる。

-- 検証クエリ (= 適用後手動実行)
-- 1. テーブル作成確認:
--   select * from shared_links limit 1;
-- 2. ポリシー確認:
--   select tablename, policyname from pg_policies where tablename = 'shared_links';
--   → 期待: "Users can ..." 3 件
-- 3. index 確認:
--   select indexname from pg_indexes where tablename = 'shared_links';
--   → 期待: shared_links_pkey, shared_links_token_key, shared_links_token_idx, shared_links_created_by_idx

-- Rollback
--   drop table if exists shared_links;
