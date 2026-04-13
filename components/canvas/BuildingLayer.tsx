'use client';

import React from 'react';
import { Layer, Line } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX, mmToGrid } from '@/lib/konva/gridUtils';
import { BuildingShape, RoofConfig, Point } from '@/types';

/** ポリゴンの巻き方向判定。true = 時計回り（画面座標系 Y下向き） */
function isClockwise(pts: Point[]): boolean {
  // Shoelace: Σ(x_i * y_{i+1} - x_{i+1} * y_i)
  // 数学座標系(Y上向き): 正=CCW, 負=CW
  // 画面座標系(Y下向き): Y軸反転のため 正=CW, 負=CCW
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return sum > 0;
}

/** 各辺の出幅(グリッド)を計算。出幅0の辺も含めて全辺分返す */
function getEdgeOverhangs(building: BuildingShape, roof: RoofConfig): number[] {
  const pts = building.points;
  const n = pts.length;
  const overhangs: number[] = new Array(n).fill(0);

  // 巻き方向で法線の符号を決定（凹凸ポリゴンでも正確）
  const cw = isClockwise(pts);

  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) continue;

    // 外向き法線（巻き方向に基づく確実な計算）
    // CW: outward = (dy/len, -dx/len)
    // CCW: outward = (-dy/len, dx/len)
    const nx = cw ? dy / len : -dy / len;
    const ny = cw ? -dx / len : dx / len;

    // 方位判定
    let face: 'north' | 'south' | 'east' | 'west';
    if (Math.abs(ny) > Math.abs(nx)) {
      face = ny < 0 ? 'north' : 'south';
    } else {
      face = nx > 0 ? 'east' : 'west';
    }

    // 出幅mm取得
    const getFaceMm = (): number => {
      if (roof.northMm !== null) {
        return { north: roof.northMm!, south: roof.southMm!, east: roof.eastMm!, west: roof.westMm! }[face];
      }
      return roof.uniformMm;
    };

    let mm = 0;
    if (roof.roofType === 'yosemune' || roof.roofType === 'kirizuma' || roof.roofType === 'katanagare') {
      mm = getFaceMm();
    }

    overhangs[i] = mm > 0 ? mmToGrid(mm) : 0;
  }

  return overhangs;
}

/** 各辺を法線方向にオフセットし、隣接辺の交点でコーナーを繋いだポリゴンを生成 */
function computeOffsetPolygon(pts: Point[], overhangs: number[]): Point[] {
  const n = pts.length;

  // 巻き方向で法線の符号を決定（凹凸ポリゴンでも正確）
  const cw = isClockwise(pts);
  const normals: { nx: number; ny: number }[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = cw ? dy / len : -dy / len;
    const ny = cw ? -dx / len : dx / len;
    normals.push({ nx, ny });
  }

  // 各辺をオフセット → オフセット辺を (a1, a2) のペアで保持
  const offsetEdges: { a1: Point; a2: Point }[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const off = overhangs[i];
    const { nx, ny } = normals[i];
    offsetEdges.push({
      a1: { x: p1.x + nx * off, y: p1.y + ny * off },
      a2: { x: p2.x + nx * off, y: p2.y + ny * off },
    });
  }

  // 隣接するオフセット辺の交点を計算してポリゴン頂点にする
  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const edgeA = offsetEdges[prev]; // 前の辺
    const edgeB = offsetEdges[i];    // 現在の辺

    const intersection = lineIntersection(edgeA.a1, edgeA.a2, edgeB.a1, edgeB.a2);
    if (intersection) {
      result.push(intersection);
    } else {
      // 平行な辺 → 現在の辺の始点をそのまま使う
      result.push(edgeB.a1);
    }
  }

  return result;
}

/** 2直線の交点 (無限延長) */
function lineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 0.0001) return null; // 平行
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  return { x: a1.x + t * dax, y: a1.y + t * day };
}

