import { BuildingShape, Point } from '@/types';
import { getEdgeOverhangs, computeOffsetPolygon } from '@/lib/konva/roofUtils';

/**
 * 建物の outline ポリゴンを取得する。
 * 屋根あり + 出幅 > 0 → computeOffsetPolygon (= 屋根破線)
 * それ以外 → building.points (= 建物外周)
 * どちらも辺数 n は同じため、 edgeIndex は両者で統一参照可能 (= Task #8 spec)。
 */
export function getOutlinePolygon(building: BuildingShape): Point[] {
  if (building.roof && building.roof.roofType !== 'none') {
    const overhangs = getEdgeOverhangs(building, building.roof);
    if (!overhangs.every((o) => o === 0)) {
      return computeOffsetPolygon(building.points, overhangs);
    }
  }
  return building.points;
}

/**
 * クリック点に最も近い建物 outline の辺を見つける。
 * 閾値内に辺があれば { buildingId, edgeIndex, t } を返す、 なければ null。
 */
export function findClosestOutlineEdge(
  clickGrid: Point,
  buildings: BuildingShape[],
  thresholdGrid: number,
): { buildingId: string; edgeIndex: number; t: number } | null {
  let bestDist = Infinity;
  let bestResult: { buildingId: string; edgeIndex: number; t: number } | null = null;
  for (const b of buildings) {
    const outline = getOutlinePolygon(b);
    for (let i = 0; i < outline.length; i++) {
      const p1 = outline[i];
      const p2 = outline[(i + 1) % outline.length];
      const ex = p2.x - p1.x;
      const ey = p2.y - p1.y;
      const len2 = ex * ex + ey * ey;
      if (len2 < 0.001) continue;
      const t = Math.max(0, Math.min(1, ((clickGrid.x - p1.x) * ex + (clickGrid.y - p1.y) * ey) / len2));
      const projX = p1.x + t * ex;
      const projY = p1.y + t * ey;
      const dist = Math.hypot(clickGrid.x - projX, clickGrid.y - projY);
      if (dist < bestDist && dist < thresholdGrid) {
        bestDist = dist;
        bestResult = { buildingId: b.id, edgeIndex: i, t };
      }
    }
  }
  return bestResult;
}
