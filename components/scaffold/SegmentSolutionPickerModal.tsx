'use client';

import React from 'react';
import { SegmentSolution } from '@/lib/konva/segmentSplit';

type Props = {
  /** 表示する解候補リスト */
  solutions: SegmentSolution[];
  /** 現在選択中の解 index */
  selectedIdx: number;
  /** 対象の 2F 辺ラベル（例: "A 面 (北 / 9000mm)"）*/
  edgeLabel: string;
  /** 進捗表示用（例: "区間分割 1/2"） */
  progressLabel?: string;
  /** 解選択 */
  onSelect: (idx: number) => void;
  /** 前の辺へ戻る */
  onBack: () => void;
  /** モーダル全体キャンセル */
  onCancel: () => void;
};

/**
 * Phase H-3d-2c: 2F 辺の区間分割解選択モーダル。
 * 1 つの 2F 辺について、複数の SegmentSolution を提示してユーザーに選ばせる。
 */
export default function SegmentSolutionPickerModal({
  solutions, selectedIdx, edgeLabel, progressLabel, onSelect, onBack, onCancel,
}: Props) {
  if (solutions.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-dark-surface border-t sm:border border-dark-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto z-10">
        {/* ヘッダー */}
        <div className="px-4 py-3 border-b border-dark-border">
          <p className="font-bold text-sm">2F の手摺の切れ目を選んでください</p>
          <p className="text-xs text-dimension mt-0.5">
            {progressLabel ? `${progressLabel} / ` : ''}{edgeLabel}
          </p>
        </div>

        {/* 解候補リスト */}
        <div className="p-4 space-y-3">
          {solutions.map((sol, idx) => {
            const isSelected = idx === selectedIdx;
            return (
              <div
                key={idx}
                className={`p-3 border rounded-xl ${
                  isSelected ? 'border-accent bg-accent/10' : 'border-dark-border bg-dark-bg'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm">
                    案{idx + 1}{idx === 0 ? '（推奨）' : ''}
                  </span>
                  {sol.isFallback && (
                    <span className="text-[10px] bg-yellow-600/40 text-yellow-200 px-2 py-0.5 rounded">
                      ⚠ 近似解
                    </span>
                  )}
                </div>

                {/* 切れ目情報 */}
                <div className="text-[11px] text-dimension mb-1">
                  切れ目: {sol.breakpoints.length > 0
                    ? sol.breakpoints.map(bp => {
                        const baseMm = Math.round(bp.rootAxisCoord * 10);
                        const adjStr = bp.adjustmentMm === 0
                          ? ''
                          : (bp.adjustmentMm > 0 ? ` +${bp.adjustmentMm}` : ` ${bp.adjustmentMm}`);
                        return `${baseMm}mm 根本 → 離れ ${bp.appliedDistance1FMm}mm${adjStr}`;
                      }).join(' / ')
                    : 'なし（単一区間）'}
                </div>

                {/* 区間内訳 */}
                <div className="space-y-1 mb-2">
                  {sol.segments.map((seg, segIdx) => (
                    <div key={segIdx} className="text-[11px]">
                      <span className="text-dimension">区間{segIdx + 1}</span>
                      <span className="ml-1 font-mono text-canvas">{seg.lengthMm}mm</span>
                      <span className="ml-2 text-dimension">→</span>
                      <span className="ml-1 font-mono text-handrail">
                        {seg.rails.length > 0 ? seg.rails.join(' + ') : '（割付不能）'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* サマリ */}
                <div className="text-[10px] text-dimension mb-2">
                  合計 {sol.totalRailCount} 本 / 調整 ±{sol.totalAdjustmentMm}mm
                  {sol.maxAdjustmentMm > 0 && `（最大 ${sol.maxAdjustmentMm}mm）`}
                </div>

                {/* 選択ボタン */}
                <button
                  onClick={() => onSelect(idx)}
                  disabled={isSelected}
                  className={`w-full py-2 rounded-lg text-sm font-bold transition-colors ${
                    isSelected
                      ? 'bg-accent text-white cursor-default'
                      : 'border border-dark-border text-dimension hover:border-accent hover:text-accent'
                  }`}
                >
                  {isSelected ? '✓ 選択中' : 'この案で進む'}
                </button>
              </div>
            );
          })}
        </div>

        {/* フッター */}
        <div className="px-4 py-3 border-t border-dark-border flex gap-2 justify-between">
          <button
            onClick={onBack}
            className="px-3 py-2 text-xs border border-dark-border text-dimension rounded-xl"
          >
            ← 前の辺に戻る
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 text-xs border border-dark-border text-dimension rounded-xl"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
