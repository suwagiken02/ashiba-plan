'use client';

import React, { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

// 平米計算 Phase D-2: 1F足場指定モード中の overlay bar。
// 画面上部中央にフローティング表示、 「完了」「キャンセル」 + Esc キーで解除可能。
// ReorderModeBar と同パターン (= top-24、 dark-surface)。

export default function AreaDesignationModeBar() {
  const isAreaDesignationMode = useCanvasStore((s) => s.isAreaDesignationMode);
  const commitAreaDesignation = useCanvasStore((s) => s.commitAreaDesignation);
  const cancelAreaDesignation = useCanvasStore((s) => s.cancelAreaDesignation);

  // Esc キーでキャンセル (= ReorderModeBar と同パターン)
  useEffect(() => {
    if (!isAreaDesignationMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelAreaDesignation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAreaDesignationMode, cancelAreaDesignation]);

  if (!isAreaDesignationMode) return null;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-24 z-30 bg-dark-surface/95 backdrop-blur-sm border border-dark-border rounded-2xl shadow-2xl p-3 w-[320px] max-w-[calc(100vw-24px)]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">㎡</span>
        <span className="text-xs font-bold text-canvas">1F足場指定モード</span>
      </div>
      <p className="text-[10px] text-dimension mb-3 leading-relaxed">
        タップで面一括 / 長押しで個別。 amber 色 = 1F指定。
      </p>
      <div className="flex gap-2">
        <button
          onClick={cancelAreaDesignation}
          className="flex-1 py-2 rounded-lg bg-dark-bg border border-dark-border text-dimension text-xs font-bold hover:text-canvas transition-colors"
        >
          キャンセル
        </button>
        <button
          onClick={commitAreaDesignation}
          className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-bold"
        >
          完了
        </button>
      </div>
    </div>
  );
}
