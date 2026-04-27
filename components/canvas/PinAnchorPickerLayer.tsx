'use client';

import React, { useMemo } from 'react';
import { Layer, Circle } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';
import { collectAnchorPoints } from '@/lib/magnetPin/anchorPoints';
import type Konva from 'konva';

export default function PinAnchorPickerLayer() {
  const { canvasData, zoom, panX, panY, isMagnetPinMode, pinAnchor, setPinAnchor } = useCanvasStore();

  const anchors = useMemo(
    () => (isMagnetPinMode ? collectAnchorPoints(canvasData) : []),
    [isMagnetPinMode, canvasData],
  );

  if (!isMagnetPinMode) return null;

  const gridPx = INITIAL_GRID_PX * zoom;
  // 通常半径と選択中半径（ズーム調整あり）
  const baseRadius = Math.max(5, Math.min(9, 6 * zoom));
  const activeRadius = baseRadius + 2;

  const handleClick = (anchorId: string, e: Konva.KonvaEventObject<Event>) => {
    e.cancelBubble = true; // Stage への伝播を止める（pan/select を発火させない）
    const anchor = anchors.find(a => a.id === anchorId);
    if (!anchor) return;
    if (pinAnchor?.id === anchorId) {
      // 同じ起点を再タップ → 解除
      setPinAnchor(null);
    } else {
      setPinAnchor(anchor);
    }
  };

  return (
    <Layer>
      {anchors.map((a) => {
        const cx = a.x * gridPx + panX;
        const cy = a.y * gridPx + panY;
        const isActive = pinAnchor?.id === a.id;
        return (
          <Circle
            key={a.id}
            x={cx}
            y={cy}
            radius={isActive ? activeRadius : baseRadius}
            fill={isActive ? '#F59E0B' : '#2563EB'}
            stroke="#FFFFFF"
            strokeWidth={1}
            shadowColor="#000"
            shadowOpacity={0.3}
            shadowBlur={2}
            shadowOffsetX={0.5}
            shadowOffsetY={0.5}
            onClick={(e) => handleClick(a.id, e)}
            onTap={(e) => handleClick(a.id, e)}
          />
        );
      })}
    </Layer>
  );
}
