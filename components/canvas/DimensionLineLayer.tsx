'use client';

import React, { useMemo } from 'react';
import { Layer, Line, Rect, Text } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX, gridToMm, mmToGrid } from '@/lib/konva/gridUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';

/* ===== スタイル定数 ===== */
const CLR = '#444';
const TXT = '#111';
const BG_FILL = '#ffffff';
const BG_OPACITY = 0.92;
const LW = 1;
const TICK_LEN = 6;          // 目盛り線の長さ (px)
const FONT_BASE = 11;
const PAD_X = 3;
const PAD_Y = 2;

/* ── レイヤーオフセット（外側BBからの距離 px）── */
const OFF_SCAFFOLD = 50;     // 1) 足場（最内側）
const OFF_WALL     = 90;     // 2) 外壁
const OFF_ROOF     = 130;    // 3) 屋根出幅（最外側）

const EDGE_TOL = 2;          // 手摺が辺上にあるか判定するグリッド許容差

/* ===== 型 ===== */
type Face = 'north' | 'south' | 'east' | 'west';
type BB = { minX: number; minY: number; maxX: number; maxY: number };
type Span = { s: number; e: number; mm: number };   // s/e はスクリーン px

/* ===== BB ヘルパー ===== */
const bb0  = (): BB => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
const bbG  = (b: BB, x: number, y: number): BB => ({
  minX: Math.min(b.minX, x), minY: Math.min(b.minY, y),
  maxX: Math.max(b.maxX, x), maxY: Math.max(b.maxY, y),
});
const bbOk = (b: BB) => b.minX < b.maxX && b.minY < b.maxY;
const bbM  = (a: BB, b: BB): BB => {
  if (!bbOk(a)) return b; if (!bbOk(b)) return a;
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
};

/* ===== ラベル描画（白背景 + 黒文字） ===== */
function renderLabel(
  cx: number, cy: number, text: string, fs: number, k: string,
): React.ReactElement[] {
  const w = text.length * fs * 0.6 + PAD_X * 2;
  const h = fs + PAD_Y * 2;
  return [
    <Rect key={`${k}B`} x={cx - w / 2} y={cy - h / 2}
      width={w} height={h} fill={BG_FILL} opacity={BG_OPACITY}
      cornerRadius={2} listening={false} />,
    <Text key={`${k}T`} x={cx - w / 2 + PAD_X} y={cy - fs / 2}
      text={text} fontSize={fs} fontFamily="monospace" fontStyle="bold"
      fill={TXT} listening={false} />,
  ];
}

/* ================================================================
   1本の寸法線を描画
   ─ 1本の主線 + 目盛り線
   ─ 内側（建物寄り）に各スパンラベル（showInner 時）
   ─ 外側に合計ラベル
   ================================================================ */
function renderDimLine(
  k: string, isH: boolean, axis: number,
  /** 建物方向 = 内側 (+1 or -1) */
  innerDir: number,
  spans: Span[],
  showInner: boolean,
  totalMm: number,
  fs: number,
): React.ReactElement[] {
  if (!spans.length) return [];
  const els: React.ReactElement[] = [];
  const lineS = spans[0].s;
  const lineE = spans[spans.length - 1].e;

  /* ── 主線 ── */
  els.push(
    <Line key={`${k}L`}
      points={isH ? [lineS, axis, lineE, axis] : [axis, lineS, axis, lineE]}
      stroke={CLR} strokeWidth={LW} listening={false} />,
  );

  /* ── 目盛り線（全スパン境界） ── */
  const tickSet = new Set<number>();
  tickSet.add(lineS); tickSet.add(lineE);
  if (showInner) {
    for (const sp of spans) { tickSet.add(sp.s); tickSet.add(sp.e); }
  }
  const ticks = Array.from(tickSet);
  let ti = 0;
  for (const px of ticks) {
    els.push(
      <Line key={`${k}t${ti++}`}
        points={isH
          ? [px, axis - TICK_LEN, px, axis + TICK_LEN]
          : [axis - TICK_LEN, px, axis + TICK_LEN, px]}
        stroke={CLR} strokeWidth={LW} listening={false} />,
    );
  }

  /* ── 内側スパンラベル ── */
  if (showInner) {
    spans.forEach((sp, i) => {
      if (sp.mm <= 0) return;
      const mid = (sp.s + sp.e) / 2;
      const off = innerDir * (TICK_LEN + fs / 2 + 4);
      els.push(...renderLabel(
        isH ? mid : axis + off,
        isH ? axis + off : mid,
        `${sp.mm}`, fs, `${k}i${i}`,
      ));
    });
  }

  /* ── 外側合計ラベル ── */
  const mid = (lineS + lineE) / 2;
  const outerOff = -innerDir * (TICK_LEN + fs / 2 + 4);
  els.push(...renderLabel(
    isH ? mid : axis + outerOff,
    isH ? axis + outerOff : mid,
    `${totalMm}`, fs, `${k}O`,
  ));

  return els;
}

