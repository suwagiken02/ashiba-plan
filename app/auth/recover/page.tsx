'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RecoverPage() {
  const router = useRouter();
  const [recoveryTab, setRecoveryTab] = useState<'password' | 'id'>('password');

  // 共通入力 (= PW タブ / ID タブ 両方で使う)
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  // 生年月日 3 dropdown (= Step 2b 踏襲、 SSR hydration 対策)
  const [currentYear] = useState(() => new Date().getFullYear());
  const [birthYear, setBirthYear] = useState(() => new Date().getFullYear() - 30);
  const [birthMonth, setBirthMonth] = useState(1);
  const [birthDay, setBirthDay] = useState(1);
  const [pin, setPin] = useState('');

  // PW 復旧用
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // ID 復旧用 (= 既存 PW)
  const [password, setPassword] = useState('');

  // 結果表示用
  const [recoveredId, setRecoveredId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /** 月の日数を考慮した正規日付チェック (= 2 月 30 日 等を弾く) */
  const isValidDate = (y: number, m: number, d: number): boolean => {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };

  /** 生年月日 state を 'YYYY-MM-DD' に整形 */
  const buildBirthDateStr = (y: number, m: number, d: number): string =>
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const handleRecoverPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage(null);

    // 確認入力チェック (= 新 PW のみ、 不一致なら error + return)
    if (newPassword !== confirmNewPassword) {
      setError('新しいパスワードが一致しません');
      return;
    }
    // 生年月日 妥当性チェック
    if (!isValidDate(birthYear, birthMonth, birthDay)) {
      setError('生年月日が正しくありません (= 月の日数を確認してください)');
      return;
    }

    setLoading(true);
    try {
      const birthDateStr = buildBirthDateStr(birthYear, birthMonth, birthDay);
      const res = await fetch('/api/auth/recover-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username, lastName, firstName,
          birthDate: birthDateStr,
          pin, newPassword,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'パスワードの更新に失敗しました');
        setLoading(false);
        return;
      }
      setSuccessMessage(typeof data?.message === 'string' ? data.message : 'パスワードを更新しました');
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスワードの更新に失敗しました');
      setLoading(false);
    }
  };

  const handleRecoverId = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRecoveredId(null);

    if (!isValidDate(birthYear, birthMonth, birthDay)) {
      setError('生年月日が正しくありません (= 月の日数を確認してください)');
      return;
    }

    setLoading(true);
    try {
      const birthDateStr = buildBirthDateStr(birthYear, birthMonth, birthDay);
      const res = await fetch('/api/auth/recover-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastName, firstName,
          birthDate: birthDateStr,
          password, pin,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'ID の復旧に失敗しました');
        setLoading(false);
        return;
      }
      if (typeof data?.username === 'string') {
        setRecoveredId(data.username);
      } else {
        setError('ID を取得できませんでした');
      }
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ID の復旧に失敗しました');
      setLoading(false);
    }
  };

  const showResult = recoveredId !== null || successMessage !== null;

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-accent mb-2">CAD パスポート</h1>
          <p className="text-dimension text-sm">アカウント復旧</p>
        </div>

        {showResult ? (
          /* 結果表示 (= PW 更新成功 or ID 復旧成功) */
          <div className="bg-dark-surface border border-accent/50 rounded-lg p-5 text-center mb-4">
            {recoveredId && (
              <>
                <p className="text-sm text-dimension mb-2">あなたの ID は</p>
                <p className="font-mono font-bold text-accent text-2xl mb-3 break-all">{recoveredId}</p>
                <p className="text-xs text-dimension">この ID をメモして、 ログイン画面に戻ってください</p>
              </>
            )}
            {successMessage && (
              <p className="text-sm text-canvas">{successMessage}</p>
            )}
          </div>
        ) : (
          <>
            {/* タブバー (= /auth と同じスタイル) */}
            <div className="flex gap-1 mb-5 bg-dark-surface border border-dark-border rounded-lg p-1">
              <button
                type="button"
                onClick={() => { setRecoveryTab('password'); setError(''); }}
                className={`flex-1 py-2 rounded-md text-xs font-bold transition-colors ${
                  recoveryTab === 'password' ? 'bg-accent text-white' : 'text-dimension'
                }`}
              >
                パスワードを忘れた
              </button>
              <button
                type="button"
                onClick={() => { setRecoveryTab('id'); setError(''); }}
                className={`flex-1 py-2 rounded-md text-xs font-bold transition-colors ${
                  recoveryTab === 'id' ? 'bg-accent text-white' : 'text-dimension'
                }`}
              >
                ID を忘れた
              </button>
            </div>

            {recoveryTab === 'password' && (
              <form onSubmit={handleRecoverPassword} className="space-y-4">
                <div>
                  <label className="block text-sm text-dimension mb-1">ID</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    placeholder="suwaniki01"
                    pattern="[a-zA-Z0-9_-]{3,32}"
                    title="半角英数字 + アンダースコア + ハイフンの 3〜32 文字"
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm text-dimension mb-1">姓</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                      placeholder="スワ"
                      maxLength={32}
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-dimension mb-1">名</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                      placeholder="ニキ"
                      maxLength={32}
                      required
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

                <div>
                  <label className="block text-sm text-dimension mb-1">4 桁 PIN</label>
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
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-dimension mb-1">新しいパスワード</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                    placeholder="6文字以上"
                    minLength={6}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-dimension mb-1">新しいパスワード (確認)</label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
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
                  {loading ? '処理中...' : 'パスワードを更新'}
                </button>
              </form>
            )}

            {recoveryTab === 'id' && (
              <form onSubmit={handleRecoverId} className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm text-dimension mb-1">姓</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                      placeholder="スワ"
                      maxLength={32}
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-dimension mb-1">名</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                      placeholder="ニキ"
                      maxLength={32}
                      required
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

                <div>
                  <label className="block text-sm text-dimension mb-1">4 桁 PIN</label>
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
                  {loading ? '処理中...' : 'ID を表示'}
                </button>
              </form>
            )}
          </>
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
