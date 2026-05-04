'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

export default function AuthPage() {
  const router = useRouter();
  const { signIn, signUp, signInWithGoogle, signUpWithId, signInWithId } = useAuthStore();
  // Step 2c: ログイン / サインアップ モード切替 (= isSignUp と setIsSignUp は派生で温存)
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const isSignUp = mode === 'signup';
  const setIsSignUp = (val: boolean) => setMode(val ? 'signup' : 'login');
  const [activeTab, setActiveTab] = useState<'email' | 'id'>('email');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  // ID/PW 認証用 state (= ID タブで使用)
  const [username, setUsername] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  // 生年月日 3 dropdown (= 簡易 31 日固定、 submit 時に isValidDate で正規化)
  // SSR hydration 対策: 初期値計算を useState 初期化関数で client 側に閉じる
  const [currentYear] = useState(() => new Date().getFullYear());
  const [birthYear, setBirthYear] = useState(() => new Date().getFullYear() - 30);
  const [birthMonth, setBirthMonth] = useState(1);
  const [birthDay, setBirthDay] = useState(1);
  const [pin, setPin] = useState('');
  // 確認入力 (= サインアップ時のタイポ防止、 サーバーには送らない)
  // confirmPassword は メアド/PW タブと ID タブで共有 (= タブ切替時の値残存は許容)
  const [confirmUsername, setConfirmUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPinWarning, setShowPinWarning] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isSignUp) {
      // 確認入力チェック (= メアド/PW サインアップ時のみ、 不一致なら error + return)
      if (email !== confirmEmail) {
        setError('メールアドレスが一致しません');
        return;
      }
      if (password !== confirmPassword) {
        setError('パスワードが一致しません');
        return;
      }
    }
    setLoading(true);

    let err: string | null;
    if (isSignUp) {
      err = await signUp(email, password);
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

  /** PIN-生年月日 同一警告判定 (= サーバー側と同じ 3 パターン: MMDD / DDMM / YYYY) */
  const isPinMatchingBirthDate = (pinValue: string, birthDateValue: string): boolean => {
    if (!/^\d{4}$/.test(pinValue) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateValue)) return false;
    const [y, m, d] = birthDateValue.split('-');
    return pinValue === `${m}${d}` || pinValue === `${d}${m}` || pinValue === y;
  };

  /** 月の日数を考慮した正規日付チェック (= 2 月 30 日 等を弾く) */
  const isValidDate = (y: number, m: number, d: number): boolean => {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };

  /** 生年月日 state を 'YYYY-MM-DD' に整形 */
  const buildBirthDateStr = (y: number, m: number, d: number): string =>
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  /** ID/PW サインアップの実 submit (= 警告 Modal の「このまま登録」 でも呼ぶ) */
  const submitIdSignUp = async (acknowledgeWarning: boolean) => {
    const birthDateStr = buildBirthDateStr(birthYear, birthMonth, birthDay);
    setError('');
    setLoading(true);
    const err = await signUpWithId({
      username, password, lastName, firstName, birthDate: birthDateStr, pin,
      acknowledgePinWarning: acknowledgeWarning,
    });
    if (err === 'pin-matches-birthdate') {
      // サーバー側からの警告 (= クライアント検証をすり抜けたケースのフォールバック)
      setShowPinWarning(true);
      setLoading(false);
      return;
    }
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      router.replace('/projects');
    }
  };

  const handleIdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp) {
      // 確認入力チェック (= 不一致なら error + submit ブロック、 ボタン無効化はしない)
      if (username !== confirmUsername) {
        setError('ID が一致しません');
        return;
      }
      if (password !== confirmPassword) {
        setError('パスワードが一致しません');
        return;
      }
      if (pin !== confirmPin) {
        setError('PIN が一致しません');
        return;
      }
      // 生年月日 妥当性チェック (= 2 月 30 日 等を弾く)
      if (!isValidDate(birthYear, birthMonth, birthDay)) {
        setError('生年月日が正しくありません (= 月の日数を確認してください)');
        return;
      }
      // クライアント側 早期警告判定 (= サーバーラウンドトリップ削減)
      const birthDateStr = buildBirthDateStr(birthYear, birthMonth, birthDay);
      if (isPinMatchingBirthDate(pin, birthDateStr)) {
        setError('');
        setShowPinWarning(true);
        return;
      }
      await submitIdSignUp(false);
    } else {
      // ログイン (= 確認入力なし)
      setError('');
      setLoading(true);
      const err = await signInWithId(username, password);
      if (err) {
        setError(err);
        setLoading(false);
      } else {
        router.replace('/projects');
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-accent mb-2">CAD パスポート</h1>
          <p className="text-dimension text-sm">{isSignUp ? 'アカウント作成' : '足場平面図アプリ'}</p>
        </div>

        {/* タブバー (= mode 共通、 ラベルはシンプル化) */}
        <div className="flex gap-1 mb-5 bg-dark-surface border border-dark-border rounded-lg p-1">
          <button
            type="button"
            onClick={() => { setActiveTab('email'); setError(''); }}
            className={`flex-1 py-2 rounded-md text-xs font-bold transition-colors ${
              activeTab === 'email' ? 'bg-accent text-white' : 'text-dimension'
            }`}
          >
            メールアドレス
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('id'); setError(''); }}
            className={`flex-1 py-2 rounded-md text-xs font-bold transition-colors ${
              activeTab === 'id' ? 'bg-accent text-white' : 'text-dimension'
            }`}
          >
            ID
          </button>
        </div>

        {activeTab === 'email' && (
          <>
            {/* Google OAuth ログイン */}
            <button
              type="button"
              onClick={async () => {
                setError('');
                setLoading(true);
                const err = await signInWithGoogle();
                if (err) {
                  setError(err);
                  setLoading(false);
                }
                // 成功時は Supabase が OAuth プロバイダーへリダイレクトするため
                // ここから先は実行されない (= /auth/callback に戻ってきて続きを処理)
              }}
              disabled={loading}
              className="w-full py-3 mb-4 bg-white text-gray-700 font-bold rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Google でログイン
            </button>

            {/* 区切り線 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-dark-border"></div>
              <span className="text-xs text-dimension">または</span>
              <div className="flex-1 h-px bg-dark-border"></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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

              {isSignUp && (
                <div>
                  <label className="block text-sm text-dimension mb-1">メールアドレス (確認)</label>
                  <input
                    type="email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    placeholder="もう一度入力"
                    required={isSignUp}
                  />
                  {confirmEmail && email !== confirmEmail && (
                    <p className="mt-1 text-[10px] text-red-400">⚠ メールアドレスが一致しません</p>
                  )}
                </div>
              )}

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

              {isSignUp && (
                <div>
                  <label className="block text-sm text-dimension mb-1">パスワード (確認)</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    placeholder="もう一度入力"
                    minLength={6}
                    required={isSignUp}
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="mt-1 text-[10px] text-red-400">⚠ パスワードが一致しません</p>
                  )}
                </div>
              )}

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
          </>
        )}

        {activeTab === 'id' && (
          <form onSubmit={handleIdSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-dimension mb-1">ID</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                placeholder="yamada123"
                pattern="[a-zA-Z0-9_-]{3,32}"
                title="半角英数字 + アンダースコア + ハイフンの 3〜32 文字"
                required
              />
            </div>

            {isSignUp && (
              <>
                <div>
                  <label className="block text-sm text-dimension mb-1">ID (確認)</label>
                  <input
                    type="text"
                    value={confirmUsername}
                    onChange={(e) => setConfirmUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    placeholder="もう一度入力"
                    required={isSignUp}
                  />
                  {confirmUsername && username !== confirmUsername && (
                    <p className="mt-1 text-[10px] text-red-400">⚠ ID が一致しません</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm text-dimension mb-1">姓</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                      placeholder="山田"
                      maxLength={32}
                      required={isSignUp}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-dimension mb-1">名</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                      placeholder="太郎"
                      maxLength={32}
                      required={isSignUp}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-dimension mb-1">生年月日</label>
                  <div className="flex gap-2">
                    <select
                      value={birthYear}
                      onChange={(e) => setBirthYear(Number(e.target.value))}
                      className="flex-1 px-2 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    >
                      {Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i).map((y) => (
                        <option key={y} value={y}>{y} 年</option>
                      ))}
                    </select>
                    <select
                      value={birthMonth}
                      onChange={(e) => setBirthMonth(Number(e.target.value))}
                      className="flex-1 px-2 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>{m} 月</option>
                      ))}
                    </select>
                    <select
                      value={birthDay}
                      onChange={(e) => setBirthDay(Number(e.target.value))}
                      className="flex-1 px-2 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d} 日</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

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

            {isSignUp && (
              <div>
                <label className="block text-sm text-dimension mb-1">パスワード (確認)</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                  placeholder="もう一度入力"
                  minLength={6}
                  required={isSignUp}
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-[10px] text-red-400">⚠ パスワードが一致しません</p>
                )}
              </div>
            )}

            {isSignUp && (
              <>
                <div>
                  <label className="block text-sm text-dimension mb-1">4 桁 PIN (= 復旧用)</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    placeholder="0000"
                    pattern="\d{4}"
                    maxLength={4}
                    title="4 桁の数字"
                    required={isSignUp}
                  />
                  <p className="mt-1 text-[10px] text-dimension">
                    パスワードを忘れたとき、 ID + 姓 + 名 + 生年月日 + PIN で復旧できます
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-dimension mb-1">4 桁 PIN (確認)</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    placeholder="もう一度入力"
                    pattern="\d{4}"
                    maxLength={4}
                    required={isSignUp}
                  />
                  {confirmPin && pin !== confirmPin && (
                    <p className="mt-1 text-[10px] text-red-400">⚠ PIN が一致しません</p>
                  )}
                </div>
              </>
            )}

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
        )}

        <button
          onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
          className="w-full mt-4 py-3 text-accent text-sm hover:underline"
        >
          {isSignUp ? 'アカウントをお持ちの方はログイン' : '新規アカウント作成'}
        </button>
      </div>

      {/* PIN-生年月日 同一警告 Modal (= showLockedAlert パターン、 z-[70]) */}
      {showPinWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPinWarning(false)} />
          <div className="relative bg-dark-surface border border-dark-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <p className="font-bold text-sm mb-2">PIN が生年月日と同じです</p>
            <p className="text-xs text-dimension leading-relaxed mb-4">
              セキュリティ上、 推奨されません。<br />
              生年月日から推測されやすいため、 別の 4 桁を選ぶことをお勧めします。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPinWarning(false)}
                className="flex-1 py-2.5 border border-dark-border text-dimension font-bold rounded-xl text-sm"
              >
                PIN を変更
              </button>
              <button
                onClick={async () => {
                  setShowPinWarning(false);
                  await submitIdSignUp(true);
                }}
                className="flex-1 py-2.5 bg-accent text-white font-bold rounded-xl text-sm"
              >
                このまま登録
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
