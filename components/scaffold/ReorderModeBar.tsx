'use client';

import React, { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

// Phase K-1: 入れ替えモード中の終了バー。
// 画面上部中央にフローティング表示し、「終了」ボタン + Esc キーで解除可能。
// MoveSelectRangePanel と同じパターン (top-24 配置、半透明背景)。

export default function ReorderModeBar() {
  const isReorderMode = useCanvasStore(s => s.isReorderMode);
  const toggleReorderMode = useCanvasStore(s => s.toggleReorderMode);

  // Esc キーで解除 (既存パターン: MoveSelectRangePanel と同じ)
  useEffect(() => {
    if (!isReorderMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        toggleReorderMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isReorderMode, toggleReorderMode]);

  if (!isReorderMode) return null;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-24 z-30 bg-dark-surface/95 backdrop-blur-sm border border-dark-border rounded-2xl shadow-2xl p-3 w-[300px] max-w-[calc(100vw-24px)]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">⇄</span>
        <span className="text-xs font-bold text-canvas">入れ替えモード</span>
      </div>
      <button
        onClick={toggleReorderMode}
        className="w-full py-2 rounded-lg bg-dark-bg border border-dark-border text-dimension text-xs font-bold hover:text-canvas transition-colors"
      >
        終了
      </button>
    </div>
  );
}
