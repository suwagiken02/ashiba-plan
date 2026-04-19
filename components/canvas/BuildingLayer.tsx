'use client';

import React from 'react';
import { Layer, Line } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX, mmToGrid } from '@/lib/konva/gridUtils';
import { Point } from '@/types';
import { getEdgeOverhangs, computeOffsetPolygon } from '@/lib/konva/roofUtils';

export default function BuildingLayer() {
  const { canvasData, zoom, panX, panY, mode, selectedIds, isDarkMode } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;

  return (
    <Layer>
      {/* 旧式の roofOverhangs（後方互換、最下層） */}
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
        const is2F = building.floor === 2;
        const fillColor = is2F ? '#A0A0A0' : (isDarkMode ? '#555555' : '#3d3d3a');
        const strokeColor = isSelected ? '#FF6B35' : (is2F ? '#888888' : (isDarkMode ? '#888888' : '#1a1a18'));

        return (
          <Line key={building.id} points={flatPoints} closed
            fill={fillColor}
            opacity={is2F ? 0.6 : 1}
            stroke={strokeColor}
            strokeWidth={isSelected ? 3 : 2}
            listening={mode === 'select' || mode === 'erase'}
            id={building.id}
          />
        );
      })}

      {/* 屋根の出幅（建物本体の上に描画） */}
      {canvasData.buildings.map((building) => {
        if (!building.roof || building.roof.roofType === 'none') return null;
        const overhangs = getEdgeOverhangs(building, building.roof);
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

      {/* 屋根形状線（最上層） */}
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
