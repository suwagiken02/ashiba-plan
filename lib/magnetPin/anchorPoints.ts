import { CanvasData } from '@/types';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import { computeOffsetPolygon, getEdgeOverhangs } from '@/lib/konva/roofUtils';

/** マグネットピンを立てる起点候補。 */
export type PinAnchor = {
  /** 安定したユニーク ID（"building-corner-{buildingId}-{i}" 等） */
  id: string;
  kind: 'buildingCorner' | 'handrailEnd' | 'roofCorner' | 'obstacleCorner';
  /** グリッド座標（既存オブジェクトと同じ単位） */
  x: number;
  y: number;
  /** 元オブジェクトの id（デバッグ・後続 Phase の参照履歴用） */
  refId?: string;
};

/**
 * canvasData から PinAnchor 候補を全て集める。
 * - 1F/2F のフィルタは行わない（ピンは全階共通方針）
 * - 重複頂点はそのまま残す（最近傍タップ判定で吸収する想定）
 * - 円形障害物 (custom_circle) はスキップ（既存 getAllExistingVertices と同方針）
 */
export function collectAnchorPoints(canvasData: CanvasData): PinAnchor[] {
  const anchors: PinAnchor[] = [];

  // 1. 建物角
  for (const b of canvasData.buildings) {
    b.points.forEach((p, i) => {
      anchors.push({
        id: `building-corner-${b.id}-${i}`,
        kind: 'buildingCorner',
        x: p.x,
        y: p.y,
        refId: b.id,
      });
    });

    // 3. 屋根角（出幅ありの場合のみ）
    if (b.roof && b.roof.roofType !== 'none') {
      const overhangs = getEdgeOverhangs(b, b.roof);
      const hasAnyOverhang = overhangs.some(o => o > 0);
      if (hasAnyOverhang) {
        const roofPts = computeOffsetPolygon(b.points, overhangs);
        roofPts.forEach((p, i) => {
          anchors.push({
            id: `roof-corner-${b.id}-${i}`,
            kind: 'roofCorner',
            x: p.x,
            y: p.y,
            refId: b.id,
          });
        });
      }
    }
  }

  // 2. 手摺端部
  for (const h of canvasData.handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    anchors.push({
      id: `handrail-end-${h.id}-start`,
      kind: 'handrailEnd',
      x: p1.x,
      y: p1.y,
      refId: h.id,
    });
    anchors.push({
      id: `handrail-end-${h.id}-end`,
      kind: 'handrailEnd',
      x: p2.x,
      y: p2.y,
      refId: h.id,
    });
  }

  // 4. 障害物の四隅（円はスキップ）
  for (const o of canvasData.obstacles) {
    if (o.type === 'custom_circle') continue;
    if (o.points) {
      o.points.forEach((p, i) => {
        anchors.push({
          id: `obstacle-corner-${o.id}-${i}`,
          kind: 'obstacleCorner',
          x: p.x,
          y: p.y,
          refId: o.id,
        });
      });
    } else {
      const corners = [
        { x: o.x, y: o.y },
        { x: o.x + o.width, y: o.y },
        { x: o.x + o.width, y: o.y + o.height },
        { x: o.x, y: o.y + o.height },
      ];
      corners.forEach((p, i) => {
        anchors.push({
          id: `obstacle-corner-${o.id}-${i}`,
          kind: 'obstacleCorner',
          x: p.x,
          y: p.y,
          refId: o.id,
        });
      });
    }
  }

  return anchors;
}