/* ================================================================
   メインコンポーネント
   ================================================================ */
export default function DimensionLineLayer({ visible = true }: { visible?: boolean }) {
  const { canvasData, zoom, panX, panY } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;

  const elements = useMemo(() => {
    if (!visible || !canvasData.buildings.length) return [];

    const fs = Math.max(9, FONT_BASE * Math.min(zoom, 1.5));
    const els: React.ReactElement[] = [];
    const gx = (g: number) => g * gridPx + panX;
    const gy = (g: number) => g * gridPx + panY;

    /* ===== バウンディングボックス ===== */

    // 建物 BB
    let bldBB = bb0();
    for (const b of canvasData.buildings)
      for (const p of b.points) bldBB = bbG(bldBB, p.x, p.y);
    if (!bbOk(bldBB)) return [];

    // 足場 BB（手摺 + アンチ）
    let scfBB = bb0();
    for (const h of canvasData.handrails) {
      const [p1, p2] = getHandrailEndpoints(h);
      scfBB = bbG(scfBB, p1.x, p1.y);
      scfBB = bbG(scfBB, p2.x, p2.y);
    }
    for (const a of canvasData.antis) {
      const lg = mmToGrid(a.lengthMm);
      scfBB = bbG(scfBB, a.x, a.y);
      if (a.direction === 'horizontal')
        scfBB = bbG(scfBB, a.x + lg, a.y + mmToGrid(a.width));
      else
        scfBB = bbG(scfBB, a.x + mmToGrid(a.width), a.y + lg);
    }

    // 屋根出幅 (mm) を方位別に取得 & 屋根 BB
    let roofBB = bb0();
    const roofMm: Record<Face, number> = { north: 0, south: 0, east: 0, west: 0 };
    for (const b of canvasData.buildings) {
      const cfg = b.roof;
      if (!cfg || cfg.roofType === 'none') continue;
      let bb = bb0();
      for (const p of b.points) bb = bbG(bb, p.x, p.y);
      if (!bbOk(bb)) continue;

      let n = cfg.northMm ?? cfg.uniformMm;
      let s = cfg.southMm ?? cfg.uniformMm;
      let e = cfg.eastMm  ?? cfg.uniformMm;
      let w = cfg.westMm  ?? cfg.uniformMm;
      for (const oh of canvasData.roofOverhangs.filter(o => o.buildingId === b.id)) {
        if (oh.faceIndex === 0) n = oh.overhangMm;
        else if (oh.faceIndex === 1) e = oh.overhangMm;
        else if (oh.faceIndex === 2) s = oh.overhangMm;
        else if (oh.faceIndex === 3) w = oh.overhangMm;
      }
      roofMm.north = n; roofMm.south = s; roofMm.east = e; roofMm.west = w;
      roofBB = bbG(roofBB, bb.minX - mmToGrid(w), bb.minY - mmToGrid(n));
      roofBB = bbG(roofBB, bb.maxX + mmToGrid(e), bb.maxY + mmToGrid(s));
      break; // 最初の屋根付き建物のみ
    }

    // 全体を包む外側 BB（オフセットの基準）
    let outerBB = bldBB;
    if (bbOk(scfBB)) outerBB = bbM(outerBB, scfBB);
    if (bbOk(roofBB)) outerBB = bbM(outerBB, roofBB);

    /* ===== 建物ポリゴン辺を方位別に分類 ===== */
    const wallEdges: Record<Face, { from: number; to: number }[]> = {
      north: [], south: [], east: [], west: [],
    };
    for (const b of canvasData.buildings) {
      const pts = b.points;
      if (pts.length < 3) continue;
      // 符号付き面積 → 巻き方向
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
          const to   = Math.max(p1.x, p2.x);
          if (to > from) wallEdges[face].push({ from, to });
        } else {
          const from = Math.min(p1.y, p2.y);
          const to   = Math.max(p1.y, p2.y);
          if (to > from) wallEdges[face].push({ from, to });
        }
      }
    }
    for (const f of ['north', 'south', 'east', 'west'] as Face[])
      wallEdges[f].sort((a, b) => a.from - b.from);

    /* ===== 方位ごとに3レイヤーを描画 ===== */
    for (const face of ['north', 'south', 'east', 'west'] as Face[]) {
      const isH  = face === 'north' || face === 'south';
      const sign = (face === 'north' || face === 'west') ? -1 : 1;
      // innerDir: 寸法線から建物方向 = sign の逆
      const innerDir = -sign;

      // 基準辺（外側 BB 端）
      const refGrid = isH
        ? (face === 'north' ? outerBB.minY : outerBB.maxY)
        : (face === 'west'  ? outerBB.minX : outerBB.maxX);
      const refPx = isH ? gy(refGrid) : gx(refGrid);

      /* ── レイヤー1: 足場寸法線 ── */
      if (bbOk(scfBB)) {
        const axis = refPx + sign * OFF_SCAFFOLD;
        const edgeGrid = isH
          ? (face === 'north' ? scfBB.minY : scfBB.maxY)
          : (face === 'west'  ? scfBB.minX : scfBB.maxX);

        // 該当面の手摺端点を収集
        const breaks: number[] = [];
        for (const h of canvasData.handrails) {
          const [p1, p2] = getHandrailEndpoints(h);
          if (isH) {
            if (Math.abs(p1.y - edgeGrid) < EDGE_TOL && Math.abs(p2.y - edgeGrid) < EDGE_TOL)
              breaks.push(p1.x, p2.x);
          } else {
            if (Math.abs(p1.x - edgeGrid) < EDGE_TOL && Math.abs(p2.x - edgeGrid) < EDGE_TOL)
              breaks.push(p1.y, p2.y);
          }
        }
        // フォールバック
        if (breaks.length < 2) {
          breaks.push(isH ? scfBB.minX : scfBB.minY, isH ? scfBB.maxX : scfBB.maxY);
        }

        const uniq = Array.from(new Set(breaks)).sort((a, b) => a - b);
        const spans: Span[] = [];
        for (let i = 0; i < uniq.length - 1; i++) {
          const mm = Math.round(gridToMm(uniq[i + 1] - uniq[i]));
          if (mm > 0) spans.push({
            s: isH ? gx(uniq[i]) : gy(uniq[i]),
            e: isH ? gx(uniq[i + 1]) : gy(uniq[i + 1]),
            mm,
          });
        }

        if (spans.length > 0) {
          const total = spans.reduce((sum, sp) => sum + sp.mm, 0);
          els.push(...renderDimLine(
            `S${face}`, isH, axis, innerDir, spans,
            spans.length > 1, // 複数スパンなら内側目盛り表示
            total, fs,
          ));
        }
      }

      /* ── レイヤー2: 外壁寸法線 ── */
      const edges = wallEdges[face];
      if (edges.length > 0) {
        const axis = refPx + sign * OFF_WALL;
        const spans: Span[] = edges.map(e => ({
          s:  isH ? gx(e.from) : gy(e.from),
          e:  isH ? gx(e.to)   : gy(e.to),
          mm: Math.round(gridToMm(e.to - e.from)),
        }));
        const total = spans.reduce((sum, sp) => sum + sp.mm, 0);
        els.push(...renderDimLine(
          `W${face}`, isH, axis, innerDir, spans,
          spans.length > 1, // 単独辺なら外側合計のみ
          total, fs,
        ));
      }

      /* ── レイヤー3: 屋根出幅（外壁寸法線と同じ axis に左右翼として描画） ── */
      if (roofMm[face] > 0) {
        const overhangPx = mmToGrid(roofMm[face]) * gridPx;
        const axis = refPx + sign * OFF_WALL;  // 外壁寸法線と同じ高さに揃える
        const edges = wallEdges[face];
        for (let ei = 0; ei < edges.length; ei++) {
          const edge = edges[ei];
          const edgeStartPx = isH ? gx(edge.from) : gy(edge.from);
          const edgeEndPx = isH ? gx(edge.to) : gy(edge.to);

          // 左翼（軸方向の小さい側、外向きに overhangPx 伸びる）
          els.push(...renderDimLine(
            `RL${face}-${ei}`, isH, axis, innerDir,
            [{ s: edgeStartPx - overhangPx, e: edgeStartPx, mm: roofMm[face] }],
            false, roofMm[face], fs,
          ));

          // 右翼（軸方向の大きい側、外向きに overhangPx 伸びる）
          els.push(...renderDimLine(
            `RR${face}-${ei}`, isH, axis, innerDir,
            [{ s: edgeEndPx, e: edgeEndPx + overhangPx, mm: roofMm[face] }],
            false, roofMm[face], fs,
          ));
        }
      }
    }

    return els;
  }, [canvasData, zoom, panX, panY, gridPx, visible]);

  if (!visible || !elements.length) return <Layer listening={false} />;
  return <Layer listening={false}>{elements}</Layer>;
}