export default function BuildingLayer() {
  const { canvasData, zoom, panX, panY, mode, selectedIds } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;

  return (
    <Layer>
      {/* 屋根の出幅（オフセットポリゴンとして描画） */}
      {canvasData.buildings.map((building) => {
        if (!building.roof || building.roof.roofType === 'none') return null;
        const overhangs = getEdgeOverhangs(building, building.roof);
        // 出幅が全て0なら描画しない
        if (overhangs.every((o) => o === 0)) return null;

        const offsetPts = computeOffsetPolygon(building.points, overhangs);
        const flatPoints = offsetPts.flatMap((p) => [
          p.x * gridPx + panX,
          p.y * gridPx + panY,
        ]);

        return (
          <Line
            key={`roof-${building.id}`}
            points={flatPoints}
            closed
            stroke="#888780"
            strokeWidth={1}
            dash={[6, 4]}
            listening={false}
          />
        );
      })}

      {/* 旧式の roofOverhangs（後方互換） */}
      {canvasData.roofOverhangs.map((overhang) => {
        const building = canvasData.buildings.find((b) => b.id === overhang.buildingId);
        if (!building) return null;
        const pts = building.points;
        const i = overhang.faceIndex;
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return null;
        const nx = -dy / len;
        const ny = dx / len;
        const g = overhang.overhangMm / 10;

        return (
          <Line key={overhang.id}
            points={[
              (p1.x + nx * g) * gridPx + panX, (p1.y + ny * g) * gridPx + panY,
              (p2.x + nx * g) * gridPx + panX, (p2.y + ny * g) * gridPx + panY,
            ]}
            stroke="#888780" strokeWidth={1} dash={[6, 4]} listening={false}
          />
        );
      })}

      {/* 建物本体 */}
      {canvasData.buildings.map((building) => {
        const flatPoints = building.points.flatMap((p) => [
          p.x * gridPx + panX, p.y * gridPx + panY,
        ]);
        const isSelected = selectedIds.includes(building.id);

        return (
          <Line key={building.id} points={flatPoints} closed
            fill={building.fill}
            stroke={isSelected ? '#378ADD' : '#1a1a18'}
            strokeWidth={isSelected ? 3 : 2}
            listening={mode === 'select' || mode === 'erase'}
            id={building.id}
          />
        );
      })}

      {/* 屋根形状線（建物本体の上に描画、長方形のみ） */}
      {canvasData.buildings.map((building) => {
        if (!building.roof || building.roof.roofType === 'none') return null;
        const pts = building.points;
        const n = pts.length;
        if (n !== 4) return null;

        let cx = 0, cy = 0;
        for (const p of pts) { cx += p.x; cy += p.y; }
        cx /= n; cy /= n;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
        }

        // 出幅のグリッド単位オフセット
        const ovG = mmToGrid(building.roof.uniformMm || 0);

        const toScreen = (gx: number, gy: number) => [gx * gridPx + panX, gy * gridPx + panY];
        const roofType = building.roof.roofType;
        const roofDash = [6, 4];
        const S = { stroke: '#888780', strokeWidth: 1, dash: roofDash, opacity: 0.6, listening: false };

        if (roofType === 'yosemune') {
          // 重心から屋根出幅の4隅へ
          const corners = [
            { x: minX - ovG, y: minY - ovG }, { x: maxX + ovG, y: minY - ovG },
            { x: maxX + ovG, y: maxY + ovG }, { x: minX - ovG, y: maxY + ovG },
          ];
          return (
            <React.Fragment key={`yosemune-${building.id}`}>
              {corners.map((corner, i) => (
                <Line key={`yosemune-${building.id}-${i}`}
                  points={[...toScreen(cx, cy), ...toScreen(corner.x, corner.y)]}
                  {...S}
                />
              ))}
            </React.Fragment>
          );
        }

        if (roofType === 'kirizuma') {
          const gable = building.roof.kirizumaGableFace || 'ew';
          const lines: React.ReactElement[] = [];
          // 出幅の4隅座標
          const nw = { x: minX - ovG, y: minY - ovG };
          const ne = { x: maxX + ovG, y: minY - ovG };
          const se = { x: maxX + ovG, y: maxY + ovG };
          const sw = { x: minX - ovG, y: maxY + ovG };

          if (gable === 'ew') {
            const midY = (minY + maxY) / 2;
            // 棟線（東西方向）
            lines.push(
              <Line key={`ridge-${building.id}`}
                points={[...toScreen(minX, midY), ...toScreen(maxX, midY)]}
                {...S}
              />
            );
            // 西側妻面: NW隅→棟線西端、SW隅→棟線西端
            lines.push(
              <Line key={`gable-w-${building.id}`}
                points={[...toScreen(nw.x, nw.y), ...toScreen(minX, midY)]}
                {...S}
              />
            );
            lines.push(
              <Line key={`gable-w2-${building.id}`}
                points={[...toScreen(sw.x, sw.y), ...toScreen(minX, midY)]}
                {...S}
              />
            );
            // 東側妻面: NE隅→棟線東端、SE隅→棟線東端
            lines.push(
              <Line key={`gable-e-${building.id}`}
                points={[...toScreen(ne.x, ne.y), ...toScreen(maxX, midY)]}
                {...S}
              />
            );
            lines.push(
              <Line key={`gable-e2-${building.id}`}
                points={[...toScreen(se.x, se.y), ...toScreen(maxX, midY)]}
                {...S}
              />
            );
          } else {
            const midX = (minX + maxX) / 2;
            // 棟線（南北方向）
            lines.push(
              <Line key={`ridge-${building.id}`}
                points={[...toScreen(midX, minY), ...toScreen(midX, maxY)]}
                {...S}
              />
            );
            // 北側妻面: NW隅→棟線北端、NE隅→棟線北端
            lines.push(
              <Line key={`gable-n-${building.id}`}
                points={[...toScreen(nw.x, nw.y), ...toScreen(midX, minY)]}
                {...S}
              />
            );
            lines.push(
              <Line key={`gable-n2-${building.id}`}
                points={[...toScreen(ne.x, ne.y), ...toScreen(midX, minY)]}
                {...S}
              />
            );
            // 南側妻面: SW隅→棟線南端、SE隅→棟線南端
            lines.push(
              <Line key={`gable-s-${building.id}`}
                points={[...toScreen(sw.x, sw.y), ...toScreen(midX, maxY)]}
                {...S}
              />
            );
            lines.push(
              <Line key={`gable-s2-${building.id}`}
                points={[...toScreen(se.x, se.y), ...toScreen(midX, maxY)]}
                {...S}
              />
            );
          }
          return <React.Fragment key={`kirizuma-${building.id}`}>{lines}</React.Fragment>;
        }

        if (roofType === 'katanagare') {
          const dir = building.roof.katanagareDirection || 'south';
          const bw = maxX - minX;
          const bh = maxY - minY;
          const arrowLen = Math.min(bw, bh) * 0.35;
          const headLen = arrowLen * 0.3;

          const dirVec = dir === 'north' ? { x: 0, y: -1 }
            : dir === 'south' ? { x: 0, y: 1 }
            : dir === 'east' ? { x: 1, y: 0 }
            : { x: -1, y: 0 };

          const startX = cx - dirVec.x * arrowLen;
          const startY = cy - dirVec.y * arrowLen;
          const endX = cx + dirVec.x * arrowLen;
          const endY = cy + dirVec.y * arrowLen;

          const perpX = -dirVec.y;
          const perpY = dirVec.x;
          const headBaseX = endX - dirVec.x * headLen;
          const headBaseY = endY - dirVec.y * headLen;
          const head1X = headBaseX + perpX * headLen * 0.5;
          const head1Y = headBaseY + perpY * headLen * 0.5;
          const head2X = headBaseX - perpX * headLen * 0.5;
          const head2Y = headBaseY - perpY * headLen * 0.5;

          return (
            <React.Fragment key={`katanagare-${building.id}`}>
              <Line
                points={[...toScreen(startX, startY), ...toScreen(endX, endY)]}
                {...S}
              />
              <Line
                points={[...toScreen(head1X, head1Y), ...toScreen(endX, endY), ...toScreen(head2X, head2Y)]}
                {...S}
              />
            </React.Fragment>
          );
        }

        return null;
      })}
    </Layer>
  );
}
