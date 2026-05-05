'use client';

import { useState } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
};

/**
 * パスワード入力欄 (= Step 2d 改善 6)。
 *
 * 既存の `<input type="password" ... />` パターンと互換の className を持ちつつ、
 * 右端に目アイコンボタンで表示/非表示トグルを提供する。
 *
 * - SVG inline (= 既存 Google ボタンと同じパターン、 新規依存追加なし)
 * - showPwd state は内部管理 (= 各インスタンスで独立)
 * - input の className は既存と同じ + pr-11 (= 右端ボタン分の余白)
 * - 確認入力欄でもタイポ目視確認に有用なため、 「(確認)」 入力欄でもこのコンポーネントを使う
 */
export default function PasswordInput({ value, onChange, placeholder, required, minLength }: Props) {
  const [showPwd, setShowPwd] = useState(false);
  return (
    <div className="relative">
      <input
        type={showPwd ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 pr-11 bg-dark-surface border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
        placeholder={placeholder}
        required={required}
        minLength={minLength}
      />
      <button
        type="button"
        onClick={() => setShowPwd((prev) => !prev)}
        aria-label={showPwd ? 'パスワードを隠す' : 'パスワードを表示'}
        title={showPwd ? '隠す' : '表示'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-dimension hover:text-canvas"
      >
        {showPwd ? (
          // EyeOff (= 表示中、 クリックで隠す)
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          // Eye (= 非表示中、 クリックで表示)
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
