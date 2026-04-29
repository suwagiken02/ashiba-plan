'use client';

import React, { useMemo } from 'react';
import { Layer, Line, Rect, Text } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { useHandrailSettingsStore } from '@/stores/handrailSettingsStore';
import { INITIAL_GRID_PX, gridToMm } from '@/lib/konva/gridUtils';
import { getEdgeOverhangs, computeOffsetPolygon } from '@/lib/konva/roofUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import type { BuildingShape, Handrail, Point } from '@/types';

// ============================================================
// Phase J-2: 建物寸法線リニューアル
// 業界標準 (JIS A 0150 / JIS Z 8317) 準拠の 2 段寸法線。
//
// 各方位 (北/南/東/西) に 2 段:
//   内側 (建物寄り) = 本体のみ、各辺長を直列寸法
//   外側 (建物から遠い) = 屋根輪郭ポリゴン (computeOffsetPolygon) の各辺長
//
// floor 別 (1F/2F) で完全分離、外側に向かって 4 段 (1F 内 → 1F 外 → 2F 内 → 2F 外)。
// 1F = dark gray、2F = accent blue で色分け。
//
// 廃止: 足場寸法線 (旧 OFF_SCAFFOLD)、canvasData.roofOverhangs 参照。
// ============================================================

const COLOR_1F = '#444';
const COLOR_2F = '#378ADD';
const BG_FILL = '#ffffff';
const BG_OPACITY = 0.92;
const LW = 1;
const TICK_LEN = 6;       // 端末記号 = 短い直線 (tick mark)
const FONT_BASE = 11;
const PAD_X = 3;
const PAD_Y = 2;

// 軸オフセット (建物 BBox 端からの距離 px、外向き)
// Phase J-4: floor 別 + bothmode 切替。
// solo (1F のみ or 2F のみ): 30 (足場) → 60 (外壁) → 110 (屋根) の 3 段。
// bothmode: 2F 足場 20 → 1F 足場 35 → 2F 外壁 70 → 2F 屋根 120 →
//          1F 外壁 180 → 1F 屋根 240 の 6 段。
//          建物に近いほど内側、2F 寸法線が 1F より建物寄りに位置。
const OFF_SCAFFOLD_SOLO = 30;
const OFF_WALL_SOLO = 60;
const OFF_ROOF_SOLO = 110;

const OFF_SCAFFOLD_2F_BOTH = 20;
const OFF_SCAFFOLD_1F_BOTH = 35;
const OFF_WALL_2F_BOTH = 70;
const OFF_ROOF_2F_BOTH = 120;
const OFF_WALL_1F_BOTH = 180;
const OFF_ROOF_1F_BOTH = 240;

type Face = 'north' | 'south' | 'east' | 'west';
type BB = { minX: number; minY: number; maxX: number; maxY: number };
type Span = { s: number; e: number; mm: number };

const bb0 = (): BB => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
const bbG = (b: BB, x: number, y: number): BB => ({
  minX: Math.min(b.minX, x), minY: Math.min(b.minY, y),
  maxX: Math.max(b.maxX, x), maxY: Math.max(b.maxY, y),
});
const bbOk = (b: BB) => b.minX < b.maxX && b.minY < b.maxY;

/* ===== ラベル描画 (白背景 + 指定色文字) ===== */
function renderLabel(
  cx: number, cy: number, text: string, fs: number, k: string, color: string,
): React.ReactElement[] {
  const w = text.length * fs * 0.6 + PAD_X * 2;
  const h = fs + PAD_Y * 2;
  return [
    <Rect key={`${k}B`} x={cx - w / 2} y={cy - h / 2}
      width={w} height={h} fill={BG_FILL} opacity={BG_OPACITY}
      cornerRadius={2} listening={false} />,
    <Text key={`${k}T`} x={cx - w / 2 + PAD_X} y={cy - fs / 2}
      text={text} fontSize={fs} fontFamily="monospace" fontStyle="bold"
      fill={color} listening={false} />,
  ];
}

