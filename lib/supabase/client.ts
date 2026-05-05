import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

// @supabase/ssr の createBrowserClient: Cookie ベースのセッション管理。
// middleware (= createServerClient) と同じ Cookie を読み書きするので、
// ログイン後に middleware が正しくセッションを認識する (= Day 7 commit A bug fix)。
// API は createClient と互換 (= supabase.auth.* / supabase.from(...) は無変更で動作)。
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
