'use client';

import React from 'react';
import { Layer, Text, Line, Rect } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';

export default function MemoLayer() {
  const { canvasData, zoom, panX, panY, mode, selectedIds } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;

  return (
    <Layer>
      {canvasData.memos.map((memo) => {
        const isSelected = selectedIds.includes(memo.id);
        const screenX = memo.x * gridPx + panX;
        const screenY = memo.y * gridPx + panY;
        const fontSize = Math.max(10, 12 * zoom);

        if (memo.style === 'callout' && memo.arrowTo) {
          const arrowX = memo.arrowTo.x * gridPx + panX;
          const arrowY = memo.arrowTo.y * gridPx + panY;
          return (
            <React.Fragment key={memo.id}>
              <Line
                points={[screenX, screenY, arrowX, arrowY]}
                stroke="#888780"
                strokeWidth={1}
                listening={false}
              />
              <Rect
                x={screenX - 4}
                y={screenY - fontSize - 4}
                width={memo.text.length * fontSize * 0.6 + 12}
                height={fontSize + 8}
                fill="#fffde7"
                stroke={isSelected ? '#378ADD' : '#ccc'}
                strokeWidth={isSelected ? 2 : 0.5}
                cornerRadius={4}
                listening={mode === 'select' || mode === 'erase'}
                id={memo.id}
              />
              <Text
                x={screenX + 2}
                y={screenY - fontSize}
                text={memo.text}
                fontSize={fontSize}
                fill="#333"
                listening={false}
              />
            </React.Fragment>
          );
        }

        return (
          <Text
            key={memo.id}
            x={screenX}
            y={screenY}
            text={memo.text}
            fontSize={fontSize}
            fill={isSelected ? '#378ADD' : '#555'}
            listening={mode === 'select' || mode === 'erase'}
            id={memo.id}
          />
        );
      })}
    </Layer>
  );
}
