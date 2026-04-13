'use client';

import React from 'react';
import { Layer, Line, Rect, Text } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX, gridToMm } from '@/lib/konva/gridUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';

const GUIDE_COLOR = '#378ADD';
const GUIDE_OPACITY = 0.3;
const DIM_COLOR = '#888780';
const DIM_WARN_COLOR = '#E85D3A';
const ARROW_SIZE_BASE = 4;

/** 離れ寸法1本分: ガイド線（両端矢印）＋背景付きラベル */
function DistanceMarker({
  x1, y1, x2, y2,
  label, zoom, color,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; zoom: number; color: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;

  const ux = dx / len;
  const uy = dy / len;
  const arrow = ARROW_SIZE_BASE * zoom;
  const fontSize = Math.max(12, 14 * zoom);
  const isVertical = Math.abs(dx) < Math.abs(dy);

  // テキスト位置（中間点）
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const textW = label.length * fontSize * 0.65 + 6;
  const textH = fontSize + 4;
  const bgX = midX - textW / 2;
  const bgY = midY - textH / 2;
  const textX = midX - (label.length * fontSize * 0.65) / 2;
  const textY = midY - fontSize / 2;

  return (
    <>
      {/* ガイド線 */}
      <Line
        points={[x1, y1, x2, y2]}
        stroke={GUIDE_COLOR}
        strokeWidth={1}
        opacity={GUIDE_OPACITY}
        listening={false}
      />
      {/* 始点矢印 */}
      {isVertical ? (
        <Line
          points={[x1 - arrow, y1 + arrow, x1, y1, x1 + arrow, y1 + arrow]}
          stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false}
        />
      ) : (
        <Line
          points={[x1 + arrow, y1 - arrow, x1, y1, x1 + arrow, y1 + arrow]}
          stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false}
        />
      )}
      {/* 終点矢印 */}
      {isVertical ? (
        <Line
          points={[x2 - arrow, y2 - arrow, x2, y2, x2 + arrow, y2 - arrow]}
          stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false}
        />
      ) : (
        <Line
          points={[x2 - arrow, y2 - arrow, x2, y2, x2 - arrow, y2 + arrow]}
          stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false}
        />
      )}
      {/* テキスト背景 */}
      <Rect
        x={bgX} y={bgY} width={textW} height={textH}
        fill="white" opacity={0.75} cornerRadius={2} listening={false}
      />
      {/* テキスト */}
      <Text
        x={textX} y={textY}
        text={label} fontSize={fontSize} fontFamily="monospace" fontStyle="bold"
        fill={color} listening={false}
      />
    </>
  );
}

