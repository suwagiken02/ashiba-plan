import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

const SHARE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;  // 7 日

type CreateShareBody = {
  projectId?: unknown;
};

/**
 * POST /api/share/create
 * 共有 URL 発行 (= 送信者用)。
 *
 * フロー (= 6 ステップ):
 *   1. JSON ボディ受信 + projectId 型確認
 *   2. 認証チェック (= Cookie Auth セッション、 未認証なら 401)
 *   3. project の所有確認 (= supabaseAdmin で owner_id === user.id 検証、
 *      他人のプロジェクトなら 403)
 *   4. 7 日後の expires_at 計算
 *   5. shared_links INSERT (= token は gen_random_uuid() で自動生成)
 *   6. 201 + { token, expiresAt } 返却
 *
 * セキュリティ:
 *   - 認証必須 (= middleware と同じ Cookie Auth)
 *   - 自分の project のみ共有可能 (= owner_id 検証)
 *   - token は UUID v4 (= 推測困難 122 bit)
 */
export async function POST(request: Request) {
  // Step 1: JSON ボディ受信 + 型確認
  let body: CreateShareBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が正しくありません' }, { status: 400 });
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : null;
  if (!projectId) {
    return NextResponse.json({ error: 'リクエスト形式が正しくありません' }, { status: 400 });
  }

  // Step 2: 認証チェック (= Cookie Auth セッション)
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          // Route Handler では Cookie 書き込み不要 (= 認証チェックのみ)
        },
      },
    },
  );
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  }
  const userId = session.user.id;

  // Step 3: project の所有確認 (= supabaseAdmin で SELECT)
  const { data: project, error: fetchError } = await supabaseAdmin
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: '共有 URL の発行に失敗しました' }, { status: 500 });
  }
  if (!project || project.owner_id !== userId) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 403 });
  }

  // Step 4: 7 日後の expires_at 計算
  const expiresAt = new Date(Date.now() + SHARE_DURATION_MS).toISOString();

  // Step 5: shared_links INSERT (= token は DB 側 gen_random_uuid() で自動生成)
  const { data: shareData, error: insertError } = await supabaseAdmin
    .from('shared_links')
    .insert({
      project_id: projectId,
      created_by: userId,
      expires_at: expiresAt,
    })
    .select('token, expires_at')
    .single();

  if (insertError || !shareData) {
    return NextResponse.json({ error: '共有 URL の発行に失敗しました' }, { status: 500 });
  }

  // Step 6: 成功
  return NextResponse.json(
    {
      token: shareData.token,
      expiresAt: shareData.expires_at,
    },
    { status: 201 },
  );
}
