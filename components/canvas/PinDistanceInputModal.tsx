'use client';

import React, { useState } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import NumInput from '@/components/ui/NumInput';

const DIR_LABEL: Record<string, string> = {
  up: '↑ 上方向',
  down: '↓ 下方向',
  left: '← 左方向',
  right: '→ 右方向',
};

/**
 * ピン配置: 方向ボタン押下時の距離入力モーダル。
 * pinDirectionInput が設定されている時のみ表示。
 */
export default function PinDistanceInputModal() {
  const { pinDirectionInput, pinDraftOffset, setPinDirectionInput, setPinDraftOffset } = useCanvasStore();

  const [distanceMm, setDistanceMm] = useState<number>(900);

  if (!pinDirectionInput) return null;

  const handleClose = () => {
    setPinDirectionInput(null);
  };

  const handleConfirm = () => {
    const dist = Math.max(1, Math.min(99999, distanceMm));
    const cur = pinDraftOffset ?? { dx: 0, dy: 0 };
    let { dx, dy } = cur;
    if (pinDirectionInput === 'up') dy -= dist;
    else if (pinDirectionInput === 'down') dy += dist;
    else if (pinDirectionInput === 'left') dx -= dist;
    else if (pinDirectionInput === 'right') dx += dist;
    setPinDraftOffset({ dx, dy });
    setPinDirectionInput(null);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-xs w-full mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-bold text-lg">ピンの距離</h2>
        <p className="text-sm text-accent font-bold">{DIR_LABEL[pinDirectionInput]}</p>

        <div className="flex items-center gap-2">
          <span className="text-sm text-dimension">距離</span>
          <NumInput
            value={distanceMm}
            onChange={setDistanceMm}
            min={1}
            step={1}
            className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-right font-mono"
          />
          <span className="text-xs text-dimension">mm</span>
        </div>

        {/* よく使う距離プリセット */}
        {/* 尺貫法プリセット */}
        <div className="space-y-1">
          <p className="text-[10px] text-dimension">尺貫法</p>
          <div className="flex flex-wrap gap-1.5">
            {[455, 910, 1820, 2730].map((mm) => (
              <button
                key={mm}
                onClick={() => setDistanceMm(mm)}
                className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
                  distanceMm === mm ? 'bg-accent text-white border-accent' : 'border-dark-border text-dimension'
                }`}
              >
                {mm}
              </button>
            ))}
          </div>
        </div>

        {/* メーター方プリセット */}
        <div className="space-y-1">
          <p className="text-[10px] text-dimension">メーター方</p>
          <div className="flex flex-wrap gap-1.5">
            {[600, 900, 1200, 1500, 1800].map((mm) => (
              <button
                key={mm}
                onClick={() => setDistanceMm(mm)}
                className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
                  distanceMm === mm ? 'bg-accent text-white border-accent' : 'border-dark-border text-dimension'
                }`}
              >
                {mm}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 border border-dark-border rounded-xl text-sm text-dimension"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-bold"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
