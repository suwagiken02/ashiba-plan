'use client';

import React from 'react';
import { Layer, Line, Circle, Rect, Text } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX, mmToGrid } from '@/lib/konva/gridUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import { getHandrailColor } from '@/lib/konva/handrailColors';
import { HandrailLengthMm } from '@/types';

export default function ScaffoldLayer() {
  const { canvasData, zoom, panX, panY, mode, selectedIds } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;

  return (
    <Layer>
      {/* アンチ（踏板） */}
      {canvasData.antis.map((anti) => {
        const w = anti.direction === 'horizontal' ? mmToGrid(anti.lengthMm) : mmToGrid(anti.width);
        const h = anti.direction === 'horizontal' ? mmToGrid(anti.width) : mmToGrid(anti.lengthMm);
        const isSelected = selectedIds.includes(anti.id);

        return (
          <React.Fragment key={anti.id}>
            <Rect
              x={anti.x * gridPx + panX}
              y={anti.y * gridPx + panY}
              width={w * gridPx}
              height={h * gridPx}
              fill={anti.width === 400 ? '#F59E0B' : '#FCD34D'}
              opacity={0.85}
              cornerRadius={2}
              stroke={isSelected ? '#FF6B35' : (anti.width === 400 ? '#B45309' : '#A16207')}
              strokeWidth={isSelected ? 2 : 1.5}
              listening={mode === 'select' || mode === 'erase'}
              id={anti.id}
            />
            {/* 内側の破線（境界線） */}
            <Line
              points={[
                (anti.x + 1) * gridPx + panX,
                (anti.y + (anti.direction === 'horizontal' ? h / 2 : 1)) * gridPx + panY,
                (anti.x + w - 1) * gridPx + panX,
                (anti.y + (anti.direction === 'horizontal' ? h / 2 : h - 1)) * gridPx + panY,
              ]}
              stroke="#b8860b"
              strokeWidth={0.5}
              dash={[3, 3]}
              listening={false}
            />
          </React.Fragment>
        );
      })}

      {/* 手摺 */}
      {canvasData.handrails.map((h) => {
        const [start, end] = getHandrailEndpoints(h);
        const isSelected = selectedIds.includes(h.id);
        const color = getHandrailColor(h.lengthMm as HandrailLengthMm);

        return (
          <React.Fragment key={h.id}>
            <Line
              points={[
                start.x * gridPx + panX,
                start.y * gridPx + panY,
                end.x * gridPx + panX,
                end.y * gridPx + panY,
              ]}
              stroke={isSelected ? '#FF6B35' : color}
              strokeWidth={3}
              lineCap="round"
              listening={mode === 'select' || mode === 'erase'}
              id={h.id}
            />
            {/* 両端の●マーク */}
            <Circle
              x={start.x * gridPx + panX}
              y={start.y * gridPx + panY}
              radius={3}
              fill={color}
              listening={false}
            />
            <Circle
              x={end.x * gridPx + panX}
              y={end.y * gridPx + panY}
              radius={3}
              fill={color}
              listening={false}
            />
            {/* 1800mm以外は長さテキスト表示 */}
            {h.lengthMm !== 1800 && (() => {
              const lengthGrid = mmToGrid(h.lengthMm);
              const isH = h.direction === 'horizontal';
              const midX = (h.x + (isH ? lengthGrid / 2 : 0)) * gridPx + panX;
              const midY = (h.y + (isH ? 0 : lengthGrid / 2)) * gridPx + panY;
              const offsetPx = isH ? -14 : -4;
              return (
                <Text
                  x={isH ? midX : midX + offsetPx}
                  y={isH ? midY + offsetPx : midY}
                  text={String(h.lengthMm)}
                  fontSize={10}
                  fill={color}
                  align={isH ? 'center' : 'right'}
                  offsetX={isH ? 15 : 30}
                  listening={false}
                />
              );
            })()}
          </React.Fragment>
        );
      })}

      {/* 支柱 */}
      {canvasData.posts.map((p) => {
        const isSelected = selectedIds.includes(p.id);
        return (
          <React.Fragment key={p.id}>
            <Circle
              x={p.x * gridPx + panX}
              y={p.y * gridPx + panY}
              radius={8}
              fill="#2c2c2a"
              stroke={isSelected ? '#FF6B35' : '#2c2c2a'}
              strokeWidth={isSelected ? 2 : 0}
              listening={mode === 'select' || mode === 'erase'}
              id={p.id}
            />
            <Circle
              x={p.x * gridPx + panX}
              y={p.y * gridPx + panY}
              radius={3}
              fill="white"
              listening={false}
            />
          </React.Fragment>
        );
      })}
    </Layer>
  );
}
