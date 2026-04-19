'use client';

import React from 'react';
import { Layer, Rect, Circle, Text, Line } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';
import { ObstacleType } from '@/types';

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
  const { canvasData, zoom, panX, panY, mode, selectedIds } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;

  return (
    <Layer>
      {canvasData.obstacles.map((obs) => {
        const isSelected = selectedIds.includes(obs.id);
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
                listening={mode === 'select' || mode === 'erase'}
                id={obs.id}
                draggable={mode === 'select'}
                onDragStart={() => { useCanvasStore.getState().pushHistory(); }}
                onDragEnd={(e) => {
                  const dx = Math.round(e.target.x() / gridPx);
                  const dy = Math.round(e.target.y() / gridPx);
                  e.target.x(0); e.target.y(0);
                  if (dx !== 0 || dy !== 0) useCanvasStore.getState().moveElement(obs.id, dx, dy);
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
                listening={mode === 'select' || mode === 'erase'}
                id={obs.id}
                draggable={mode === 'select'}
                onDragStart={() => { useCanvasStore.getState().pushHistory(); }}
                onDragEnd={(e) => {
                  const dx = Math.round(e.target.x() / gridPx);
                  const dy = Math.round(e.target.y() / gridPx);
                  e.target.x(0); e.target.y(0);
                  if (dx !== 0 || dy !== 0) useCanvasStore.getState().moveElement(obs.id, dx, dy);
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
              listening={mode === 'select' || mode === 'erase'}
              id={obs.id}
              draggable={mode === 'select'}
              onDragStart={() => { useCanvasStore.getState().pushHistory(); }}
              onDragEnd={(e) => {
                const dx = Math.round(e.target.x() / gridPx);
                const dy = Math.round(e.target.y() / gridPx);
                e.target.x(0); e.target.y(0);
                if (dx !== 0 || dy !== 0) useCanvasStore.getState().moveElement(obs.id, dx, dy);
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
