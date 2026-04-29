'use client';

import React from 'react';

// Phase I-5: 「部材変更」ボタングループの共通コンポーネント。
// 順次決定モーダル (Phase I-3-fix2) と割付結果画面 (Phase I-5) の両方で利用。
// 同じ離れ (offsetIdx) で rails パターン (variationIdx) を切替えるための UI。

const arrowBtnClass =
  'px-2 py-1 text-xs rounded bg-dark-border/50 text-dimension hover:bg-dark-border hover:text-canvas disabled:opacity-30 disabled:cursor-not-allowed';

type Props = {
  variationIdx: number;
  variationCount: number;
  onChange: (direction: 'next' | 'prev') => void;
};

export default function VariationChangeButtons({ variationIdx, variationCount, onChange }: Props) {
  const prevDisabled = variationIdx === 0;
  const nextDisabled = variationIdx + 1 >= variationCount;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange('prev')}
          disabled={prevDisabled}
          className={arrowBtnClass}
          title="前の rails パターンに戻る"
        >
          ←
        </button>
        <span className="text-xs text-dimension/70 px-1 select-none">部材変更</span>
        <button
          onClick={() => onChange('next')}
          disabled={nextDisabled}
          className={arrowBtnClass}
          title="次の rails パターンに切替"
        >
          →
        </button>
      </div>
      <span className="text-[10px] font-mono text-dimension/50">
        {variationIdx + 1}/{variationCount}
      </span>
    </div>
  );
}
