'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import PasswordInput from '@/components/ui/PasswordInput';

export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // URL fragment から自動的にセッション化されるのを待ち、 セッション有無を確認。
  // ⚠ PKCE flow (= ?code=xxx) の場合は exchangeCodeForSession に切り替え必要。
  // 実機テストで「リンクが無効です」 が常に出るようなら代替実装に変更。
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setHasSession(session !== null);
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmNewPassword) {
      setError('新しいパスワードが一致しません');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setError(error.message || 'パスワードの更新に失敗しました');
        setLoading(false);
        return;
      }
      // 成功 → サインアウトしてログイン画面に誘導 (= 改善 11 と同じ pattern)
      await supabase.auth.signOut();
      setLoading(false);
      router.replace('/auth?reset=success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'パスワードの更新に失敗しました');
      setLoading(false);
    }
  };

  // セッション確認中 (= ロード中)
  if (hasSession === null) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-dimension text-sm">確認中...</p>
        </div>
      </div>
    );
  }

  // セッションなし (= リンク無効/期限切れ) → fallback
  if (!hasSession) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-accent mb-2">CAD パスポート</h1>
            <p className="text-dimension text-sm">リンクが無効です</p>
          </div>
          <div className="bg-dark-surface border border-red-400/40 rounded-lg p-5 text-center mb-4">
            <p className="text-sm text-canvas mb-2">⚠ リンクが無効または有効期限切れです</p>
            <p className="text-xs text-dimension leading-relaxed">
              再設定リンクの有効期限は 1 時間です。 もう一度お試しください。
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/auth/reset-password')}
            className="w-full py-3 bg-accent text-white font-bold rounded-lg hover:bg-blue-600 transition-colors"
          >
            メールを再送信
          </button>
          <button
            type="button"
            onClick={() => router.push('/auth')}
            className="w-full mt-3 py-3 text-accent text-sm hover:underline"
          >
            ← ログイン画面に戻る
          </button>
        </div>
      </div>
    );
  }

  // セッションあり → 新 PW 入力フォーム
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-accent mb-2">CAD パスポート</h1>
          <p className="text-dimension text-sm">新しいパスワードを設定</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-dimension mb-1">新しいパスワード</label>
            <PasswordInput
              value={newPassword}
              onChange={setNewPassword}
              placeholder="6文字以上"
              minLength={6}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-dimension mb-1">新しいパスワード (確認)</label>
            <PasswordInput
              value={confirmNewPassword}
              onChange={setConfirmNewPassword}
              placeholder="もう一度入力"
              minLength={6}
              required
            />
            {confirmNewPassword && newPassword !== confirmNewPassword && (
              <p className="mt-1 text-[10px] text-red-400">⚠ パスワードが一致しません</p>
            )}
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-accent text-white font-bold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {loading ? '処理中...' : 'パスワードを設定'}
          </button>
        </form>
      </div>
    </div>
  );
}
