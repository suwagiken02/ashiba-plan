'use client';

import React from 'react';
import { Layer, Line, Rect, Text } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX, gridToMm } from '@/lib/konva/gridUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import { getBuildingEdgesClockwise, EdgeInfo } from '@/lib/konva/autoLayoutUtils';
import { StartCorner, Point } from '@/types';

const GUIDE_COLOR = '#378ADD';
const GUIDE_OPACITY = 0.3;
const DIM_COLOR = '#888780';
const DIM_WARN_COLOR = '#E85D3A';
const ARROW_SIZE_BASE = 4;

/** 離れ寸法1本分 */
function DistanceMarker({
  x1, y1, x2, y2, label, zoom, color,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; zoom: number; color: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;

  const arrow = ARROW_SIZE_BASE * zoom;
  const fontSize = Math.max(12, 14 * zoom);
  const isVertical = Math.abs(dx) < Math.abs(dy);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const textW = label.length * fontSize * 0.65 + 6;
  const textH = fontSize + 4;

  return (
    <>
      <Line points={[x1, y1, x2, y2]}
        stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
      {isVertical ? (
        <Line points={[x1 - arrow, y1 + arrow, x1, y1, x1 + arrow, y1 + arrow]}
          stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
      ) : (
        <Line points={[x1 + arrow, y1 - arrow, x1, y1, x1 + arrow, y1 + arrow]}
          stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
      )}
      {isVertical ? (
        <Line points={[x2 - arrow, y2 - arrow, x2, y2, x2 + arrow, y2 - arrow]}
          stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
      ) : (
        <Line points={[x2 - arrow, y2 - arrow, x2, y2, x2 - arrow, y2 + arrow]}
          stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
      )}
      <Rect x={midX - textW / 2} y={midY - textH / 2} width={textW} height={textH}
        fill="white" opacity={0.75} cornerRadius={2} listening={false} />
      <Text x={midX - (label.length * fontSize * 0.65) / 2} y={midY - fontSize / 2}
        text={label} fontSize={fontSize} fontFamily="monospace" fontStyle="bold"
        fill={color} listening={false} />
    </>
  );
}

/** コーナーに対応する face1/face2 辺を特定 */
function findFaceEdges(
  building: { points: Point[] },
  corner: StartCorner,
): { f1: EdgeInfo; f2: EdgeInfo } | null {
  const edges = getBuildingEdgesClockwise(building as any);
  if (edges.length < 3) return null;

  const f1Dir = (corner === 'ne' || corner === 'nw') ? 'north' : 'south';
  const f2Dir = (corner === 'ne' || corner === 'se') ? 'east' : 'west';

  const f1Edges = edges.filter(e => e.face === f1Dir);
  const f2Edges = edges.filter(e => e.face === f2Dir);
  if (f1Edges.length === 0 || f2Edges.length === 0) return null;

  // face1: コーナーに近い辺
  const f1 = [...f1Edges].sort((a, b) => {
    const ax = Math.min(a.p1.x, a.p2.x);
    const bx = Math.min(b.p1.x, b.p2.x);
    return (corner === 'ne' || corner === 'se') ? bx - ax : ax - bx;
  })[0];

  // face2: コーナーに近い辺
  const f2 = [...f2Edges].sort((a, b) => {
    const ay = Math.min(a.p1.y, a.p2.y);
    const by = Math.min(b.p1.y, b.p2.y);
    return (corner === 'ne' || corner === 'nw') ? ay - by : by - ay;
  })[0];

  return { f1, f2 };
}

/**
 * 指定面の方向に沿った手摺の「先端」座標を取得。
 * その面上に手摺がない場合は null を返す。
 *
 * face1(horizontal): scaffoldY付近にある水平手摺の進行方向先端X
 * face2(vertical):   scaffoldX付近にある垂直手摺の進行方向先端Y
 */
function findLeadingEdge(
  allEndpoints: Point[],
  axis: 'horizontal' | 'vertical',
  scaffoldCoord: number, // face1→scaffoldY, face2→scaffoldX
  direction: 1 | -1,     // +1=正方向（東/南）, -1=負方向（西/北）
): number | null {
  const TOL = 5; // グリッド許容差（離れ計算の丸め誤差を吸収）

  // その面上の手摺端点を収集
  const pts: number[] = [];
  for (let i = 0; i < allEndpoints.length; i += 2) {
    const p1 = allEndpoints[i];
    const p2 = allEndpoints[i + 1];
    if (axis === 'horizontal') {
      // scaffoldY 付近の水平手摺（両端点がほぼ同じY）
      if (Math.abs(p1.y - scaffoldCoord) < TOL && Math.abs(p2.y - scaffoldCoord) < TOL) {
        pts.push(p1.x, p2.x);
      }
    } else {
      // scaffoldX 付近の垂直手摺（両端点がほぼ同じX）
      if (Math.abs(p1.x - scaffoldCoord) < TOL && Math.abs(p2.x - scaffoldCoord) < TOL) {
        pts.push(p1.y, p2.y);
      }
    }
  }

  console.log(`[DimLayer] findLead: axis=${axis} scfCoord=${scaffoldCoord} dir=${direction} found=${pts.length} pts`);

  if (pts.length === 0) return null;

  // 進行方向の最先端
  return direction > 0 ? Math.max(...pts) : Math.min(...pts);
}

export default function DimensionLayer() {
  const { canvasData, zoom, panX, panY, showDimensions } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;
  const elements: React.ReactElement[] = [];

  if (!showDimensions) return <Layer listening={false} />;
  if (canvasData.buildings.length === 0 || canvasData.handrails.length === 0) {
    return <Layer listening={false} />;
  }

  const gx = (g: number) => g * gridPx + panX;
  const gy = (g: number) => g * gridPx + panY;

  // 全手摺の端点を収集（ペアで格納: [h1p1, h1p2, h2p1, h2p2, ...]）
  const allEndpoints: Point[] = [];
  for (const h of canvasData.handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    allEndpoints.push(p1, p2);
  }

  // ── scaffoldStart がある場合 ──
  const scaffoldStart = canvasData.scaffoldStart;

  if (scaffoldStart && canvasData.buildings.length > 0) {
    const result = findFaceEdges(canvasData.buildings[0], scaffoldStart.corner);
    if (result) {
      const { f1, f2 } = result;
      const corner = scaffoldStart.corner;

      // face1（北/南 = 水平面）
      const f1BldY = (f1.p1.y + f1.p2.y) / 2;
      // face1 の終点X = 次のコーナー（進行方向の先にある辺端点）
      // nw/sw: 東へ進行 → p2が東端 = max(p1.x, p2.x)
      // ne/se: 西へ進行 → p2が西端 = min(p1.x, p2.x)
      const f1GoEast = corner === 'nw' || corner === 'sw';
      const f1CornerX = f1GoEast ? Math.max(f1.p1.x, f1.p2.x) : Math.min(f1.p1.x, f1.p2.x);
      const f1ScfY = (corner === 'ne' || corner === 'nw') ? f1BldY - scaffoldStart.face1DistanceMm / 10 : f1BldY + scaffoldStart.face1DistanceMm / 10;

      // face1 上の手摺先端を探す
      console.log(`[DimLayer] face1(${f1.label}): bldY=${f1BldY} scfY=${f1ScfY} goEast=${f1GoEast} cornerX=${f1CornerX}`);

      const f1Lead = findLeadingEdge(
        allEndpoints,
        'horizontal', Math.round(f1ScfY), f1GoEast ? 1 : -1,
      );

      if (f1Lead !== null) {
        // 正=手前に余裕あり, 負=コーナーを超えている
        const f1Remain = f1GoEast ? f1CornerX - f1Lead : f1Lead - f1CornerX;
        const f1Mm = Math.round(gridToMm(f1Remain));

        console.log(`[DimLayer] face1: leadX=${f1Lead} remain=${f1Remain} mm=${f1Mm}`);

        if (f1Mm !== 0) {
          // マイナス=超過の場合は赤色でマイナス表記
          const label = f1Mm > 0 ? `${f1Mm}` : `${f1Mm}`;
          const color = f1Mm > 0 ? DIM_COLOR : DIM_WARN_COLOR;
          // ガイド線: 手摺先端 → コーナー（超過時はコーナー → 手摺先端）
          const drawX1 = f1Mm > 0 ? f1Lead : f1CornerX;
          const drawX2 = f1Mm > 0 ? f1CornerX : f1Lead;
          elements.push(
            <DistanceMarker key="dim-f1"
              x1={gx(drawX1)} y1={gy(f1ScfY)}
              x2={gx(drawX2)} y2={gy(f1ScfY)}
              label={label} zoom={zoom} color={color} />,
          );
        }
      }

      // face2（東/西 = 垂直面）
      const f2BldX = (f2.p1.x + f2.p2.x) / 2;
      const f2GoSouth = corner === 'nw' || corner === 'ne';
      // 終点コーナー = 進行方向の先にある辺端点
      // 時計回りで: NWのwest面(F面)は p1=EF角(南端) p2=FA角(北端=NWコーナー)
      // 南へ進むので終点 = EF角 = max(p1.y, p2.y)
      const f2CornerY = f2GoSouth ? Math.max(f2.p1.y, f2.p2.y) : Math.min(f2.p1.y, f2.p2.y);
      // 足場ラインのX座標
      const f2ScfX = (corner === 'ne' || corner === 'se')
        ? f2BldX + scaffoldStart.face2DistanceMm / 10
        : f2BldX - scaffoldStart.face2DistanceMm / 10;

      console.log(`[DimLayer] face2(${f2.label}): bldX=${f2BldX} scfX=${f2ScfX} goSouth=${f2GoSouth} cornerY=${f2CornerY} p1=(${f2.p1.x},${f2.p1.y}) p2=(${f2.p2.x},${f2.p2.y})`);

      const f2Lead = findLeadingEdge(
        allEndpoints,
        'vertical', Math.round(f2ScfX), f2GoSouth ? 1 : -1,
      );

      if (f2Lead !== null) {
        const f2Remain = f2GoSouth ? f2CornerY - f2Lead : f2Lead - f2CornerY;
        const f2Mm = Math.round(gridToMm(f2Remain));

        console.log(`[DimLayer] face2: leadY=${f2Lead} remain=${f2Remain} mm=${f2Mm}`);

        if (f2Mm !== 0) {
          const label = f2Mm > 0 ? `${f2Mm}` : `${f2Mm}`;
          const color = f2Mm > 0 ? DIM_COLOR : DIM_WARN_COLOR;
          const drawY1 = f2Mm > 0 ? f2Lead : f2CornerY;
          const drawY2 = f2Mm > 0 ? f2CornerY : f2Lead;
          elements.push(
            <DistanceMarker key="dim-f2"
              x1={gx(f2ScfX)} y1={gy(drawY1)}
              x2={gx(f2ScfX)} y2={gy(drawY2)}
              label={label} zoom={zoom} color={color} />,
          );
        }
      }

      return <Layer listening={false}>{elements}</Layer>;
    }
  }

  // ── フォールバック: scaffoldStart未設定時はBBOXベース ──
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  for (const b of canvasData.buildings) {
    for (const p of b.points) {
      if (p.x < bMinX) bMinX = p.x;
      if (p.y < bMinY) bMinY = p.y;
      if (p.x > bMaxX) bMaxX = p.x;
      if (p.y > bMaxY) bMaxY = p.y;
    }
  }
  let hMinX = Infinity, hMinY = Infinity, hMaxX = -Infinity, hMaxY = -Infinity;
  for (const p of allEndpoints) {
    if (p.x < hMinX) hMinX = p.x;
    if (p.y < hMinY) hMinY = p.y;
    if (p.x > hMaxX) hMaxX = p.x;
    if (p.y > hMaxY) hMaxY = p.y;
  }

  const northDist = bMinY - hMinY;
  const southDist = hMaxY - bMaxY;
  const eastDist = hMaxX - bMaxX;
  const westDist = bMinX - hMinX;

  if (northDist !== 0) {
    const mm = Math.round(gridToMm(Math.abs(northDist)));
    const c = DIM_COLOR;
    const pts = allEndpoints.filter(p => Math.abs(p.y - hMinY) < 2);
    const xs = pts.map(p => p.x);
    const lx = xs.length > 0 ? Math.min(...xs) : (bMinX + bMaxX) / 2;
    const rx = xs.length > 1 ? Math.max(...xs) : lx;
    elements.push(<DistanceMarker key="dim-n-l" x1={gx(lx)} y1={gy(bMinY)} x2={gx(lx)} y2={gy(hMinY)} label={`${mm}`} zoom={zoom} color={c} />);
    if (Math.abs(rx - lx) > 30)
      elements.push(<DistanceMarker key="dim-n-r" x1={gx(rx)} y1={gy(bMinY)} x2={gx(rx)} y2={gy(hMinY)} label={`${mm}`} zoom={zoom} color={c} />);
  }
  if (southDist !== 0) {
    const mm = Math.round(gridToMm(Math.abs(southDist)));
    const c = DIM_COLOR;
    const pts = allEndpoints.filter(p => Math.abs(p.y - hMaxY) < 2);
    const xs = pts.map(p => p.x);
    const lx = xs.length > 0 ? Math.min(...xs) : (bMinX + bMaxX) / 2;
    const rx = xs.length > 1 ? Math.max(...xs) : lx;
    elements.push(<DistanceMarker key="dim-s-l" x1={gx(lx)} y1={gy(bMaxY)} x2={gx(lx)} y2={gy(hMaxY)} label={`${mm}`} zoom={zoom} color={c} />);
    if (Math.abs(rx - lx) > 30)
      elements.push(<DistanceMarker key="dim-s-r" x1={gx(rx)} y1={gy(bMaxY)} x2={gx(rx)} y2={gy(hMaxY)} label={`${mm}`} zoom={zoom} color={c} />);
  }
  if (eastDist !== 0) {
    const mm = Math.round(gridToMm(Math.abs(eastDist)));
    const c = DIM_COLOR;
    const pts = allEndpoints.filter(p => Math.abs(p.x - hMaxX) < 2);
    const ys = pts.map(p => p.y);
    const ty = ys.length > 0 ? Math.min(...ys) : (bMinY + bMaxY) / 2;
    const by = ys.length > 1 ? Math.max(...ys) : ty;
    elements.push(<DistanceMarker key="dim-e-t" x1={gx(bMaxX)} y1={gy(ty)} x2={gx(hMaxX)} y2={gy(ty)} label={`${mm}`} zoom={zoom} color={c} />);
    if (Math.abs(by - ty) > 30)
      elements.push(<DistanceMarker key="dim-e-b" x1={gx(bMaxX)} y1={gy(by)} x2={gx(hMaxX)} y2={gy(by)} label={`${mm}`} zoom={zoom} color={c} />);
  }
  if (westDist !== 0) {
    const mm = Math.round(gridToMm(Math.abs(westDist)));
    const c = DIM_COLOR;
    const pts = allEndpoints.filter(p => Math.abs(p.x - hMinX) < 2);
    const ys = pts.map(p => p.y);
    const ty = ys.length > 0 ? Math.min(...ys) : (bMinY + bMaxY) / 2;
    const by = ys.length > 1 ? Math.max(...ys) : ty;
    elements.push(<DistanceMarker key="dim-w-t" x1={gx(bMinX)} y1={gy(ty)} x2={gx(hMinX)} y2={gy(ty)} label={`${mm}`} zoom={zoom} color={c} />);
    if (Math.abs(by - ty) > 30)
      elements.push(<DistanceMarker key="dim-w-b" x1={gx(bMinX)} y1={gy(by)} x2={gx(hMinX)} y2={gy(by)} label={`${mm}`} zoom={zoom} color={c} />);
  }

  return <Layer listening={false}>{elements}</Layer>;
}
