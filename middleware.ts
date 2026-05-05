import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * 認証ガード middleware (= Day 7 commit A)。
 *
 * - 未ログイン状態で認証必須ページにアクセス → /auth へリダイレクト
 * - 認証済で /auth ページにアクセス → /projects へリダイレクト
 * - 認証不要パス: /auth/* (= ログイン / 復旧 / OAuth callback) と /api/auth/*
 *
 * Supabase Cookie ベースのセッション判定 (= server-side、 高速)。
 * @supabase/ssr を利用 (= @supabase/auth-helpers-nextjs は deprecated、 公式現行推奨)。
 *
 * 注: 認証必須化により、 authStore の匿名サインイン (= signInAnonymously) は
 * 無効化される (= middleware が先に /auth へリダイレクトするため)。
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );
  const { data: { session } } = await supabase.auth.getSession();

  const path = req.nextUrl.pathname;
  // 認証不要パス (= /auth および /api/auth で始まるパス)
  const isPublicPath = path.startsWith('/auth') || path.startsWith('/api/auth');

  // 未ログイン + 認証必須パス → /auth へリダイレクト
  if (!session && !isPublicPath) {
    return NextResponse.redirect(new URL('/auth', req.url));
  }

  // 認証済 + /auth ルート (= ログインページ自体) → /projects へリダイレクト
  // /auth/callback や /auth/recover は path === '/auth' ではないため対象外 (= フロー途中で許可)
  if (session && path === '/auth') {
    return NextResponse.redirect(new URL('/projects', req.url));
  }

  return res;
}

export const config = {
  // 静的ファイル / 画像最適化 / favicon を middleware 対象外 (= パフォーマンス)
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
