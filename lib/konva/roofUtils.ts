import { mmToGrid } from './gridUtils';
import { BuildingShape, RoofConfig, Point } from '@/types';

/** ポリゴンの巻き方向判定。true = 時計回り（画面座標系 Y下向き） */
function isClockwise(pts: Point[]): boolean {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return sum > 0;
}

/** 各辺の出幅(グリッド)を計算。出幅0の辺も含めて全辺分返す */
export function getEdgeOverhangs(building: BuildingShape, roof: RoofConfig): number[] {
  const pts = building.points;
  const n = pts.length;
  const overhangs: number[] = new Array(n).fill(0);

  const cw = isClockwise(pts);

  for (let i = 0; i < n; i++) {
    // edgeOverhangsMmが設定されている場合は辺ごとの値を使用
    if (roof.edgeOverhangsMm && roof.edgeOverhangsMm[i] !== undefined) {
      overhangs[i] = roof.edgeOverhangsMm[i] > 0 ? mmToGrid(roof.edgeOverhangsMm[i]) : 0;
      continue;
    }

    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) continue;

    const nx = cw ? dy / len : -dy / len;
    const ny = cw ? -dx / len : dx / len;

    let face: 'north' | 'south' | 'east' | 'west';
    if (Math.abs(ny) > Math.abs(nx)) {
      face = ny < 0 ? 'north' : 'south';
    } else {
      face = nx > 0 ? 'east' : 'west';
    }

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

/** 2直線の交点 (無限延長) */
function lineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 0.0001) return null;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  return { x: a1.x + t * dax, y: a1.y + t * day };
}

/** 各辺を法線方向にオフセットし、隣接辺の交点でコーナーを繋いだポリゴンを生成 */
export function computeOffsetPolygon(pts: Point[], overhangs: number[]): Point[] {
  const n = pts.length;

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

  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const edgeA = offsetEdges[prev];
    const edgeB = offsetEdges[i];

    const intersection = lineIntersection(edgeA.a1, edgeA.a2, edgeB.a1, edgeB.a2);
    if (intersection) {
      result.push(intersection);
    } else {
      result.push(edgeB.a1);
    }
  }

  return result;
}
