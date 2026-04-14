'use client';

import React from 'react';
import { Layer, Line, Rect, Text } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX, gridToMm, mmToGrid } from '@/lib/konva/gridUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import { getBuildingEdgesClockwise } from '@/lib/konva/autoLayoutUtils';

const GUIDE_COLOR = '#378ADD';
const GUIDE_OPACITY = 0.3;
const COLOR_OK = '#888780';
const COLOR_WARN = '#E85D3A';
const ARROW = 4;

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

export default function DimensionLayer() {
  const { canvasData, zoom, panX, panY, showDimensions } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;

  if (!showDimensions) return <Layer listening={false} />;
  if (!canvasData.buildings.length || !canvasData.handrails.length) return <Layer listening={false} />;

  const gx = (g: number) => g * gridPx + panX;
  const gy = (g: number) => g * gridPx + panY;
  const elements: React.ReactElement[] = [];
  const TOL = 15; // グリッド許容差（離れ計算の丸め誤差を吸収）

  // 全手摺の端点
  const eps: { x: number; y: number; dir: string }[] = [];
  // [DEBUG] 全手摺の中身をダンプ
  console.log(`[DimLayer] handrails count=${canvasData.handrails.length}`);
  for (const h of canvasData.handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    const d = typeof h.direction === 'string' ? h.direction : 'other';
    console.log(`[DimLayer]   id=${h.id.slice(0,8)} dir="${h.direction}"(type=${typeof h.direction}) → "${d}" p1=(${p1.x},${p1.y}) p2=(${p2.x},${p2.y})`);
    eps.push({ ...p1, dir: d }, { ...p2, dir: d });
  }

  const scaffoldStart = canvasData.scaffoldStart;
  if (!scaffoldStart || scaffoldStart.corner !== 'nw') {
    // NW以外 or scaffoldStartなし → フォールバック（BBOX）
    return <Layer listening={false}>{renderBBoxFallback(canvasData, eps, gx, gy, zoom, elements)}</Layer>;
  }

  // ── NWコーナー専用ロジック ──
  const building = canvasData.buildings[0];
  const edges = getBuildingEdgesClockwise(building);
  if (edges.length < 3) return <Layer listening={false} />;

  // A面（north辺のうちx最小側 = NWコーナーに接する北面辺）
  const northEdges = edges.filter(e => e.face === 'north');
  // F面（west辺のうちy最小側 = NWコーナーに接する西面辺）
  const westEdges = edges.filter(e => e.face === 'west');

  if (!northEdges.length || !westEdges.length) return <Layer listening={false} />;

  const faceA = [...northEdges].sort((a, b) => Math.min(a.p1.x, a.p2.x) - Math.min(b.p1.x, b.p2.x))[0];
  const faceF = [...westEdges].sort((a, b) => Math.min(a.p1.y, a.p2.y) - Math.min(b.p1.y, b.p2.y))[0];

  // 建物辺の座標
  const bldNorthY = (faceA.p1.y + faceA.p2.y) / 2;
  const bldWestX = (faceF.p1.x + faceF.p2.x) / 2;

  // AB角（A面の終点 = 東端）
  const abCornerX = Math.max(faceA.p1.x, faceA.p2.x);
  // EF角（F面の始点 = 南端）
  const efCornerY = Math.max(faceF.p1.y, faceF.p2.y);

  // 足場ライン座標
  const face1DistGrid = mmToGrid(scaffoldStart.face1DistanceMm);
  const face2DistGrid = mmToGrid(scaffoldStart.face2DistanceMm);
  const scaffoldY = bldNorthY - face1DistGrid;
  const scaffoldX = bldWestX - face2DistGrid;

  console.log(`[DimLayer] NW: faceA=${faceA.label} p1=(${faceA.p1.x},${faceA.p1.y}) p2=(${faceA.p2.x},${faceA.p2.y}) abCornerX=${abCornerX}`);
  console.log(`[DimLayer] NW: faceF=${faceF.label} p1=(${faceF.p1.x},${faceF.p1.y}) p2=(${faceF.p2.x},${faceF.p2.y}) efCornerY=${efCornerY}`);
  console.log(`[DimLayer] NW: scaffoldY=${scaffoldY} scaffoldX=${scaffoldX}`);

  // ── ガイド1: A面（北面）の残り距離 ──
  // scaffoldY 付近の水平手摺の最大X
  // dir判定を緩和: horizontal, vertical, number すべての手摺からY座標が近いものを収集
  const northHandrailXs: number[] = [];
  for (const ep of eps) {
    const yDiff = Math.abs(ep.y - scaffoldY);
    if (yDiff < TOL) {
      northHandrailXs.push(ep.x);
      console.log(`[DimLayer] A面 match: ep=(${ep.x},${ep.y}) dir=${ep.dir} yDiff=${yDiff.toFixed(1)}`);
    }
  }
  console.log(`[DimLayer] A面 result: ${northHandrailXs.length} pts near Y=${scaffoldY}`);

  if (northHandrailXs.length > 0) {
    const leadX = Math.max(...northHandrailXs);
    const remainGrid = abCornerX - leadX;
    const remainMm = Math.round(gridToMm(remainGrid));
    const color = remainMm >= 0 ? COLOR_OK : COLOR_WARN;
    const x1 = Math.min(leadX, abCornerX);
    const x2 = Math.max(leadX, abCornerX);

    console.log(`[DimLayer] PUSH f1: leadX=${leadX} abCornerX=${abCornerX} remainMm=${remainMm} x1=${x1} x2=${x2} screenX1=${gx(x1).toFixed(1)} screenX2=${gx(x2).toFixed(1)}`);

    elements.push(
      <Guide key="guide-a"
        x1={gx(x1)} y1={gy(scaffoldY)}
        x2={gx(x2)} y2={gy(scaffoldY)}
        label={`${remainMm}`} zoom={zoom} color={color} />,
    );
  } else {
    console.log(`[DimLayer] A面 SKIP: no handrails found near scaffoldY=${scaffoldY}`);
    // 全端点のY座標をダンプして確認
    const allYs = eps.map(ep => ep.y);
    const uniqueYs = Array.from(new Set(allYs)).sort((a, b) => a - b);
    console.log(`[DimLayer] all endpoint Y values: [${uniqueYs.join(', ')}]`);
  }

  // ── ガイド2: F面（西面）の残り距離 ──
  const westHandrailYs: number[] = [];
  for (const ep of eps) {
    const xDiff = Math.abs(ep.x - scaffoldX);
    if (xDiff < TOL) {
      westHandrailYs.push(ep.y);
      console.log(`[DimLayer] F面 match: ep=(${ep.x},${ep.y}) dir=${ep.dir} xDiff=${xDiff.toFixed(1)}`);
    }
  }
  console.log(`[DimLayer] F面 result: ${westHandrailYs.length} pts near X=${scaffoldX}`);

  if (westHandrailYs.length > 0) {
    const leadY = Math.max(...westHandrailYs);
    const remainGrid = efCornerY - leadY;
    const remainMm = Math.round(gridToMm(remainGrid));
    const color = remainMm >= 0 ? COLOR_OK : COLOR_WARN;
    const y1 = Math.min(leadY, efCornerY);
    const y2 = Math.max(leadY, efCornerY);

    console.log(`[DimLayer] PUSH f2: leadY=${leadY} efCornerY=${efCornerY} remainMm=${remainMm} y1=${y1} y2=${y2} screenY1=${gy(y1).toFixed(1)} screenY2=${gy(y2).toFixed(1)}`);

    elements.push(
      <Guide key="guide-f"
        x1={gx(scaffoldX)} y1={gy(y1)}
        x2={gx(scaffoldX)} y2={gy(y2)}
        label={`${remainMm}`} zoom={zoom} color={color} />,
    );
  } else {
    console.log(`[DimLayer] F面 SKIP: no handrails found near scaffoldX=${scaffoldX}`);
    const allXs = eps.map(ep => ep.x);
    const uniqueXs = Array.from(new Set(allXs)).sort((a, b) => a - b);
    console.log(`[DimLayer] all endpoint X values: [${uniqueXs.join(', ')}]`);
  }

  // ── ガイド3: B面（東面、AB角から南へ進行）の残り距離 ──
  // B面 = east向き辺のうち、AB角(x=abCornerX)に接する辺
  const eastEdges = edges.filter(e => e.face === 'east');
  // AB角のX座標に近い辺を選ぶ（p1.xまたはp2.xがabCornerXに近い）
  const faceBCandidates = eastEdges.filter(e =>
    Math.abs(e.p1.x - abCornerX) < TOL || Math.abs(e.p2.x - abCornerX) < TOL
  );
  // 候補がなければeast辺のうちy最小側（NWコーナー寄り）
  const faceB = faceBCandidates.length > 0
    ? faceBCandidates.sort((a, b) => Math.min(a.p1.y, a.p2.y) - Math.min(b.p1.y, b.p2.y))[0]
    : eastEdges.length > 0
      ? [...eastEdges].sort((a, b) => Math.min(a.p1.y, a.p2.y) - Math.min(b.p1.y, b.p2.y))[0]
      : null;

  if (faceB) {
    // B面の建物X座標
    const bldBX = (faceB.p1.x + faceB.p2.x) / 2;
    // BC角 = B面の南端（進行方向の終点）
    const bcCornerY = Math.max(faceB.p1.y, faceB.p2.y);
    // B面の足場ラインX = AB角のX + 北面の離れ（東側に離れる）
    const scaffoldBX = bldBX + face1DistGrid;

    console.log(`[DimLayer] NW: faceB=${faceB.label} p1=(${faceB.p1.x},${faceB.p1.y}) p2=(${faceB.p2.x},${faceB.p2.y}) bcCornerY=${bcCornerY} scaffoldBX=${scaffoldBX}`);

    // scaffoldBX 付近の垂直手摺の最南端Y
    const bHandrailYs: number[] = [];
    for (const ep of eps) {
      const xDiff = Math.abs(ep.x - scaffoldBX);
      if (xDiff < TOL) {
        bHandrailYs.push(ep.y);
        console.log(`[DimLayer] B面 match: ep=(${ep.x},${ep.y}) dir=${ep.dir} xDiff=${xDiff.toFixed(1)}`);
      }
    }
    console.log(`[DimLayer] B面 result: ${bHandrailYs.length} pts near X=${scaffoldBX}`);

    if (bHandrailYs.length > 0) {
      const leadY = Math.max(...bHandrailYs); // 南へ進行 → 最大Y
      const remainGrid = bcCornerY - leadY;
      const remainMm = Math.round(gridToMm(remainGrid));
      const color = remainMm >= 0 ? COLOR_OK : COLOR_WARN;
      const y1 = Math.min(leadY, bcCornerY);
      const y2 = Math.max(leadY, bcCornerY);

      console.log(`[DimLayer] PUSH B面: leadY=${leadY} bcCornerY=${bcCornerY} remainMm=${remainMm}`);

      elements.push(
        <Guide key="guide-b"
          x1={gx(scaffoldBX)} y1={gy(y1)}
          x2={gx(scaffoldBX)} y2={gy(y2)}
          label={`${remainMm}`} zoom={zoom} color={color} />,
      );
    } else {
      console.log(`[DimLayer] B面 SKIP: no handrails found near scaffoldBX=${scaffoldBX}`);
    }
  } else {
    console.log(`[DimLayer] B面 SKIP: no east edge found`);
  }

  // ── ガイド4: C面（内側north面、BC角から東へ進行）の残り距離 ──
  // C面 = north向き辺のうち、A面ではない方（Y座標がA面より大きい = 内側）
  // NWコーナーL字: A面y=-150, C面y=150 → C面はYが大きい方
  const faceCCandidates = northEdges.filter(e => {
    const ey = (e.p1.y + e.p2.y) / 2;
    return Math.abs(ey - bldNorthY) > TOL; // A面と異なるY位置のnorth辺
  });
  const faceC = faceCCandidates.length > 0
    ? faceCCandidates.sort((a, b) => {
        // Y座標が大きい（南寄り = 内側）を優先
        return ((b.p1.y + b.p2.y) / 2) - ((a.p1.y + a.p2.y) / 2);
      })[0]
    : null;

  if (faceC) {
    const faceCY = (faceC.p1.y + faceC.p2.y) / 2;
    // CD角 = C面の東端X
    const cdCornerX = Math.max(faceC.p1.x, faceC.p2.x);
    // C面の足場ラインY = C面外壁Y - 北向き離れ
    const scaffoldCY = faceCY - face1DistGrid;

    console.log(`[DimLayer] NW: faceC=${faceC.label} p1=(${faceC.p1.x},${faceC.p1.y}) p2=(${faceC.p2.x},${faceC.p2.y}) cdCornerX=${cdCornerX} scaffoldCY=${scaffoldCY}`);

    // scaffoldCY 付近の手摺端点の最東端X
    const cHandrailXs: number[] = [];
    for (const ep of eps) {
      const yDiff = Math.abs(ep.y - scaffoldCY);
      if (yDiff < TOL) {
        cHandrailXs.push(ep.x);
        console.log(`[DimLayer] C面 match: ep=(${ep.x},${ep.y}) dir=${ep.dir} yDiff=${yDiff.toFixed(1)}`);
      }
    }
    console.log(`[DimLayer] C面 result: ${cHandrailXs.length} pts near Y=${scaffoldCY}`);

    if (cHandrailXs.length > 0) {
      const leadX = Math.max(...cHandrailXs); // 東へ進行 → 最大X
      const remainGrid = cdCornerX - leadX;
      const remainMm = Math.round(gridToMm(remainGrid));
      const color = remainMm >= 0 ? COLOR_OK : COLOR_WARN;
      const x1 = Math.min(leadX, cdCornerX);
      const x2 = Math.max(leadX, cdCornerX);

      console.log(`[DimLayer] PUSH C面: leadX=${leadX} cdCornerX=${cdCornerX} remainMm=${remainMm}`);

      elements.push(
        <Guide key="guide-c"
          x1={gx(x1)} y1={gy(scaffoldCY)}
          x2={gx(x2)} y2={gy(scaffoldCY)}
          label={`${remainMm}`} zoom={zoom} color={color} />,
      );
    } else {
      console.log(`[DimLayer] C面 SKIP: no handrails found near scaffoldCY=${scaffoldCY}`);
    }
  } else {
    console.log(`[DimLayer] C面 SKIP: no inner north edge found (rect building?)`);
  }

  // ── ガイド5: D面（east向き、外側、CD角から南へ進行）の残り距離 ──
  // D面 = east辺のうち B面とは異なるX位置（外側 = X最大側）
  // B面は内側east (x=450)、D面は外側east (x=750)
  const faceDCandidates = eastEdges.filter(e => {
    const ex = (e.p1.x + e.p2.x) / 2;
    // B面がある場合はそれと異なるX、ない場合は全候補
    if (faceB) {
      const faceBX = (faceB.p1.x + faceB.p2.x) / 2;
      return Math.abs(ex - faceBX) > TOL;
    }
    return true;
  });
  const faceD = faceDCandidates.length > 0
    ? faceDCandidates.sort((a, b) => {
        // X座標が大きい（東側 = 外側）を優先
        return ((b.p1.x + b.p2.x) / 2) - ((a.p1.x + a.p2.x) / 2);
      })[0]
    : null;

  if (faceD) {
    const faceDX = (faceD.p1.x + faceD.p2.x) / 2;
    // DE角 = D面の南端Y
    const deCornerY = Math.max(faceD.p1.y, faceD.p2.y);
    // D面の足場ラインX = D面外壁X + 東向き離れ
    const scaffoldDX = faceDX + face1DistGrid;

    console.log(`[DimLayer] NW: faceD=${faceD.label} p1=(${faceD.p1.x},${faceD.p1.y}) p2=(${faceD.p2.x},${faceD.p2.y}) deCornerY=${deCornerY} scaffoldDX=${scaffoldDX}`);

    const dHandrailYs: number[] = [];
    for (const ep of eps) {
      const xDiff = Math.abs(ep.x - scaffoldDX);
      if (xDiff < TOL) {
        dHandrailYs.push(ep.y);
        console.log(`[DimLayer] D面 match: ep=(${ep.x},${ep.y}) dir=${ep.dir} xDiff=${xDiff.toFixed(1)}`);
      }
    }
    console.log(`[DimLayer] D面 result: ${dHandrailYs.length} pts near X=${scaffoldDX}`);

    if (dHandrailYs.length > 0) {
      const leadY = Math.max(...dHandrailYs); // 南へ進行 → 最大Y
      const remainGrid = deCornerY - leadY;
      const remainMm = Math.round(gridToMm(remainGrid));
      const color = remainMm >= 0 ? COLOR_OK : COLOR_WARN;
      const y1 = Math.min(leadY, deCornerY);
      const y2 = Math.max(leadY, deCornerY);

      console.log(`[DimLayer] PUSH D面: leadY=${leadY} deCornerY=${deCornerY} remainMm=${remainMm}`);

      elements.push(
        <Guide key="guide-d"
          x1={gx(scaffoldDX)} y1={gy(y1)}
          x2={gx(scaffoldDX)} y2={gy(y2)}
          label={`${remainMm}`} zoom={zoom} color={color} />,
      );
    } else {
      console.log(`[DimLayer] D面 SKIP: no handrails found near scaffoldDX=${scaffoldDX}`);
    }
  } else {
    console.log(`[DimLayer] D面 SKIP: no outer east edge found (rect building?)`);
  }

  // ── ガイド6: E面（south向き、DE角から西へ進行）の残り距離 ──
  const southEdges = edges.filter(e => e.face === 'south');
  // E面 = south辺のうちY最大側（最南端）
  const faceE = southEdges.length > 0
    ? [...southEdges].sort((a, b) => {
        return ((b.p1.y + b.p2.y) / 2) - ((a.p1.y + a.p2.y) / 2);
      })[0]
    : null;

  if (faceE) {
    const faceEY = (faceE.p1.y + faceE.p2.y) / 2;
    // EF角 = E面の西端X（NWコーナー方向 = 最小X）
    const efCornerX = Math.min(faceE.p1.x, faceE.p2.x);
    // E面の足場ラインY = E面外壁Y + 南向き離れ
    const scaffoldEY = faceEY + face1DistGrid;

    console.log(`[DimLayer] NW: faceE=${faceE.label} p1=(${faceE.p1.x},${faceE.p1.y}) p2=(${faceE.p2.x},${faceE.p2.y}) efCornerX=${efCornerX} scaffoldEY=${scaffoldEY}`);

    const eHandrailXs: number[] = [];
    for (const ep of eps) {
      const yDiff = Math.abs(ep.y - scaffoldEY);
      if (yDiff < TOL) {
        eHandrailXs.push(ep.x);
        console.log(`[DimLayer] E面 match: ep=(${ep.x},${ep.y}) dir=${ep.dir} yDiff=${yDiff.toFixed(1)}`);
      }
    }
    console.log(`[DimLayer] E面 result: ${eHandrailXs.length} pts near Y=${scaffoldEY}`);

    if (eHandrailXs.length > 0) {
      const leadX = Math.min(...eHandrailXs); // 西へ進行 → 最小X
      const remainGrid = leadX - efCornerX;
      const remainMm = Math.round(gridToMm(remainGrid));
      const color = remainMm >= 0 ? COLOR_OK : COLOR_WARN;
      const x1 = Math.min(leadX, efCornerX);
      const x2 = Math.max(leadX, efCornerX);

      console.log(`[DimLayer] PUSH E面: leadX=${leadX} efCornerX=${efCornerX} remainMm=${remainMm}`);

      elements.push(
        <Guide key="guide-e"
          x1={gx(x1)} y1={gy(scaffoldEY)}
          x2={gx(x2)} y2={gy(scaffoldEY)}
          label={`${remainMm}`} zoom={zoom} color={color} />,
      );
    } else {
      console.log(`[DimLayer] E面 SKIP: no handrails found near scaffoldEY=${scaffoldEY}`);
    }
  } else {
    console.log(`[DimLayer] E面 SKIP: no south edge found`);
  }

  console.log(`[DimLayer] scaffoldStart path: ${elements.length} elements`);
  return <Layer listening={false}>{elements}</Layer>;
}

