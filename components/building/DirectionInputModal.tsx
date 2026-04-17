'use client';
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore } from '@/stores/canvasStore';
import NumInput from '@/components/ui/NumInput';

type Props = { onClose: () => void };

const DIR_LABEL: Record<string, string> = {
  up: '↑ 上方向',
  down: '↓ 下方向',
  left: '← 左方向',
  right: '→ 右方向',
};

export default function DirectionInputModal({ onClose }: Props) {
  const { directionPoints, addDirectionPoint, pendingDirection, setPendingDirection } = useCanvasStore();
  const [distanceMm, setDistanceMm] = useState(3000);

  if (!pendingDirection) return null;

  const handleConfirm = () => {
    if (directionPoints.length === 0 || !pendingDirection) return;
    const last = directionPoints[directionPoints.length - 1];
    const distGrid = Math.round(distanceMm / 10);
    const next = { ...last };
    if (pendingDirection === 'up') next.y -= distGrid;
    if (pendingDirection === 'down') next.y += distGrid;
    if (pendingDirection === 'left') next.x -= distGrid;
    if (pendingDirection === 'right') next.x += distGrid;

    // 始点に近ければ自動完了
    const first = directionPoints[0];
    const dist = Math.hypot(next.x - first.x, next.y - first.y);
    if (directionPoints.length >= 3 && dist < 2) {
      useCanvasStore.getState().addBuilding({
        id: uuidv4(), type: 'polygon', points: [...directionPoints], fill: '#3d3d3a',
      });
      useCanvasStore.getState().clearDirectionPoints();
      useCanvasStore.getState().setBuildingInputMethod('template');
      useCanvasStore.getState().setMode('select');
      setPendingDirection(null);
      onClose();
      return;
    }

    addDirectionPoint(next);
    useCanvasStore.getState().setLastMoveDirection(pendingDirection);
    setPendingDirection(null);
    onClose();
  };

  const handleClose = () => {
    setPendingDirection(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-xs w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg">壁の長さ</h2>
        <p className="text-sm text-accent font-bold">{DIR_LABEL[pendingDirection]}</p>
        <p className="text-xs text-dimension">{directionPoints.length}点入力済み</p>

        {/* 距離入力 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-dimension">距離</span>
          <NumInput value={distanceMm} onChange={setDistanceMm} min={100} step={100}
            className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-right font-mono" />
          <span className="text-xs text-dimension">mm</span>
        </div>

        {/* よく使う距離プリセット */}
        <div className="flex flex-wrap gap-1.5">
          {[1000, 1800, 2000, 3000, 3640, 4000, 5000, 6000, 7280, 9100].map(mm => (
            <button key={mm} onClick={() => setDistanceMm(mm)}
              className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
                distanceMm === mm ? 'bg-accent text-white border-accent' : 'border-dark-border text-dimension'
              }`}>{mm}</button>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={handleClose}
            className="flex-1 py-2.5 border border-dark-border rounded-xl text-sm text-dimension">
            キャンセル
          </button>
          <button onClick={handleConfirm}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-bold">
            壁を追加
          </button>
        </div>
      </div>
    </div>
  );
}
