'use client';

import React from 'react';
import { Layer, Rect, Circle, Text, Line } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';
import { snapObstacleToWall, snapToMagnetPin } from '@/lib/konva/snapUtils';
import { ObstacleType, Obstacle } from '@/types';

const OBSTACLE_COLORS: Record<ObstacleType, string> = {
  ecocute: '#B5D4F4',
  aircon: '#C0DD97',
  bay_window: '#FAC775',
  carport: '#CECBF6',
  sunroom: '#F5C4B3',
  custom_rect: '#D3D1C7',
  custom_circle: '#D3D1C7',
};

const OBSTACLE_LABELS: Record<ObstacleType, string> = {
  ecocute: 'エコキュート',
  aircon: '室外機',
  bay_window: '出窓',
  carport: 'カーポート',
  sunroom: 'サンルーム',
  custom_rect: '',
  custom_circle: '',
};

export default function ObstacleLayer() {
  const { canvasData, zoom, panX, panY, mode, selectedIds, moveSelectMode } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;
  const effectiveSelectedIds = mode === 'move-select' ? moveSelectMode.selectedIds : selectedIds;

  /**
   * Phase M-6a-corner-fix: 障害物のピン吸着を「最近傍角」方式に変更。
   * - rect / polygon: 全角 × 全ピン から最良補正の組み合わせを選び、その角がピンに重なる
   * - custom_circle: 角の概念がないため中心吸着のまま維持
   * 壁吸着との優先順は M-6a 同様、補正距離が小さい方を採用。
   */
  const getCornersForObstacle = (obs: Obstacle): { x: number; y: number }[] => {
    if (obs.type === 'custom_circle') {
      // 円形は中心1点を refPoint として返す（既存仕様維持）
      return [{ x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 }];
    }
    if (obs.points && obs.points.length >= 3) {
      // polygon: points は absolute グリッド座標
      return obs.points.map(p => ({ x: p.x, y: p.y }));
    }
    // rect: 左上/右上/右下/左下
    return [
      { x: obs.x, y: obs.y },
      { x: obs.x + obs.width, y: obs.y },
      { x: obs.x + obs.width, y: obs.y + obs.height },
      { x: obs.x, y: obs.y + obs.height },
    ];
  };

  const finalizeMove = (dx: number, dy: number, obs: Obstacle) => {
    // ピン吸着優先: 全角 × 全ピン から最良補正を探す
    const pins = canvasData.magnetPins ?? [];
    const corners = getCornersForObstacle(obs);
    let bestPinSnap: { dx: number; dy: number; pinId: string } | null = null;
    let bestPinCorrection = Infinity;
    for (const corner of corners) {
      const newCorner = { x: corner.x + dx, y: corner.y + dy };
      const snap = snapToMagnetPin(newCorner, pins, zoom);
      if (snap) {
        const corr = Math.hypot(snap.dx, snap.dy);
        if (corr < bestPinCorrection) {
          bestPinCorrection = corr;
          bestPinSnap = snap;
        }
      }
    }
    if (bestPinSnap) {
      // ピン優先: 壁吸着は無視
      useCanvasStore.getState().moveElement(obs.id, dx + bestPinSnap.dx, dy + bestPinSnap.dy);
      return;
    }

    // ピン圏外: 従来通り壁吸着を評価
    const newCx = obs.x + dx + obs.width / 2;
    const newCy = obs.y + dy + obs.height / 2;
    const wallSnapped = snapObstacleToWall({ x: newCx, y: newCy }, obs.width, obs.height, canvasData.buildings);
    if (wallSnapped) {
      useCanvasStore.getState().moveElement(obs.id, wallSnapped.x - obs.x, wallSnapped.y - obs.y);
      return;
    }

    // 両方なし: 通常移動
    useCanvasStore.getState().moveElement(obs.id, dx, dy);
  };

  return (
    <Layer>
      {canvasData.obstacles.map((obs) => {
        const isSelected = effectiveSelectedIds.includes(obs.id);
        const color = OBSTACLE_COLORS[obs.type];
        const label = obs.label || OBSTACLE_LABELS[obs.type];
        const isCarport = obs.type === 'carport';
        const screenX = obs.x * gridPx + panX;
        const screenY = obs.y * gridPx + panY;
        const w = obs.width * gridPx;
        const h = obs.height * gridPx;

        // ポリゴン障害物
        if (obs.points && obs.points.length >= 3) {
          const flatPts = obs.points.flatMap(p => [p.x * gridPx + panX, p.y * gridPx + panY]);
          return (
            <React.Fragment key={obs.id}>
              <Line
                points={flatPts}
                closed
                fill={color}
                opacity={0.7}
                stroke={isSelected ? '#378ADD' : '#999'}
                strokeWidth={isSelected ? 2 : 1}
                listening={mode === 'select' || mode === 'erase' || mode === 'move-select'}
                id={obs.id}
                draggable={mode === 'select'}
                onDragStart={() => useCanvasStore.getState().pushHistory()}
                onDragEnd={(e) => {
                  const dx = Math.round(e.target.x() / gridPx);
                  const dy = Math.round(e.target.y() / gridPx);
                  e.target.x(0); e.target.y(0);
                  if (dx !== 0 || dy !== 0) {
                    finalizeMove(dx, dy, obs);
                  }
                }}
              />
              {label && (() => {
                const cx = obs.points!.reduce((s, p) => s + p.x, 0) / obs.points!.length;
                const cy = obs.points!.reduce((s, p) => s + p.y, 0) / obs.points!.length;
                return (
                  <Text
                    x={cx * gridPx + panX}
                    y={cy * gridPx + panY}
                    text={label}
                    fontSize={Math.max(8, 9 * zoom)}
                    fill="#333"
                    offsetX={label.length * Math.max(8, 9 * zoom) * 0.3}
                    offsetY={Math.max(8, 9 * zoom) / 2}
                    listening={false}
                  />
                );
              })()}
            </React.Fragment>
          );
        }

        if (obs.type === 'custom_circle') {
          const r = Math.max(w, h) / 2;
          return (
            <React.Fragment key={obs.id}>
              <Circle
                x={screenX + r}
                y={screenY + r}
                radius={r}
                fill={color}
                opacity={0.7}
                stroke={isSelected ? '#378ADD' : '#999'}
                strokeWidth={isSelected ? 2 : 0.5}
                listening={mode === 'select' || mode === 'erase' || mode === 'move-select'}
                id={obs.id}
                draggable={mode === 'select'}
                onDragStart={() => useCanvasStore.getState().pushHistory()}
                onDragEnd={(e) => {
                  const origX = screenX + r;
                  const origY = screenY + r;
                  const dx = Math.round((e.target.x() - origX) / gridPx);
                  const dy = Math.round((e.target.y() - origY) / gridPx);
                  e.target.x(origX); e.target.y(origY);
                  if (dx !== 0 || dy !== 0) {
                    finalizeMove(dx, dy, obs);
                  }
                }}
              />
              {label && (
                <Text
                  x={screenX}
                  y={screenY + r - 5}
                  width={w}
                  align="center"
                  text={label}
                  fontSize={Math.max(8, 9 * zoom)}
                  fill="#333"
                  listening={false}
                />
              )}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={obs.id}>
            <Rect
              x={screenX}
              y={screenY}
              width={w}
              height={h}
              fill={isCarport ? 'transparent' : color}
              opacity={0.7}
              stroke={isSelected ? '#378ADD' : isCarport ? color : '#999'}
              strokeWidth={isSelected ? 2 : isCarport ? 1.5 : 0.5}
              dash={isCarport ? [8, 4] : undefined}
              listening={mode === 'select' || mode === 'erase' || mode === 'move-select'}
              id={obs.id}
              draggable={mode === 'select'}
              onDragStart={() => useCanvasStore.getState().pushHistory()}
              onDragEnd={(e) => {
                const dx = Math.round((e.target.x() - screenX) / gridPx);
                const dy = Math.round((e.target.y() - screenY) / gridPx);
                e.target.x(screenX); e.target.y(screenY);
                if (dx !== 0 || dy !== 0) {
                  finalizeMove(dx, dy, obs);
                }
              }}
            />
            {label && (
              <Text
                x={screenX + 2}
                y={screenY + 2}
                text={label}
                fontSize={Math.max(8, 9 * zoom)}
                fill="#333"
                listening={false}
              />
            )}
          </React.Fragment>
        );
      })}
    </Layer>
  );
}
