'use client';
import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

type Props = {
  /** 追加のクラス名（例: ヘッダー内の余白調整用） */
  className?: string;
};

/**
 * PC 用ダークモード切替ボタン（sm 以上でのみ表示）。
 * スマホでは既存の設定パネル内のスイッチが使われるため、ここは hidden sm:inline-flex で抑止する。
 */
export default function DarkModeToggle({ className = '' }: Props) {
  const isDark = useCanvasStore(s => s.isDarkMode);
  const toggle = useCanvasStore(s => s.toggleDarkMode);

  return (
    <button
      onClick={toggle}
      title={isDark ? 'ライトモードに切替' : 'ダークモードに切替'}
      aria-label={isDark ? 'ライトモードに切替' : 'ダークモードに切替'}
      className={`hidden sm:inline-flex items-center justify-center w-9 h-9 text-lg text-dimension hover:text-canvas rounded-lg transition-colors ${className}`}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
