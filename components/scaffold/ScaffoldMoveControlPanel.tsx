'use client';
import React, { useState, useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import NumInput from '@/components/ui/NumInput';

const STEP_OPTIONS: (1 | 10 | 100)[] = [1, 10, 100];

export default function ScaffoldMoveControlPanel() {
  const {
    mode,
    scaffoldMoveStep,
    setScaffoldMoveStep,
    commitScaffoldMoveMode,
    cancelScaffoldMoveMode,
    resetScaffoldMoveMode,
    shiftAllScaffolds,
  } = useCanvasStore();

  const [dxInput, setDxInput] = useState(0);
  const [dyInput, setDyInput] = useState(0);

  // Esc でキャンセル
  useEffect(() => {
    if (mode !== 'move-scaffold') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelScaffoldMoveMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, cancelScaffoldMoveMode]);

  if (mode !== 'move-scaffold') return null;

  const step = scaffoldMoveStep;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-24 z-50 bg-dark-surface/95 backdrop-blur-sm border border-dark-border rounded-2xl shadow-2xl p-4 w-[340px] max-w-[calc(100vw-24px)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-canvas">足場 一括移動</h3>
        <span className="text-[10px] text-dimension">Esc でキャンセル</span>
      </div>

      {/* 数値入力（X / Y） */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-dimension w-6">X</span>
          <NumInput
            value={dxInput}
            onChange={setDxInput}
            min={-100000}
            step={1}
            className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-sm font-mono"
          />
          <span className="text-[10px] text-dimension">mm</span>
          <button
            onClick={() => { shiftAllScaffolds(dxInput, 0); setDxInput(0); }}
            className="px-3 py-1.5 rounded-lg bg-accent/15 border border-accent text-accent text-xs font-bold"
          >
            適用
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dimension w-6">Y</span>
          <NumInput
            value={dyInput}
            onChange={setDyInput}
            min={-100000}
            step={1}
            className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-sm font-mono"
          />
          <span className="text-[10px] text-dimension">mm</span>
          <button
            onClick={() => { shiftAllScaffolds(0, dyInput); setDyInput(0); }}
            className="px-3 py-1.5 rounded-lg bg-accent/15 border border-accent text-accent text-xs font-bold"
          >
            適用
          </button>
        </div>
      </div>

      {/* 単位切替 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-dimension shrink-0">ステップ:</span>
        {STEP_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setScaffoldMoveStep(s)}
            className={`flex-1 py-1 rounded-lg text-xs font-mono border transition-colors ${
              step === s ? 'bg-accent text-white border-accent' : 'border-dark-border text-dimension'
            }`}
          >
            {s}mm
          </button>
        ))}
      </div>

      {/* 矢印ボタン */}
      <div className="grid grid-cols-3 gap-1 mb-3 w-40 mx-auto">
        <div />
        <button
          onClick={() => shiftAllScaffolds(0, -step)}
          className="h-10 rounded-lg bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-lg"
          aria-label="上に移動"
        >
          ↑
        </button>
        <div />
        <button
          onClick={() => shiftAllScaffolds(-step, 0)}
          className="h-10 rounded-lg bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-lg"
          aria-label="左に移動"
        >
          ←
        </button>
        <div className="h-10 flex items-center justify-center text-[10px] text-dimension font-mono">
          {step}mm
        </div>
        <button
          onClick={() => shiftAllScaffolds(step, 0)}
          className="h-10 rounded-lg bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-lg"
          aria-label="右に移動"
        >
          →
        </button>
        <div />
        <button
          onClick={() => shiftAllScaffolds(0, step)}
          className="h-10 rounded-lg bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-lg"
          aria-label="下に移動"
        >
          ↓
        </button>
        <div />
      </div>

      {/* 確定 / リセット / キャンセル */}
      <div className="flex gap-2">
        <button
          onClick={cancelScaffoldMoveMode}
          className="flex-1 py-2 rounded-lg bg-dark-bg border border-dark-border text-dimension text-xs font-bold"
        >
          キャンセル
        </button>
        <button
          onClick={resetScaffoldMoveMode}
          className="flex-1 py-2 rounded-lg bg-dark-bg border border-dark-border text-dimension text-xs font-bold"
        >
          リセット
        </button>
        <button
          onClick={commitScaffoldMoveMode}
          className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-bold"
        >
          確定
        </button>
      </div>

      <p className="mt-2 text-[10px] text-dimension text-center">
        キャンバスで足場をドラッグして動かすこともできます
      </p>
    </div>
  );
}
