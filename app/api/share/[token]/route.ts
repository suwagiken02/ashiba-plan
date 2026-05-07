import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/share/[token]
 * 共有 URL の概要取得 (= 受信者用、 取り込み前のプレビュー)。
 *
 * フロー (= 7 ステップ):
 *   1. token 形式確認 (= UUID v4 正規表現)
 *   2. 認証チェック (= Cookie Auth セッション)
 *   3. shared_links から token 検索 + expires_at > NOW() 確認
 *   4. project_id から projects 取得 (= name, address)
 *   5. drawings count 取得
 *   6. created_by から profiles.company_name 取得 (= 表示用、 NULL OK)
 *   7. レスポンス返却
 *
 * セキュリティ:
 *   - 認証必須
 *   - 期限切れは 410 Gone
 *   - 列挙攻撃防止: API Route 経由で server-side validation
 */
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  // Step 1: token 形式確認
  const token = params.token;
  if (!token || !UUID_REGEX.test(token)) {
    return NextResponse.json({ error: '共有 URL が無効です' }, { status: 404 });
  }

  // Step 2: 認証チェック
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  // Step 3: shared_links 検索 + 期限確認
  const { data: shareData, error: shareError } = await supabaseAdmin
    .from('shared_links')
    .select('project_id, created_by, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (shareError) {
    return NextResponse.json({ error: '共有情報の取得に失敗しました' }, { status: 500 });
  }
  if (!shareData) {
    return NextResponse.json({ error: '共有 URL が無効です' }, { status: 404 });
  }
  if (new Date(shareData.expires_at) < new Date()) {
    return NextResponse.json({ error: '共有 URL の有効期限が切れています' }, { status: 410 });
  }

  // Step 4: projects 取得
  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('name, address')
    .eq('id', shareData.project_id)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: '共有 URL が無効です' }, { status: 404 });
  }

  // Step 5: drawings count 取得
  const { count: drawingsCount, error: countError } = await supabaseAdmin
    .from('drawings')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', shareData.project_id);

  if (countError) {
    return NextResponse.json({ error: '共有情報の取得に失敗しました' }, { status: 500 });
  }

  // Step 6: profiles.company_name 取得 (= 共有者の会社名、 表示用)
  const { data: createdByProfile } = await supabaseAdmin
    .from('profiles')
    .select('company_name')
    .eq('id', shareData.created_by)
    .maybeSingle();

  // Step 7: レスポンス
  return NextResponse.json({
    project: {
      name: project.name,
      address: project.address,
    },
    drawings: {
      count: drawingsCount ?? 0,
    },
    expiresAt: shareData.expires_at,
    createdBy: {
      companyName: createdByProfile?.company_name ?? null,
    },
  });
}
