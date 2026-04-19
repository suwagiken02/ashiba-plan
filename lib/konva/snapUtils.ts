import { Point, Handrail, HandrailLengthMm, Anti, BuildingShape, Obstacle } from '@/types';
import { mmToGrid, INITIAL_GRID_PX } from './gridUtils';

/** 最近傍の手摺端点へのスナップ */
export const snapToHandrailEnd = (
  pos: Point,
  handrails: Handrail[],
  snapRadiusGrid: number = 2
): Point | null => {
  let closest: Point | null = null;
  let minDist = Infinity;

  for (const h of handrails) {
    const endpoints = getHandrailEndpoints(h);
    for (const ep of endpoints) {
      const dist = Math.hypot(ep.x - pos.x, ep.y - pos.y);
      if (dist < minDist && dist <= snapRadiusGrid) {
        minDist = dist;
        closest = ep;
      }
    }
  }
  return closest;
};

/** スナップ（端点優先、線分は補助）
 *  手摺の端点 + アンチの4隅をスナップ候補とする
 *  1. 全候補点を snapRadiusGrid 以内で探す → 見つかれば即採用
 *  2. 候補点が無い場合のみ、手摺線分上の最近傍点を狭い範囲で探す
 */
export const snapToHandrail = (
  pos: Point,
  handrails: Handrail[],
  snapRadiusGrid: number,
  antis?: Anti[]
): Point | null => {
  // --- Pass 1: 端点/隅点スナップ（優先） ---
  let closestEndpoint: Point | null = null;
  let minEndpointDist = Infinity;

  // 手摺の端点
  for (const h of handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    for (const ep of [p1, p2]) {
      const dist = Math.hypot(ep.x - pos.x, ep.y - pos.y);
      if (dist < minEndpointDist && dist <= snapRadiusGrid) {
        minEndpointDist = dist;
        closestEndpoint = ep;
      }
    }
  }

  // アンチの4隅
  if (antis) {
    for (const a of antis) {
      for (const cp of getAntiCorners(a)) {
        const dist = Math.hypot(cp.x - pos.x, cp.y - pos.y);
        if (dist < minEndpointDist && dist <= snapRadiusGrid) {
          minEndpointDist = dist;
          closestEndpoint = cp;
        }
      }
    }
  }

  if (closestEndpoint) return closestEndpoint;

  // --- Pass 2: 手摺線分上スナップ（候補点が無い場合のみ、範囲を絞る） ---
  const lineSnapRadius = Math.max(Math.round(snapRadiusGrid * 0.4), 3);
  let closestLine: Point | null = null;
  let minLineDist = Infinity;

  for (const h of handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;

    let t = ((pos.x - p1.x) * dx + (pos.y - p1.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = Math.round(p1.x + t * dx);
    const projY = Math.round(p1.y + t * dy);
    const dist = Math.hypot(projX - pos.x, projY - pos.y);

    if (dist < minLineDist && dist <= lineSnapRadius) {
      minLineDist = dist;
      closestLine = { x: projX, y: projY };
    }
  }

  return closestLine;
};

/** 手摺配置のスナップ（始点スナップ＋終点スナップの両方を考慮）
 *  - 始点スナップ: 配置起点を既存端点に合わせる
 *  - 終点スナップ: 配置終点（起点+length）が既存端点に近い場合、起点をずらして合わせる
 *  より近い方を採用。返り値は配置すべき始点座標。
 */
export const snapHandrailPlacement = (
  startPos: Point,
  lengthMm: HandrailLengthMm,
  direction: 'horizontal' | 'vertical' | number,
  handrails: Handrail[],
  snapRadiusGrid: number,
  antis?: Anti[]
): { snappedStart: Point; snapIndicator: Point } | null => {
  const lengthGrid = mmToGrid(lengthMm);

  // 終点を計算（角度対応）
  let endPos: Point;
  if (direction === 'horizontal') {
    endPos = { x: startPos.x + lengthGrid, y: startPos.y };
  } else if (direction === 'vertical') {
    endPos = { x: startPos.x, y: startPos.y + lengthGrid };
  } else {
    const rad = (direction as number) * (Math.PI / 180);
    endPos = {
      x: startPos.x + Math.round(lengthGrid * Math.cos(rad)),
      y: startPos.y + Math.round(lengthGrid * Math.sin(rad)),
    };
  }

  // 始点スナップ
  const startSnap = snapToHandrail(startPos, handrails, snapRadiusGrid, antis);
  const startDist = startSnap
    ? Math.hypot(startSnap.x - startPos.x, startSnap.y - startPos.y)
    : Infinity;

  // 終点スナップ
  const endSnap = snapToHandrail(endPos, handrails, snapRadiusGrid, antis);
  const endDist = endSnap
    ? Math.hypot(endSnap.x - endPos.x, endSnap.y - endPos.y)
    : Infinity;

  if (startDist === Infinity && endDist === Infinity) return null;

  if (startDist <= endDist && startSnap) {
    return { snappedStart: startSnap, snapIndicator: startSnap };
  }

  if (endSnap) {
    let adjustedStart: Point;
    if (direction === 'horizontal') {
      adjustedStart = { x: endSnap.x - lengthGrid, y: endSnap.y };
    } else if (direction === 'vertical') {
      adjustedStart = { x: endSnap.x, y: endSnap.y - lengthGrid };
    } else {
      const rad = (direction as number) * (Math.PI / 180);
      adjustedStart = {
        x: endSnap.x - Math.round(lengthGrid * Math.cos(rad)),
        y: endSnap.y - Math.round(lengthGrid * Math.sin(rad)),
      };
    }
    return { snappedStart: adjustedStart, snapIndicator: endSnap };
  }

  return null;
};

/** 手摺の両端点を取得 */
export const getHandrailEndpoints = (h: Handrail): [Point, Point] => {
  const lengthGrid = mmToGrid(h.lengthMm);
  let dx = 0;
  let dy = 0;

  if (h.direction === 'horizontal') {
    dx = lengthGrid;
  } else if (h.direction === 'vertical') {
    dy = lengthGrid;
  } else {
    const rad = (h.direction as number) * (Math.PI / 180);
    dx = Math.round(lengthGrid * Math.cos(rad));
    dy = Math.round(lengthGrid * Math.sin(rad));
  }

  return [
    { x: h.x, y: h.y },
    { x: h.x + dx, y: h.y + dy },
  ];
};

/** グリッド交点へのマグネットスナップ（太い線優先） */
export const snapToGridIntersection = (
  worldX: number,
  worldY: number,
  zoom: number,
): Point => {
  const MAJOR_STEP = 100;  // 太い線: 100グリッド = 1000mm
  const MINOR_STEP = 50;   // 細い線: 50グリッド = 500mm

  // スナップ範囲をグリッド単位に変換（画面上のピクセルから逆算）
  const gridPx = INITIAL_GRID_PX * zoom;
  const majorRange = 40 / gridPx; // 画面40px以内
  const minorRange = 20 / gridPx; // 画面20px以内

  // 太い線の最近接交点
  const majorX = Math.round(worldX / MAJOR_STEP) * MAJOR_STEP;
  const majorY = Math.round(worldY / MAJOR_STEP) * MAJOR_STEP;
  const majorDist = Math.hypot(worldX - majorX, worldY - majorY);
  if (majorDist <= majorRange) {
    return { x: majorX, y: majorY };
  }

  // 細い線の最近接交点
  const minorX = Math.round(worldX / MINOR_STEP) * MINOR_STEP;
  const minorY = Math.round(worldY / MINOR_STEP) * MINOR_STEP;
  const minorDist = Math.hypot(worldX - minorX, worldY - minorY);
  if (minorDist <= minorRange) {
    return { x: minorX, y: minorY };
  }

  // どちらにもスナップしない → 元の座標（グリッド1単位に丸め）
  return { x: Math.round(worldX), y: Math.round(worldY) };
};

/** 全建物・障害物の頂点を取得 */
export function getAllExistingVertices(buildings: BuildingShape[], obstacles: Obstacle[]): Point[] {
  const vertices: Point[] = [];
  for (const b of buildings) {
    for (const p of b.points) vertices.push(p);
  }
  for (const o of obstacles) {
    if (o.points) {
      for (const p of o.points) vertices.push(p);
    } else if (o.type !== 'custom_circle') {
      vertices.push(
        { x: o.x, y: o.y },
        { x: o.x + o.width, y: o.y },
        { x: o.x + o.width, y: o.y + o.height },
        { x: o.x, y: o.y + o.height },
      );
    }
  }
  return vertices;
}

/** 全建物・障害物の辺を取得 */
export function getAllExistingEdges(buildings: BuildingShape[], obstacles: Obstacle[]): { p1: Point; p2: Point }[] {
  const edges: { p1: Point; p2: Point }[] = [];
  for (const b of buildings) {
    for (let i = 0; i < b.points.length; i++) {
      edges.push({ p1: b.points[i], p2: b.points[(i + 1) % b.points.length] });
    }
  }
  for (const o of obstacles) {
    if (o.points) {
      for (let i = 0; i < o.points.length; i++) {
        edges.push({ p1: o.points[i], p2: o.points[(i + 1) % o.points.length] });
      }
    } else if (o.type !== 'custom_circle') {
      const p1 = { x: o.x, y: o.y }, p2 = { x: o.x + o.width, y: o.y };
      const p3 = { x: o.x + o.width, y: o.y + o.height }, p4 = { x: o.x, y: o.y + o.height };
      edges.push({ p1, p2 }, { p1: p2, p2: p3 }, { p1: p3, p2: p4 }, { p1: p4, p2: p1 });
    }
  }
  return edges;
}

/** 頂点への強スナップ */
export function snapToVertex(
  worldX: number, worldY: number, vertices: Point[], zoom: number, snapRangePx: number = 30
): Point | null {
  const gridPx = INITIAL_GRID_PX * zoom;
  const range = snapRangePx / gridPx;
  let closest: Point | null = null;
  let minDist = Infinity;
  for (const v of vertices) {
    const d = Math.hypot(v.x - worldX, v.y - worldY);
    if (d < range && d < minDist) { minDist = d; closest = v; }
  }
  return closest ? { x: closest.x, y: closest.y } : null;
}

/** 辺への弱スナップ */
export function snapToEdge(
  worldX: number, worldY: number, edges: { p1: Point; p2: Point }[], zoom: number, snapRangePx: number = 10
): Point | null {
  const gridPx = INITIAL_GRID_PX * zoom;
  const range = snapRangePx / gridPx;
  let closest: Point | null = null;
  let minDist = Infinity;
  for (const e of edges) {
    const dx = e.p2.x - e.p1.x, dy = e.p2.y - e.p1.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.01) continue;
    const t = Math.max(0, Math.min(1, ((worldX - e.p1.x) * dx + (worldY - e.p1.y) * dy) / len2));
    const px = e.p1.x + t * dx, py = e.p1.y + t * dy;
    const d = Math.hypot(px - worldX, py - worldY);
    if (d < range && d < minDist) { minDist = d; closest = { x: Math.round(px), y: Math.round(py) }; }
  }
  return closest;
}

/** アンチの4隅を取得 */
export const getAntiCorners = (a: Anti): Point[] => {
  const lenGrid = mmToGrid(a.lengthMm);
  const wGrid = mmToGrid(a.width);
  if (a.direction === 'horizontal') {
    return [
      { x: a.x, y: a.y },
      { x: a.x + lenGrid, y: a.y },
      { x: a.x, y: a.y + wGrid },
      { x: a.x + lenGrid, y: a.y + wGrid },
    ];
  }
  // vertical
  return [
    { x: a.x, y: a.y },
    { x: a.x + wGrid, y: a.y },
    { x: a.x, y: a.y + lenGrid },
    { x: a.x + wGrid, y: a.y + lenGrid },
  ];
};

/** 角度を15度単位にスナップ */
export const snapAngle = (angleDeg: number): number => {
  return Math.round(angleDeg / 15) * 15;
};

/** 2点間の角度（度） */
export const angleBetween = (from: Point, to: Point): number => {
  const rad = Math.atan2(to.y - from.y, to.x - from.x);
  return (rad * 180) / Math.PI;
};
