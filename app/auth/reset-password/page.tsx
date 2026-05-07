'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password/confirm`,
      });
      if (error) {
        setError(error.message || 'リセットメールの送信に失敗しました');
        setLoading(false);
        return;
      }
      setSubmitted(true);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'リセットメールの送信に失敗しました');
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-accent mb-2">CAD パスポート</h1>
          <p className="text-dimension text-sm">メールアドレスでパスワード再設定</p>
        </div>

        {submitted ? (
          <div className="bg-dark-surface border border-success/40 rounded-lg p-5 text-center mb-4">
            <p className="text-sm font-bold text-success mb-2">✅ メールを送信しました</p>
            <p className="text-xs text-dimension leading-relaxed">
              ご登録のメールアドレス宛に再設定リンクを送信しました。 メール内のリンクから新しいパスワードを設定してください。
            </p>
            <p className="mt-3 text-[10px] text-dimension">
              ※ メールが届かない場合: 迷惑メールフォルダもご確認ください。
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-dimension mb-1">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                placeholder="user@example.com"
                autoComplete="email"
                required
              />
              <p className="mt-1 text-[10px] text-dimension">
                ご登録のメールアドレスを入力してください。 再設定リンクをメールで送信します。
              </p>
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent text-white font-bold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {loading ? '処理中...' : '再設定メールを送信'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => router.push('/auth')}
          className="w-full mt-4 py-3 text-accent text-sm hover:underline"
        >
          ← ログイン画面に戻る
        </button>
      </div>
    </div>
  );
}
