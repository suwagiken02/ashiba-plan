'use client';
import React, { useState, useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import NumInput from '@/components/ui/NumInput';

const STEP_OPTIONS: (1 | 10 | 100)[] = [1, 10, 100];

export default function MoveSelectMovePanel() {
  const {
    moveSelectMode,
    moveSelectStepMm,
    setMoveSelectStepMm,
    shiftMoveSelected,
    backToSelect,
    commitMoveSelectMode,
    cancelMoveSelectMode,
  } = useCanvasStore();

  const [dxInput, setDxInput] = useState(0);
  const [dyInput, setDyInput] = useState(0);

  const show = moveSelectMode.active && moveSelectMode.step === 'move';

  // Esc でフロー完全終了
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelMoveSelectMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, cancelMoveSelectMode]);

  if (!show) return null;

  const { selectedIds, dxMm, dyMm } = moveSelectMode;
  const step = moveSelectStepMm;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-24 z-30 bg-dark-surface/95 backdrop-blur-sm border border-dark-border rounded-2xl shadow-2xl p-3 w-[340px] max-w-[calc(100vw-24px)]">
      {/* ヘッダー: 件数 + 累積 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-canvas">
          移動中: <span className="text-accent font-bold">{selectedIds.length}</span>個
        </span>
        <span className="text-[11px] text-dimension font-mono">
          X={dxMm}mm / Y={dyMm}mm
        </span>
      </div>

      {/* X/Y 数値入力 + 適用（X Y を 1 行に） */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] text-dimension shrink-0">X</span>
        <NumInput
          value={dxInput}
          onChange={setDxInput}
          min={-100000}
          step={1}
          className="flex-1 min-w-0 bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs font-mono"
        />
        <button
          onClick={() => { shiftMoveSelected(dxMm + dxInput, dyMm); setDxInput(0); }}
          className="px-2 py-1 rounded bg-accent/15 border border-accent text-accent text-[11px] font-bold shrink-0"
        >
          適用
        </button>
        <span className="text-[11px] text-dimension shrink-0">Y</span>
        <NumInput
          value={dyInput}
          onChange={setDyInput}
          min={-100000}
          step={1}
          className="flex-1 min-w-0 bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs font-mono"
        />
        <button
          onClick={() => { shiftMoveSelected(dxMm, dyMm + dyInput); setDyInput(0); }}
          className="px-2 py-1 rounded bg-accent/15 border border-accent text-accent text-[11px] font-bold shrink-0"
        >
          適用
        </button>
      </div>

      {/* 矢印 + ステップ切替 1行 */}
      <div className="flex items-center gap-1.5 mb-3">
        <div className="flex gap-0.5">
          <button
            onClick={() => shiftMoveSelected(dxMm - step, dyMm)}
            className="w-8 h-8 rounded bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-sm"
            aria-label="左"
          >←</button>
          <button
            onClick={() => shiftMoveSelected(dxMm, dyMm - step)}
            className="w-8 h-8 rounded bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-sm"
            aria-label="上"
          >↑</button>
          <button
            onClick={() => shiftMoveSelected(dxMm, dyMm + step)}
            className="w-8 h-8 rounded bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-sm"
            aria-label="下"
          >↓</button>
          <button
            onClick={() => shiftMoveSelected(dxMm + step, dyMm)}
            className="w-8 h-8 rounded bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-sm"
            aria-label="右"
          >→</button>
        </div>
        <div className="flex gap-0.5 flex-1">
          {STEP_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setMoveSelectStepMm(s)}
              className={`flex-1 h-8 rounded text-[11px] font-mono border transition-colors ${
                step === s ? 'bg-accent text-white border-accent' : 'border-dark-border text-dimension'
              }`}
            >
              {s}mm
            </button>
          ))}
        </div>
      </div>

      {/* アクション */}
      <div className="flex gap-2">
        <button
          onClick={backToSelect}
          className="flex-1 py-2 rounded-lg bg-dark-bg border border-dark-border text-dimension text-xs font-bold"
        >
          戻る
        </button>
        <button
          onClick={() => shiftMoveSelected(0, 0)}
          className="flex-1 py-2 rounded-lg bg-dark-bg border border-dark-border text-dimension text-xs font-bold"
        >
          リセット
        </button>
        <button
          onClick={commitMoveSelectMode}
          className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-bold"
        >
          確定
        </button>
      </div>
    </div>
  );
}
