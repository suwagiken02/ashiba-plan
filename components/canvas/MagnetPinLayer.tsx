'use client';

import React from 'react';
import { Layer, Group, Circle, Line } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';

export default function MagnetPinLayer() {
  const { canvasData, zoom, panX, panY } = useCanvasStore();
  const pins = canvasData.magnetPins ?? [];

  if (pins.length === 0) return <Layer listening={false} />;

  const gridPx = INITIAL_GRID_PX * zoom;

  // ズームに応じてサイズをクランプ（読みやすさ優先）
  const headRadius = Math.max(4, Math.min(8, 6 * zoom));
  const needleLen = Math.max(12, Math.min(20, 16 * zoom));

  // 針の向き: 頭から右下へ（dx +0.5*len, dy +len）
  const needleDx = needleLen * 0.5;
  const needleDy = needleLen;

  return (
    <Layer listening={false}>
      {pins.map((pin) => {
        const cx = pin.x * gridPx + panX;
        const cy = pin.y * gridPx + panY;

        return (
          <Group key={pin.id}>
            {/* 針（斜め下） */}
            <Line
              points={[cx, cy, cx + needleDx, cy + needleDy]}
              stroke="#991B1B"
              strokeWidth={1.5}
              shadowColor="#000"
              shadowOpacity={0.3}
              shadowBlur={2}
              shadowOffsetX={1}
              shadowOffsetY={1}
            />
            {/* 頭（赤丸） */}
            <Circle
              x={cx}
              y={cy}
              radius={headRadius}
              fill="#DC2626"
              stroke="#FFFFFF"
              strokeWidth={1}
              shadowColor="#000"
              shadowOpacity={0.4}
              shadowBlur={3}
              shadowOffsetX={1}
              shadowOffsetY={1}
            />
          </Group>
        );
      })}
    </Layer>
  );
}
