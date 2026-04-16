'use client';

import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Layer, Line, Circle, Rect, Text } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX, mmToGrid } from '@/lib/konva/gridUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import { getHandrailColor } from '@/lib/konva/handrailColors';
import { HandrailLengthMm } from '@/types';

export default function ScaffoldLayer() {
  const { canvasData, zoom, panX, panY, mode, selectedIds, isDuplicateMode, highlightIds, isReorderMode, reorderHandrails } = useCanvasStore();
  const [dragReorderPreview, setDragReorderPreview] = useState<{
    lineIds: string[];
    newOrder: string[];
  } | null>(null);
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
              draggable={mode === 'select'}
              onDragStart={() => { useCanvasStore.getState().pushHistory(); }}
              onDragEnd={(e) => {
                const dx = Math.round(e.target.x() / gridPx);
                const dy = Math.round(e.target.y() / gridPx);
                e.target.x(0); e.target.y(0);
                if (dx !== 0 || dy !== 0) {
                  if (isDuplicateMode) {
                    useCanvasStore.getState().addAnti({ ...anti, id: uuidv4(), x: anti.x + dx, y: anti.y + dy });
                  } else {
                    useCanvasStore.getState().moveElement(anti.id, dx, dy);
                  }
                }
              }}
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
        const isHighlighted = highlightIds.includes(h.id);
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
              stroke={isHighlighted ? '#FF6B35' : isSelected ? '#FF6B35' : color}
              strokeWidth={isHighlighted ? 5 : 3}
              lineCap="round"
              listening={true}
              id={h.id}
              draggable={mode === 'select'}
              onDragStart={() => { useCanvasStore.getState().pushHistory(); }}
              onDragMove={(e) => {
                if (!isReorderMode) return;
                const s = useCanvasStore.getState();
                const isHoriz = h.direction === 'horizontal';
                const TOL = 3;
                const lineHandrails = s.canvasData.handrails.filter(other =>
                  isHoriz ? Math.abs(other.y - h.y) < TOL : Math.abs(other.x - h.x) < TOL
                );
                if (lineHandrails.length < 2) return;

                const dragOffset = isHoriz ? e.target.x() / (INITIAL_GRID_PX * s.zoom) : e.target.y() / (INITIAL_GRID_PX * s.zoom);
                const dragPos = isHoriz ? h.x + dragOffset : h.y + dragOffset;

                const others = lineHandrails
                  .filter(o => o.id !== h.id)
                  .sort((a, b) => isHoriz ? a.x - b.x : a.y - b.y);

                let insertIdx = others.length;
                for (let i = 0; i < others.length; i++) {
                  const mid = isHoriz
                    ? others[i].x + mmToGrid(others[i].lengthMm) / 2
                    : others[i].y + mmToGrid(others[i].lengthMm) / 2;
                  if (dragPos < mid) { insertIdx = i; break; }
                }

                const newOrder = [...others.map(o => o.id)];
                newOrder.splice(insertIdx, 0, h.id);
                setDragReorderPreview({ lineIds: lineHandrails.map(o => o.id), newOrder });
              }}
              onDragEnd={(e) => {
                const s = useCanvasStore.getState();
                const dx = Math.round(e.target.x() / gridPx);
                const dy = Math.round(e.target.y() / gridPx);
                e.target.x(0); e.target.y(0);

                if (isReorderMode && dragReorderPreview) {
                  reorderHandrails(dragReorderPreview.lineIds, dragReorderPreview.newOrder);
                  setDragReorderPreview(null);
                  return;
                }

                if (dx !== 0 || dy !== 0) {
                  if (isDuplicateMode) {
                    useCanvasStore.getState().addHandrail({ ...h, id: uuidv4(), x: h.x + dx, y: h.y + dy });
                  } else {
                    useCanvasStore.getState().moveElement(h.id, dx, dy);
                  }
                }
              }}
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

      {/* 並び替えプレビュー */}
      {dragReorderPreview && canvasData.handrails
        .filter(hr => dragReorderPreview.lineIds.includes(hr.id))
        .map((hr, i) => {
          const newIdx = dragReorderPreview.newOrder.indexOf(hr.id);
          if (newIdx === -1) return null;
          const isHoriz = hr.direction === 'horizontal';
          const sorted = canvasData.handrails
            .filter(o => dragReorderPreview.lineIds.includes(o.id))
            .sort((a, b) => isHoriz ? a.x - b.x : a.y - b.y);
          const targetHr = sorted[newIdx];
          if (!targetHr) return null;
          const newX = isHoriz ? targetHr.x : hr.x;
          const newY = isHoriz ? hr.y : targetHr.y;
          const [s, e] = getHandrailEndpoints({ ...hr, x: newX, y: newY });
          return (
            <Line
              key={`reorder-preview-${hr.id}`}
              points={[
                s.x * gridPx + panX,
                s.y * gridPx + panY,
                e.x * gridPx + panX,
                e.y * gridPx + panY,
              ]}
              stroke="#3B82F6"
              strokeWidth={2}
              dash={[6, 4]}
              opacity={0.7}
              listening={false}
            />
          );
        })
      }

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
              draggable={mode === 'select'}
              onDragStart={() => { useCanvasStore.getState().pushHistory(); }}
              onDragEnd={(e) => {
                const dx = Math.round(e.target.x() / gridPx);
                const dy = Math.round(e.target.y() / gridPx);
                e.target.x(0); e.target.y(0);
                if (dx !== 0 || dy !== 0) {
                  if (isDuplicateMode) {
                    useCanvasStore.getState().addPost({ ...p, id: uuidv4(), x: p.x + dx, y: p.y + dy });
                  } else {
                    useCanvasStore.getState().moveElement(p.id, dx, dy);
                  }
                }
              }}
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
