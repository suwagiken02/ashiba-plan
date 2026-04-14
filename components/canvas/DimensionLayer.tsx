'use client';

import React from 'react';
import { Layer, Line, Rect, Text } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX, gridToMm, mmToGrid } from '@/lib/konva/gridUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import { getBuildingEdgesClockwise } from '@/lib/konva/autoLayoutUtils';
import { StartCorner } from '@/types';

const GUIDE_COLOR = '#378ADD';
const GUIDE_OPACITY = 0.3;
const COLOR_OK = '#888780';
const COLOR_WARN = '#E85D3A';
const ARROW = 4;
const TOL = 15;

/** ガイド線 + ラベル */
function Guide({
  x1, y1, x2, y2, label, zoom, color,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; zoom: number; color: string;
}) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;
  const a = ARROW * zoom;
  const fs = Math.max(12, 14 * zoom);
  const isV = Math.abs(dx) < Math.abs(dy);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const tw = label.length * fs * 0.65 + 6, th = fs + 4;

  return (
    <>
      <Line points={[x1, y1, x2, y2]}
        stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
      {isV ? (
        <>
          <Line points={[x1 - a, y1 + a, x1, y1, x1 + a, y1 + a]}
            stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
          <Line points={[x2 - a, y2 - a, x2, y2, x2 + a, y2 - a]}
            stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
        </>
      ) : (
        <>
          <Line points={[x1 + a, y1 - a, x1, y1, x1 + a, y1 + a]}
            stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
          <Line points={[x2 - a, y2 - a, x2, y2, x2 - a, y2 + a]}
            stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_OPACITY} listening={false} />
        </>
      )}
      <Rect x={mx - tw / 2} y={my - th / 2} width={tw} height={th}
        fill="white" opacity={0.75} cornerRadius={2} listening={false} />
      <Text x={mx - (label.length * fs * 0.65) / 2} y={my - fs / 2}
        text={label} fontSize={fs} fontFamily="monospace" fontStyle="bold"
        fill={color} listening={false} />
    </>
  );
}

/**
 * コーナー頂点のインデックスを特定する。
 * NW: -x-y が最大, NE: +x-y, SE: +x+y, SW: -x+y
 */