/* ===== 1 本の寸法線 (主線 + 目盛り + 各 span ラベル + 合計ラベル) ===== */
function renderDimLine(
  k: string, isH: boolean, axis: number,
  innerDir: number,           // ラベル配置方向 (+1 = 内側、-1 = 外側)
  spans: Span[],
  showInner: boolean,         // 複数 span のとき各 span ラベルを表示
  totalMm: number,
  fs: number,
  color: string,
): React.ReactElement[] {
  if (!spans.length) return [];
  const els: React.ReactElement[] = [];
  const lineS = spans[0].s;
  const lineE = spans[spans.length - 1].e;

  // 主線
  els.push(
    <Line key={`${k}L`}
      points={isH ? [lineS, axis, lineE, axis] : [axis, lineS, axis, lineE]}
      stroke={color} strokeWidth={LW} listening={false} />,
  );

  // 目盛り (両端 + showInner 時は全 span 境界)
  const tickSet = new Set<number>();
  tickSet.add(lineS); tickSet.add(lineE);
  if (showInner) {
    for (const sp of spans) { tickSet.add(sp.s); tickSet.add(sp.e); }
  }
  let ti = 0;
  for (const px of Array.from(tickSet)) {
    els.push(
      <Line key={`${k}t${ti++}`}
        points={isH
          ? [px, axis, px, axis + innerDir * TICK_LEN]
          : [axis, px, axis + innerDir * TICK_LEN, px]}
        stroke={color} strokeWidth={LW} listening={false} />,
    );
  }

  // 内側スパンラベル (建物寄り)
  if (showInner) {
    spans.forEach((sp, i) => {
      if (sp.mm <= 0) return;
      const mid = (sp.s + sp.e) / 2;
      const off = innerDir * (TICK_LEN + fs / 2 + 4);
      els.push(...renderLabel(
        isH ? mid : axis + off,
        isH ? axis + off : mid,
        `${sp.mm}`, fs, `${k}i${i}`, color,
      ));
    });
  }

  // 外側合計ラベル (建物から遠い側)
  const mid = (lineS + lineE) / 2;
  const outerOff = -innerDir * (TICK_LEN + fs / 2 + 4);
  els.push(...renderLabel(
    isH ? mid : axis + outerOff,
    isH ? axis + outerOff : mid,
    `${totalMm}`, fs, `${k}O`, color,
  ));

  return els;
}

/* ===== 屋根の出幅区間 (Phase J-3-fix: 各辺ごとに差分を取る)
   X 軸投影で差分計算すると L 字 AB 角の屋根が消える (段差で Y 座標が違う
   屋根と本体が X 範囲で重なって誤判定される) ため、元の建物の各辺と
   対応する屋根輪郭の辺を 1 対 1 で比較し、各辺ローカルで差分を取る。 */
function getOverhangRangesPerEdge(
  buildingPts: Point[],
  overhangs: number[],
  targetFace: Face,
): { from: number; to: number }[] {
  const n = buildingPts.length;
  if (n < 3) return [];
  const roofPoly = computeOffsetPolygon(buildingPts, overhangs);

  // 巻き方向 (符号付き面積)
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2 += buildingPts[i].x * buildingPts[j].y - buildingPts[j].x * buildingPts[i].y;
  }
  const ws = area2 > 0 ? 1 : -1;

  const result: { from: number; to: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = buildingPts[i];
    const p2 = buildingPts[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const nx = ws * dy;
    const ny = -ws * dx;
    let face: Face;
    if (Math.abs(ny) >= Math.abs(nx)) face = ny < 0 ? 'north' : 'south';
    else face = nx > 0 ? 'east' : 'west';
    if (face !== targetFace) continue;

    const rp1 = roofPoly[i];
    const rp2 = roofPoly[(i + 1) % n];
    const isH = face === 'north' || face === 'south';
    const bodyFrom = isH ? Math.min(p1.x, p2.x) : Math.min(p1.y, p2.y);
    const bodyTo = isH ? Math.max(p1.x, p2.x) : Math.max(p1.y, p2.y);
    const roofFrom = isH ? Math.min(rp1.x, rp2.x) : Math.min(rp1.y, rp2.y);
    const roofTo = isH ? Math.max(rp1.x, rp2.x) : Math.max(rp1.y, rp2.y);

    // この辺の屋根 - 本体 = 左右両端の出幅
    if (roofFrom < bodyFrom) result.push({ from: roofFrom, to: bodyFrom });
    if (roofTo > bodyTo) result.push({ from: bodyTo, to: roofTo });
  }
  result.sort((a, b) => a.from - b.from);
  return result;
}

