'use client';

import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { ModeType } from '@/types';

const MODES: { id: ModeType; label: string; icon: string }[] = [
  { id: 'select', label: '選択', icon: '↖' },
  { id: 'building', label: '建物', icon: '⌂' },
  { id: 'handrail', label: '手摺', icon: '━' },
  { id: 'post', label: '支柱', icon: '●' },
  { id: 'anti', label: 'ｱﾝﾁ', icon: '▭' },
  { id: 'obstacle', label: '障害物', icon: '⬒' },
  { id: 'memo', label: 'メモ', icon: 'T' },
  { id: 'erase', label: '消去', icon: '✕' },
];

export default function ModeToolbar() {
  const { mode, setMode, isMeasuring, toggleMeasuring, measureResultMm } = useCanvasStore();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-dark-surface border-t border-dark-border safe-area-bottom">
      <div className="flex justify-around items-center px-1 py-1 max-w-lg mx-auto">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              if (isMeasuring) toggleMeasuring();
              setMode(m.id);
            }}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg min-w-[44px] transition-colors ${
              mode === m.id && !isMeasuring
                ? 'bg-accent text-white'
                : 'text-dimension hover:text-canvas'
            }`}
          >
            <span className="text-lg leading-none">{m.icon}</span>
            <span className="text-[10px] mt-0.5">{m.label}</span>
          </button>
        ))}

        {/* 寸法計測ボタン */}
        <button
          onClick={toggleMeasuring}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg min-w-[44px] transition-colors ${
            isMeasuring
              ? 'bg-accent text-white'
              : 'text-dimension hover:text-canvas'
          }`}
        >
          <span className="text-lg leading-none">⤢</span>
          <span className="text-[10px] mt-0.5">寸法</span>
        </button>
      </div>

      {/* 計測結果表示 */}
      {isMeasuring && measureResultMm !== null && (
        <div className="flex justify-center pb-1">
          <span className="text-sm font-mono font-bold text-accent bg-accent/10 px-3 py-0.5 rounded-full">
            {measureResultMm}mm
          </span>
        </div>
      )}
    </div>
  );
}