function findCornerVertexIndex(
  pts: { x: number; y: number }[],
  corner: StartCorner,
): number {
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let score = 0;
    score += (corner === 'ne' || corner === 'se') ? p.x : -p.x;
    score += (corner === 'se' || corner === 'sw') ? p.y : -p.y;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

/** 対角コーナー */
const OPPOSITE_CORNER: Record<StartCorner, StartCorner> = {
  nw: 'se', ne: 'sw', se: 'nw', sw: 'ne',
};

export default function DimensionLayer() {
  const { canvasData, zoom, panX, panY, showDimensions } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;

  if (!showDimensions) return <Layer listening={false} />;
  if (!canvasData.buildings.length || !canvasData.handrails.length) return <Layer listening={false} />;

  const gx = (g: number) => g * gridPx + panX;
  const gy = (g: number) => g * gridPx + panY;
  const elements: React.ReactElement[] = [];

  // 全手摺の端点
  const eps: { x: number; y: number }[] = [];
  for (const h of canvasData.handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    eps.push(p1, p2);
  }

  const scaffoldStart = canvasData.scaffoldStart;

  if (scaffoldStart && canvasData.buildings.length > 0) {
    const building = canvasData.buildings[0];
    const edges = getBuildingEdgesClockwise(building);
    const n = edges.length;
    if (n < 3) return <Layer listening={false} />;

    const corner = scaffoldStart.corner;
    const face1Dist = mmToGrid(scaffoldStart.face1DistanceMm);
    const face2Dist = mmToGrid(scaffoldStart.face2DistanceMm);
    const pts = edges.map(e => e.p1);

    // コーナー頂点（巡回開始点）
    const startIdx = findCornerVertexIndex(pts, corner);
    // 対角頂点（Path1/Path2 の分割点）
    const oppIdx = findCornerVertexIndex(pts, OPPOSITE_CORNER[corner]);

    // 分割ステップ: CWで対角頂点に到達するまでのステップ数
    // step 0..splitStep-1 = Path1（CW腕、forward: p1→p2）
    // step splitStep..n-1 = Path2（CCW腕、reversed: p2→p1）
    const splitStep = (oppIdx - startIdx + n) % n;

    console.log(`[DimLayer] corner=${corner} startIdx=${startIdx} vertex=(${pts[startIdx].x},${pts[startIdx].y}) oppIdx=${oppIdx} oppVertex=(${pts[oppIdx].x},${pts[oppIdx].y}) splitStep=${splitStep}`);

    for (let step = 0; step < n; step++) {
      const idx = (startIdx + step) % n;
      const edge = edges[idx];
      const isReversed = step >= splitStep;
      const isH = edge.face === 'north' || edge.face === 'south';

      // 進行方向と終点
      // Path1 (forward): p1→p2 方向、farEnd=p2
      // Path2 (reversed): p2→p1 方向、farEnd=p1
      const farEnd = isReversed ? edge.p1 : edge.p2;
      const progressDx = isReversed ? edge.p1.x - edge.p2.x : edge.p2.x - edge.p1.x;
      const progressDy = isReversed ? edge.p1.y - edge.p2.y : edge.p2.y - edge.p1.y;

      // 足場ラインの固定軸座標
      const dist = isH ? face1Dist : face2Dist;
      let scaffoldCoord: number;
      if (edge.face === 'north') scaffoldCoord = ((edge.p1.y + edge.p2.y) / 2) - dist;
      else if (edge.face === 'south') scaffoldCoord = ((edge.p1.y + edge.p2.y) / 2) + dist;
      else if (edge.face === 'east') scaffoldCoord = ((edge.p1.x + edge.p2.x) / 2) + dist;
      else /* west */ scaffoldCoord = ((edge.p1.x + edge.p2.x) / 2) - dist;

      // 足場ライン付近の手摺端点を収集
      const coords: number[] = [];
      for (const ep of eps) {
        if (isH && Math.abs(ep.y - scaffoldCoord) < TOL) coords.push(ep.x);
        if (!isH && Math.abs(ep.x - scaffoldCoord) < TOL) coords.push(ep.y);
      }

      console.log(`[DimLayer] step=${step} ${edge.label}(${edge.face}) ${isReversed ? 'REV' : 'FWD'} farEnd=(${farEnd.x},${farEnd.y}) dx=${progressDx} dy=${progressDy} scf=${scaffoldCoord} pts=${coords.length}`);

      if (coords.length === 0) continue;

      // リード（進行方向の最先端）と残り距離
      let lead: number, remainGrid: number;
      if (isH) {
        lead = progressDx > 0 ? Math.max(...coords) : Math.min(...coords);
        remainGrid = progressDx > 0 ? farEnd.x - lead : lead - farEnd.x;
      } else {
        lead = progressDy > 0 ? Math.max(...coords) : Math.min(...coords);
        remainGrid = progressDy > 0 ? farEnd.y - lead : lead - farEnd.y;
      }

      const remainMm = Math.round(gridToMm(remainGrid));
      const color = remainMm >= 0 ? COLOR_OK : COLOR_WARN;

      console.log(`[DimLayer]   lead=${lead} remain=${remainMm}mm`);

      // ガイド描画
      if (isH) {
        const x1 = Math.min(lead, farEnd.x);
        const x2 = Math.max(lead, farEnd.x);
        elements.push(
          <Guide key={`guide-${edge.label}`}
            x1={gx(x1)} y1={gy(scaffoldCoord)}
            x2={gx(x2)} y2={gy(scaffoldCoord)}
            label={`${remainMm}`} zoom={zoom} color={color} />,
        );
      } else {
        const y1 = Math.min(lead, farEnd.y);
        const y2 = Math.max(lead, farEnd.y);
        elements.push(
          <Guide key={`guide-${edge.label}`}
            x1={gx(scaffoldCoord)} y1={gy(y1)}
            x2={gx(scaffoldCoord)} y2={gy(y2)}
            label={`${remainMm}`} zoom={zoom} color={color} />,
        );
      }
    }

    console.log(`[DimLayer] total: ${elements.length} elements`);
    return <Layer listening={false}>{elements}</Layer>;
  }

  // ── フォールバック: scaffoldStart未設定時はBBOXベース ──
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  for (const b of canvasData.buildings)
    for (const p of b.points) {
      if (p.x < bMinX) bMinX = p.x; if (p.y < bMinY) bMinY = p.y;
      if (p.x > bMaxX) bMaxX = p.x; if (p.y > bMaxY) bMaxY = p.y;
    }
  let hMinX = Infinity, hMinY = Infinity, hMaxX = -Infinity, hMaxY = -Infinity;
  for (const p of eps) {
    if (p.x < hMinX) hMinX = p.x; if (p.y < hMinY) hMinY = p.y;
    if (p.x > hMaxX) hMaxX = p.x; if (p.y > hMaxY) hMaxY = p.y;
  }

  const nd = bMinY - hMinY;
  if (nd !== 0) {
    const mm = Math.round(gridToMm(Math.abs(nd)));
    const pts = eps.filter(p => Math.abs(p.y - hMinY) < 2);
    const lx = pts.length ? Math.min(...pts.map(p => p.x)) : (bMinX + bMaxX) / 2;
    elements.push(<Guide key="dim-n" x1={gx(lx)} y1={gy(bMinY)} x2={gx(lx)} y2={gy(hMinY)} label={`${mm}`} zoom={zoom} color={COLOR_OK} />);
  }
  const sd = hMaxY - bMaxY;
  if (sd !== 0) {
    const mm = Math.round(gridToMm(Math.abs(sd)));
    const pts = eps.filter(p => Math.abs(p.y - hMaxY) < 2);
    const lx = pts.length ? Math.min(...pts.map(p => p.x)) : (bMinX + bMaxX) / 2;
    elements.push(<Guide key="dim-s" x1={gx(lx)} y1={gy(bMaxY)} x2={gx(lx)} y2={gy(hMaxY)} label={`${mm}`} zoom={zoom} color={COLOR_OK} />);
  }
  const ed = hMaxX - bMaxX;
  if (ed !== 0) {
    const mm = Math.round(gridToMm(Math.abs(ed)));
    const pts = eps.filter(p => Math.abs(p.x - hMaxX) < 2);
    const ty = pts.length ? Math.min(...pts.map(p => p.y)) : (bMinY + bMaxY) / 2;
    elements.push(<Guide key="dim-e" x1={gx(bMaxX)} y1={gy(ty)} x2={gx(hMaxX)} y2={gy(ty)} label={`${mm}`} zoom={zoom} color={COLOR_OK} />);
  }
  const wd = bMinX - hMinX;
  if (wd !== 0) {
    const mm = Math.round(gridToMm(Math.abs(wd)));
    const pts = eps.filter(p => Math.abs(p.x - hMinX) < 2);
    const ty = pts.length ? Math.min(...pts.map(p => p.y)) : (bMinY + bMaxY) / 2;
    elements.push(<Guide key="dim-w" x1={gx(bMinX)} y1={gy(ty)} x2={gx(hMinX)} y2={gy(ty)} label={`${mm}`} zoom={zoom} color={COLOR_OK} />);
  }

  return <Layer listening={false}>{elements}</Layer>;
}