/* ===== 屋根の出幅寸法線
   主線は屋根輪郭の最左端〜最右端で連続。
   目盛りは差分 span の境界 (= 凸角位置)。
   内側ラベルは差分 span の中央に出幅 mm (例: 600)。
   本体区間 (差分外) はラベルなし、目盛りなし。
   外側合計は屋根全長 (= 主線長)。 */
function renderOverhangLine(
  k: string, isH: boolean, axis: number,
  innerDir: number,
  spans: Span[],          // 屋根の出幅区間のみ (差分後)
  lineStart: number,      // 主線始点 (= 屋根輪郭の最左端)
  lineEnd: number,        // 主線終点 (= 屋根輪郭の最右端)
  totalMm: number,        // 上ラベル (= 主線長)
  fs: number,
  color: string,
): React.ReactElement[] {
  if (!spans.length) return [];
  const els: React.ReactElement[] = [];

  // 主線 (屋根の最左端〜最右端、連続)
  els.push(
    <Line key={`${k}L`}
      points={isH ? [lineStart, axis, lineEnd, axis] : [axis, lineStart, axis, lineEnd]}
      stroke={color} strokeWidth={LW} listening={false} />,
  );

  // 目盛り (差分 span の境界 = 凸角位置のみ)
  const tickSet = new Set<number>();
  tickSet.add(lineStart); tickSet.add(lineEnd);
  for (const sp of spans) { tickSet.add(sp.s); tickSet.add(sp.e); }
  let ti = 0;
  for (const px of Array.from(tickSet)) {
    els.push(
      <Line key={`${k}t${ti++}`}
        points={isH
          ? [px, axis, px, axis + innerDir * TICK_LEN]
          : [axis, px, axis + innerDir * TICK_LEN, px]}
        stroke={color} strokeWidth={LW} listening={false} />,
    );
  }

  // 内側ラベル: 各差分 span の中央に出幅 mm
  spans.forEach((sp, i) => {
    if (sp.mm <= 0) return;
    const mid = (sp.s + sp.e) / 2;
    const off = innerDir * (TICK_LEN + fs / 2 + 4);
    els.push(...renderLabel(
      isH ? mid : axis + off,
      isH ? axis + off : mid,
      `${sp.mm}`, fs, `${k}i${i}`, color,
    ));
  });

  // 外側合計ラベル: 屋根全長
  const mid = (lineStart + lineEnd) / 2;
  const outerOff = -innerDir * (TICK_LEN + fs / 2 + 4);
  els.push(...renderLabel(
    isH ? mid : axis + outerOff,
    isH ? axis + outerOff : mid,
    `${totalMm}`, fs, `${k}O`, color,
  ));

  return els;
}

/* ===== ポリゴンから方位別 face 辺を抽出 (face='north' なら法線が画面上向きの辺) ===== */
function getFaceEdges(pts: Point[]): Record<Face, { from: number; to: number }[]> {
  const result: Record<Face, { from: number; to: number }[]> = {
    north: [], south: [], east: [], west: [],
  };
  if (pts.length < 3) return result;

  // 巻き方向 (符号付き面積で判定、画面座標 Y 下向き)
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const ws = area2 > 0 ? 1 : -1;

  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    // 外向き法線
    const nx = ws * dy;
    const ny = -ws * dx;
    let face: Face;
    if (Math.abs(ny) >= Math.abs(nx)) face = ny < 0 ? 'north' : 'south';
    else face = nx > 0 ? 'east' : 'west';

    if (face === 'north' || face === 'south') {
      const from = Math.min(p1.x, p2.x);
      const to = Math.max(p1.x, p2.x);
      if (to > from) result[face].push({ from, to });
    } else {
      const from = Math.min(p1.y, p2.y);
      const to = Math.max(p1.y, p2.y);
      if (to > from) result[face].push({ from, to });
    }
  }

  for (const f of ['north', 'south', 'east', 'west'] as Face[]) {
    result[f].sort((a, b) => a.from - b.from);
  }
  return result;
}