export default function DimensionLayer() {
  const { canvasData, zoom, panX, panY, showDimensions } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;
  const elements: React.ReactElement[] = [];

  if (!showDimensions) return <Layer listening={false} />;

  if (canvasData.buildings.length === 0 || canvasData.handrails.length === 0) {
    return <Layer listening={false} />;
  }

  // 建物バウンディングボックス
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  for (const b of canvasData.buildings) {
    for (const p of b.points) {
      if (p.x < bMinX) bMinX = p.x;
      if (p.y < bMinY) bMinY = p.y;
      if (p.x > bMaxX) bMaxX = p.x;
      if (p.y > bMaxY) bMaxY = p.y;
    }
  }

  // 全手摺の端点を収集
  const allEndpoints: { x: number; y: number }[] = [];
  for (const h of canvasData.handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    allEndpoints.push(p1, p2);
  }

  // 手摺バウンディングボックス
  let hMinX = Infinity, hMinY = Infinity, hMaxX = -Infinity, hMaxY = -Infinity;
  for (const p of allEndpoints) {
    if (p.x < hMinX) hMinX = p.x;
    if (p.y < hMinY) hMinY = p.y;
    if (p.x > hMaxX) hMaxX = p.x;
    if (p.y > hMaxY) hMaxY = p.y;
  }

  const gx = (g: number) => g * gridPx + panX;
  const gy = (g: number) => g * gridPx + panY;

  // 各面の突出量（グリッド）: 正=外側にはみ出し、負=不足
  const northDist = bMinY - hMinY;
  const southDist = hMaxY - bMaxY;
  const eastDist = hMaxX - bMaxX;
  const westDist = bMinX - hMinX;

  // 各面の手摺端点から、寸法線を引く水平/垂直位置を決定
  // 北面: 建物上辺(bMinY)の最も近くにあるY=hMinYの手摺端点のX座標を2つ取得
  // → 左端と右端の端点位置にガイド線を引く

  // --- 北面（上）---
  if (northDist !== 0) {
    const mm = Math.round(gridToMm(Math.abs(northDist)));
    const c = northDist > 0 ? DIM_COLOR : DIM_WARN_COLOR;
    // 上辺の手摺端点のX座標を収集（Y=hMinY付近の端点）
    const topPoints = allEndpoints.filter(p => Math.abs(p.y - hMinY) < 2);
    const xCoords = topPoints.map(p => p.x);
    const leftX = xCoords.length > 0 ? Math.min(...xCoords) : (bMinX + bMaxX) / 2;
    const rightX = xCoords.length > 1 ? Math.max(...xCoords) : leftX;

    // 左端のガイド線
    elements.push(
      <DistanceMarker key="dim-n-l"
        x1={gx(leftX)} y1={gy(bMinY)}
        x2={gx(leftX)} y2={gy(hMinY)}
        label={`${mm}`} zoom={zoom} color={c}
      />
    );
    // 右端のガイド線（左端と十分離れている場合のみ）
    if (Math.abs(rightX - leftX) > 30) {
      elements.push(
        <DistanceMarker key="dim-n-r"
          x1={gx(rightX)} y1={gy(bMinY)}
          x2={gx(rightX)} y2={gy(hMinY)}
          label={`${mm}`} zoom={zoom} color={c}
        />
      );
    }
  }

  // --- 南面（下）---
  if (southDist !== 0) {
    const mm = Math.round(gridToMm(Math.abs(southDist)));
    const c = southDist > 0 ? DIM_COLOR : DIM_WARN_COLOR;
    const bottomPoints = allEndpoints.filter(p => Math.abs(p.y - hMaxY) < 2);
    const xCoords = bottomPoints.map(p => p.x);
    const leftX = xCoords.length > 0 ? Math.min(...xCoords) : (bMinX + bMaxX) / 2;
    const rightX = xCoords.length > 1 ? Math.max(...xCoords) : leftX;

    elements.push(
      <DistanceMarker key="dim-s-l"
        x1={gx(leftX)} y1={gy(bMaxY)}
        x2={gx(leftX)} y2={gy(hMaxY)}
        label={`${mm}`} zoom={zoom} color={c}
      />
    );
    if (Math.abs(rightX - leftX) > 30) {
      elements.push(
        <DistanceMarker key="dim-s-r"
          x1={gx(rightX)} y1={gy(bMaxY)}
          x2={gx(rightX)} y2={gy(hMaxY)}
          label={`${mm}`} zoom={zoom} color={c}
        />
      );
    }
  }

  // --- 東面（右）---
  if (eastDist !== 0) {
    const mm = Math.round(gridToMm(Math.abs(eastDist)));
    const c = eastDist > 0 ? DIM_COLOR : DIM_WARN_COLOR;
    const rightPoints = allEndpoints.filter(p => Math.abs(p.x - hMaxX) < 2);
    const yCoords = rightPoints.map(p => p.y);
    const topY = yCoords.length > 0 ? Math.min(...yCoords) : (bMinY + bMaxY) / 2;
    const bottomY = yCoords.length > 1 ? Math.max(...yCoords) : topY;

    elements.push(
      <DistanceMarker key="dim-e-t"
        x1={gx(bMaxX)} y1={gy(topY)}
        x2={gx(hMaxX)} y2={gy(topY)}
        label={`${mm}`} zoom={zoom} color={c}
      />
    );
    if (Math.abs(bottomY - topY) > 30) {
      elements.push(
        <DistanceMarker key="dim-e-b"
          x1={gx(bMaxX)} y1={gy(bottomY)}
          x2={gx(hMaxX)} y2={gy(bottomY)}
          label={`${mm}`} zoom={zoom} color={c}
        />
      );
    }
  }

  // --- 西面（左）---
  if (westDist !== 0) {
    const mm = Math.round(gridToMm(Math.abs(westDist)));
    const c = westDist > 0 ? DIM_COLOR : DIM_WARN_COLOR;
    const leftPoints = allEndpoints.filter(p => Math.abs(p.x - hMinX) < 2);
    const yCoords = leftPoints.map(p => p.y);
    const topY = yCoords.length > 0 ? Math.min(...yCoords) : (bMinY + bMaxY) / 2;
    const bottomY = yCoords.length > 1 ? Math.max(...yCoords) : topY;

    elements.push(
      <DistanceMarker key="dim-w-t"
        x1={gx(bMinX)} y1={gy(topY)}
        x2={gx(hMinX)} y2={gy(topY)}
        label={`${mm}`} zoom={zoom} color={c}
      />
    );
    if (Math.abs(bottomY - topY) > 30) {
      elements.push(
        <DistanceMarker key="dim-w-b"
          x1={gx(bMinX)} y1={gy(bottomY)}
          x2={gx(hMinX)} y2={gy(bottomY)}
          label={`${mm}`} zoom={zoom} color={c}
        />
      );
    }
  }

  return <Layer listening={false}>{elements}</Layer>;
}
