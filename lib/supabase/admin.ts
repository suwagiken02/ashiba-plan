import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Service Role Key を使った Supabase admin client。
 *
 * 用途:
 *   - auth.admin.* の API 呼び出し (= ユーザー作成 / PW 更新 / 削除)
 *   - RLS を bypass した DB 操作 (= server-side 内のみ)
 *
 * 重要:
 *   - **このファイルは server-side (= API Route / Server Components) からのみ import すること**。
 *   - Client Component から import すると Service Role Key がブラウザに露出する。
 *   - 環境変数 SUPABASE_SERVICE_ROLE_KEY は NEXT_PUBLIC_ プレフィックスを **付けない** こと
 *     (= 付けると Next.js がブラウザに公開してしまう)。
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