/* ===== 足場線用: 該当 floor の手摺を方位別に分類
   旧ロジック踏襲 = 「手摺端点が手摺 BBox の方位端と一致する」もののみ抽出。
   L 字内角の手摺など外周にない手摺は除外される (旧仕様通り)。
   各手摺 1 本 = 1 span として、長さがそのまま表示される。 */
function getFloorScaffoldEdges(
  handrails: Handrail[],
): { byFace: Record<Face, { from: number; to: number }[]>; bb: BB } {
  const byFace: Record<Face, { from: number; to: number }[]> = {
    north: [], south: [], east: [], west: [],
  };
  let bb = bb0();
  if (handrails.length === 0) return { byFace, bb };

  // 手摺 BBox 計算
  for (const h of handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    bb = bbG(bb, p1.x, p1.y);
    bb = bbG(bb, p2.x, p2.y);
  }
  if (!bbOk(bb)) return { byFace, bb };

  const TOL = 0.01;
  for (const h of handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    // 北面: 両端点 Y == bb.minY
    if (Math.abs(p1.y - bb.minY) < TOL && Math.abs(p2.y - bb.minY) < TOL) {
      const from = Math.min(p1.x, p2.x);
      const to = Math.max(p1.x, p2.x);
      if (to > from) byFace.north.push({ from, to });
    }
    // 南面: 両端点 Y == bb.maxY
    if (Math.abs(p1.y - bb.maxY) < TOL && Math.abs(p2.y - bb.maxY) < TOL) {
      const from = Math.min(p1.x, p2.x);
      const to = Math.max(p1.x, p2.x);
      if (to > from) byFace.south.push({ from, to });
    }
    // 西面: 両端点 X == bb.minX
    if (Math.abs(p1.x - bb.minX) < TOL && Math.abs(p2.x - bb.minX) < TOL) {
      const from = Math.min(p1.y, p2.y);
      const to = Math.max(p1.y, p2.y);
      if (to > from) byFace.west.push({ from, to });
    }
    // 東面: 両端点 X == bb.maxX
    if (Math.abs(p1.x - bb.maxX) < TOL && Math.abs(p2.x - bb.maxX) < TOL) {
      const from = Math.min(p1.y, p2.y);
      const to = Math.max(p1.y, p2.y);
      if (to > from) byFace.east.push({ from, to });
    }
  }
  for (const f of ['north', 'south', 'east', 'west'] as Face[]) {
    byFace[f].sort((a, b) => a.from - b.from);
  }
  return { byFace, bb };
}

/* ===== 全 floor + 屋根輪郭 + 手摺の合算 BBox (axis refPx 用) ===== */
function getOverallBB(buildings: BuildingShape[], handrails: Handrail[]): BB {
  let bb = bb0();
  for (const b of buildings) {
    for (const p of b.points) bb = bbG(bb, p.x, p.y);
    if (b.roof && b.roof.roofType !== 'none') {
      const ohs = getEdgeOverhangs(b, b.roof);
      const roofPts = computeOffsetPolygon(b.points, ohs);
      for (const p of roofPts) bb = bbG(bb, p.x, p.y);
    }
  }
  for (const h of handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    bb = bbG(bb, p1.x, p1.y);
    bb = bbG(bb, p2.x, p2.y);
  }
  return bb;
}

/* ================================================================
   メインコンポーネント
   ================================================================ */
