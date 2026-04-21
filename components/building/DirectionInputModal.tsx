'use client';
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore } from '@/stores/canvasStore';
import NumInput from '@/components/ui/NumInput';
import { GRID_UNIT_MM } from '@/lib/konva/gridUtils';

type Props = { onClose: () => void };

const DIR_LABEL: Record<string, string> = {
  up: '↑ 上方向',
  down: '↓ 下方向',
  left: '← 左方向',
  right: '→ 右方向',
};

export default function DirectionInputModal({ onClose }: Props) {
  const { directionPoints, addDirectionPoint, pendingDirection, setPendingDirection, pendingDirectionTarget, setPendingDirectionTarget } = useCanvasStore();

  // 交点タップ時はターゲットから距離を算出して初期値にする
  const last = directionPoints.length > 0 ? directionPoints[directionPoints.length - 1] : null;
  const initialDistMm = pendingDirectionTarget && last
    ? Math.round(Math.sqrt(Math.pow((pendingDirectionTarget.x - last.x) * 10, 2) + Math.pow((pendingDirectionTarget.y - last.y) * 10, 2)))
    : 3000;

  const [distanceMm, setDistanceMm] = useState(initialDistMm);

  if (!pendingDirection) return null;

  const handleConfirm = () => {
    if (directionPoints.length === 0 || !pendingDirection) return;

    let next: { x: number; y: number };

    if (pendingDirectionTarget) {
      // 交点タップ: ターゲット座標をそのまま使う
      next = { ...pendingDirectionTarget };
    } else {
      // 4方向ボタン: 方向×距離で計算
      const currentLast = directionPoints[directionPoints.length - 1];
      const distGrid = distanceMm / GRID_UNIT_MM;
      next = { ...currentLast };
      if (pendingDirection === 'up') next.y -= distGrid;
      if (pendingDirection === 'down') next.y += distGrid;
      if (pendingDirection === 'left') next.x -= distGrid;
      if (pendingDirection === 'right') next.x += distGrid;
    }

    // 始点に近ければ自動完了
    const first = directionPoints[0];
    const dist = Math.hypot(next.x - first.x, next.y - first.y);
    if (directionPoints.length >= 3 && dist < 2) {
      const newId = uuidv4();
      const s = useCanvasStore.getState();
      const pts = [...directionPoints];
      if (s.pendingTargetType === 'obstacle' && s.pendingObstacleType) {
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        const maxX = Math.max(...xs), maxY = Math.max(...ys);
        s.addObstacle({ id: newId, type: s.pendingObstacleType, x: minX, y: minY, width: maxX - minX, height: maxY - minY, points: pts });
        s.setPendingTargetType('building');
        s.setPendingObstacleType(null);
      } else {
        const flr = s.pendingBuildingFloor;
        s.addBuilding({ id: newId, type: 'polygon', points: pts, fill: '#3d3d3a', floor: flr });
        s.setAutoOpenRoofForBuildingId(newId);
        s.setPendingBuildingFloor(1);
      }
      s.setLastCompletedDirectionSession({ points: pts });
      s.clearDirectionPoints();
      s.setBuildingInputMethod('template');
      s.setMode('select');
      cleanup();
      return;
    }

    addDirectionPoint(next);
    useCanvasStore.getState().setLastMoveDirection(pendingDirection);
    cleanup();
  };

  const cleanup = () => {
    setPendingDirection(null);
    setPendingDirectionTarget(null);
    onClose();
  };

  const handleClose = () => {
    cleanup();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-xs w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg">壁の長さ</h2>
        <p className="text-sm text-accent font-bold">{DIR_LABEL[pendingDirection]}</p>
        <p className="text-xs text-dimension">
          {directionPoints.length}点入力済み
          {pendingDirectionTarget && <span className="ml-2 text-orange-400">（交点タップ）</span>}
        </p>

        {/* 距離入力 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-dimension">距離</span>
          <NumInput value={distanceMm} onChange={setDistanceMm} min={100} step={1}
            className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-right font-mono" />
          <span className="text-xs text-dimension">mm</span>
        </div>

        {/* よく使う距離プリセット */}
        {!pendingDirectionTarget && (
          <div className="flex flex-wrap gap-1.5">
            {[1000, 1800, 2000, 3000, 3640, 4000, 5000, 6000, 7280, 9100].map(mm => (
              <button key={mm} onClick={() => setDistanceMm(mm)}
                className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
                  distanceMm === mm ? 'bg-accent text-white border-accent' : 'border-dark-border text-dimension'
                }`}>{mm}</button>
            ))}
          </div>
        )}

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
