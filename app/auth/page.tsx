'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

export default function AuthPage() {
  const router = useRouter();
  const { signIn, signUp } = useAuthStore();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let err: string | null;
    if (isSignUp) {
      err = await signUp(email, password, companyName);
    } else {
      err = await signIn(email, password);
    }

    if (err) {
      setError(err);
      setLoading(false);
    } else {
      router.replace('/projects');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-accent mb-2">キャドパスポート</h1>
          <p className="text-dimension text-sm">足場平面図アプリ</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm text-dimension mb-1">会社名</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                placeholder="株式会社○○足場"
                required={isSignUp}
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-dimension mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
              placeholder="email@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-dimension mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
              placeholder="6文字以上"
              minLength={6}
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-accent text-white font-bold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {loading ? '処理中...' : isSignUp ? 'アカウント作成' : 'ログイン'}
          </button>
        </form>

        <button
          onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
          className="w-full mt-4 py-3 text-accent text-sm hover:underline"
        >
          {isSignUp ? 'アカウントをお持ちの方はログイン' : '新規アカウント作成'}
        </button>
      </div>
    </div>
  );
}