export default function DimensionLineLayer({ visible = true }: { visible?: boolean }) {
  const { canvasData, zoom, panX, panY } = useCanvasStore();
  // Phase J-5: 段別表示 ON/OFF (DB 連動)
  const dimensionVisibility = useHandrailSettingsStore(s => s.dimensionVisibility);
  const gridPx = INITIAL_GRID_PX * zoom;

  const elements = useMemo(() => {
    if (!visible || !canvasData.buildings.length) return [];

    const fs = Math.max(9, FONT_BASE * Math.min(zoom, 1.5));
    const els: React.ReactElement[] = [];
    const gx = (g: number) => g * gridPx + panX;
    const gy = (g: number) => g * gridPx + panY;

    // refPx は全建物 + 屋根輪郭 + 手摺の合算 BBox の方位端
    const overallBB = getOverallBB(canvasData.buildings, canvasData.handrails);
    if (!bbOk(overallBB)) return [];

    // bothmode 判定 (1F と 2F の両方に建物がある)
    const has1FBuilding = canvasData.buildings.some(b => (b.floor ?? 1) === 1);
    const has2FBuilding = canvasData.buildings.some(b => b.floor === 2);
    const isBothmode = has1FBuilding && has2FBuilding;

    // axis オフセット (bothmode で 6 段並ぶときラベル重なり回避のため広め)
    const offsets = isBothmode
      ? {
          wall1F: OFF_WALL_1F_BOTH, roof1F: OFF_ROOF_1F_BOTH,
          wall2F: OFF_WALL_2F_BOTH, roof2F: OFF_ROOF_2F_BOTH,
          scaffold1F: OFF_SCAFFOLD_1F_BOTH, scaffold2F: OFF_SCAFFOLD_2F_BOTH,
        }
      : {
          wall1F: OFF_WALL_SOLO, roof1F: OFF_ROOF_SOLO,
          wall2F: OFF_WALL_SOLO, roof2F: OFF_ROOF_SOLO,
          scaffold1F: OFF_SCAFFOLD_SOLO, scaffold2F: OFF_SCAFFOLD_SOLO,
        };

    // floor 別の描画パラメータ
    const floors: Array<{
      floor: 1 | 2; offWall: number; offRoof: number; offScaffold: number; color: string;
    }> = [
      { floor: 1, offWall: offsets.wall1F, offRoof: offsets.roof1F, offScaffold: offsets.scaffold1F, color: COLOR_1F },
      { floor: 2, offWall: offsets.wall2F, offRoof: offsets.roof2F, offScaffold: offsets.scaffold2F, color: COLOR_2F },
    ];

    for (const { floor, offWall, offRoof, offScaffold, color } of floors) {
      const floorBuildings = canvasData.buildings.filter(b => (b.floor ?? 1) === floor);
      if (floorBuildings.length === 0) continue;
      const floorHandrails = canvasData.handrails.filter(h => (h.floor ?? 1) === floor);

      // 該当 floor の本体辺・屋根輪郭辺を方位別に集約
      const wallEdges: Record<Face, { from: number; to: number }[]> = {
        north: [], south: [], east: [], west: [],
      };
      const roofEdges: Record<Face, { from: number; to: number }[]> = {
        north: [], south: [], east: [], west: [],
      };
      // Phase J-3-fix: 各辺ごとの屋根の出幅区間 (X 投影差分の誤判定回避)
      const overhangEdges: Record<Face, { from: number; to: number }[]> = {
        north: [], south: [], east: [], west: [],
      };

      for (const b of floorBuildings) {
        const bodyEdges = getFaceEdges(b.points);
        for (const f of ['north', 'south', 'east', 'west'] as Face[]) {
          wallEdges[f].push(...bodyEdges[f]);
        }
        if (b.roof && b.roof.roofType !== 'none') {
          const ohs = getEdgeOverhangs(b, b.roof);
          const roofPts = computeOffsetPolygon(b.points, ohs);
          const rEdges = getFaceEdges(roofPts);
          for (const f of ['north', 'south', 'east', 'west'] as Face[]) {
            roofEdges[f].push(...rEdges[f]);
            // 各辺ごとに屋根 - 本体の差分 (L 字 AB 角等を正しく検出)
            overhangEdges[f].push(...getOverhangRangesPerEdge(b.points, ohs, f));
          }
        }
      }

      for (const f of ['north', 'south', 'east', 'west'] as Face[]) {
        wallEdges[f].sort((a, b) => a.from - b.from);
        roofEdges[f].sort((a, b) => a.from - b.from);
        overhangEdges[f].sort((a, b) => a.from - b.from);
      }

      // Phase J-4: 該当 floor の足場 (= 手摺) を方位別に集約
      const scaffoldData = getFloorScaffoldEdges(floorHandrails);

      // 各方位で 3 段描画 (足場 → 外壁 → 屋根、外向きに)
      for (const face of ['north', 'south', 'east', 'west'] as Face[]) {
        const isH = face === 'north' || face === 'south';
        const sign = (face === 'north' || face === 'west') ? -1 : 1;
        // ラベル配置: 内側 (建物寄り) = sign の逆方向
        const innerDir = -sign;

        const refGrid = isH
          ? (face === 'north' ? overallBB.minY : overallBB.maxY)
          : (face === 'west' ? overallBB.minX : overallBB.maxX);
        const refPx = isH ? gy(refGrid) : gx(refGrid);

        // 段 (足場): 該当 floor の手摺を直列寸法
        const scaffoldVisKey = floor === 1 ? 'scaffold1F' : 'scaffold2F';
        const scfEdges = scaffoldData.byFace[face];
        if (dimensionVisibility[scaffoldVisKey] && scfEdges.length > 0) {
          const axisScaffold = refPx + sign * offScaffold;
          const spans: Span[] = scfEdges.map(e => ({
            s: isH ? gx(e.from) : gy(e.from),
            e: isH ? gx(e.to) : gy(e.to),
            mm: Math.round(gridToMm(e.to - e.from)),
          }));
          const total = spans.reduce((sum, sp) => sum + sp.mm, 0);
          els.push(...renderDimLine(
            `D${floor}S${face}`, isH, axisScaffold, innerDir, spans,
            spans.length > 1, total, fs, color,
          ));
        }

        // 段 (外壁): 本体辺
        const wallVisKey = floor === 1 ? 'wall1F' : 'wall2F';
        const wEdges = wallEdges[face];
        if (dimensionVisibility[wallVisKey] && wEdges.length > 0) {
          const axisWall = refPx + sign * offWall;
          const spans: Span[] = wEdges.map(e => ({
            s: isH ? gx(e.from) : gy(e.from),
            e: isH ? gx(e.to) : gy(e.to),
            mm: Math.round(gridToMm(e.to - e.from)),
          }));
          const total = spans.reduce((sum, sp) => sum + sp.mm, 0);
          els.push(...renderDimLine(
            `D${floor}I${face}`, isH, axisWall, innerDir, spans,
            spans.length > 1, total, fs, color,
          ));
        }

        // 外側の段: 屋根の出幅 (Phase J-3-fix: 各辺ごとの差分を使用)
        // overhangEdges = 元の建物の各辺と対応する屋根輪郭の辺を 1 対 1 で比較した差分。
        // 主線範囲は roofEdges (屋根輪郭の face 別 X 範囲の最小〜最大) で決定。
        const roofVisKey = floor === 1 ? 'roof1F' : 'roof2F';
        const rEdges = roofEdges[face];
        const ovEdges = overhangEdges[face];
        if (dimensionVisibility[roofVisKey] && rEdges.length > 0 && ovEdges.length > 0) {
          const axisOuter = refPx + sign * offRoof;
          const lineStartGrid = Math.min(...rEdges.map(r => r.from));
          const lineEndGrid = Math.max(...rEdges.map(r => r.to));
          const lineStartPx = isH ? gx(lineStartGrid) : gy(lineStartGrid);
          const lineEndPx = isH ? gx(lineEndGrid) : gy(lineEndGrid);
          const totalMm = Math.round(gridToMm(lineEndGrid - lineStartGrid));
          const overhangSpans: Span[] = ovEdges.map(o => ({
            s: isH ? gx(o.from) : gy(o.from),
            e: isH ? gx(o.to) : gy(o.to),
            mm: Math.round(gridToMm(o.to - o.from)),
          }));
          els.push(...renderOverhangLine(
            `D${floor}O${face}`, isH, axisOuter, innerDir,
            overhangSpans, lineStartPx, lineEndPx, totalMm, fs, color,
          ));
        }
      }
    }

    return els;
  }, [canvasData, zoom, panX, panY, gridPx, visible]);

  if (!visible || !elements.length) return <Layer listening={false} />;
  return <Layer listening={false}>{elements}</Layer>;
}