/** scaffoldStart 未設定時の BBOX フォールバック */
function renderBBoxFallback(
  canvasData: ReturnType<typeof useCanvasStore.getState>['canvasData'],
  eps: { x: number; y: number }[],
  gx: (g: number) => number,
  gy: (g: number) => number,
  zoom: number,
  elements: React.ReactElement[],
): React.ReactElement[] {
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

  const faces: { dist: number; key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  const nd = bMinY - hMinY;
  if (nd !== 0) {
    const pts = eps.filter(p => Math.abs(p.y - hMinY) < 2);
    const lx = pts.length ? Math.min(...pts.map(p => p.x)) : (bMinX + bMaxX) / 2;
    faces.push({ dist: nd, key: 'n', x1: lx, y1: bMinY, x2: lx, y2: hMinY });
  }
  const sd = hMaxY - bMaxY;
  if (sd !== 0) {
    const pts = eps.filter(p => Math.abs(p.y - hMaxY) < 2);
    const lx = pts.length ? Math.min(...pts.map(p => p.x)) : (bMinX + bMaxX) / 2;
    faces.push({ dist: sd, key: 's', x1: lx, y1: bMaxY, x2: lx, y2: hMaxY });
  }
  const ed = hMaxX - bMaxX;
  if (ed !== 0) {
    const pts = eps.filter(p => Math.abs(p.x - hMaxX) < 2);
    const ty = pts.length ? Math.min(...pts.map(p => p.y)) : (bMinY + bMaxY) / 2;
    faces.push({ dist: ed, key: 'e', x1: bMaxX, y1: ty, x2: hMaxX, y2: ty });
  }
  const wd = bMinX - hMinX;
  if (wd !== 0) {
    const pts = eps.filter(p => Math.abs(p.x - hMinX) < 2);
    const ty = pts.length ? Math.min(...pts.map(p => p.y)) : (bMinY + bMaxY) / 2;
    faces.push({ dist: wd, key: 'w', x1: bMinX, y1: ty, x2: hMinX, y2: ty });
  }

  for (const f of faces) {
    const mm = Math.round(gridToMm(Math.abs(f.dist)));
    elements.push(
      <Guide key={`dim-${f.key}`}
        x1={gx(f.x1)} y1={gy(f.y1)} x2={gx(f.x2)} y2={gy(f.y2)}
        label={`${mm}`} zoom={zoom} color={COLOR_OK} />,
    );
  }
  return elements;
}
