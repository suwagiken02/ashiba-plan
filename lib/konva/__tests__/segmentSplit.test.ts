import { describe, it, expect } from 'vitest';
import { findShedRoots, calculateBreakpoint, ShedRoot } from '../segmentSplit';
import {
  getBuildingEdgesClockwise,
  getEdgesNotCoveredBy,
} from '../autoLayoutUtils';
import type { BuildingShape } from '@/types';

/**
 * 師匠の典型ケース:
 *   1F: 凸型 8 辺（北側中央が凸として張り出す）
 *   2F: 1F の主要部分と一致する四角 4 辺（凸頭部分は 2F に含まれない）
 *
 * 座標 (grid 単位、1grid=10mm):
 *   1F 凸型: 左下→右下→右上→...→凸の頭→...→左上→左下
 *
 *     (0,-300)──(900,-300)    ← 凸の頭（北辺）
 *       │           │
 *     (0,0)──────(900,0)      ← 1F の主要部分の北辺 (= 2F の北辺)
 *       │                │
 *     (-200, ...)        (1100, ...)
 *
 *   簡略化のため:
 *     1F = 凸字 (北辺の中央 300〜600 が y=-300 に飛び出す)
 *     2F = 0,0 / 900,0 / 900,500 / 0,500 の四角
 */
describe('findShedRoots', () => {
  // 凸型 1F (北辺の中央 300-600 が y=-300 に飛び出す)
  const building1FConvex: BuildingShape = {
    id: '1f',
    type: 'polygon',
    points: [
      // 時計回り
      { x: 0, y: 0 },        // 0: 左上
      { x: 300, y: 0 },      // 1: 凸の左根本
      { x: 300, y: -300 },   // 2: 凸の左上
      { x: 600, y: -300 },   // 3: 凸の右上
      { x: 600, y: 0 },      // 4: 凸の右根本
      { x: 900, y: 0 },      // 5: 右上
      { x: 900, y: 500 },    // 6: 右下
      { x: 0, y: 500 },      // 7: 左下
    ],
    fill: '#000',
    floor: 1,
  };

  // 2F は 1F の凸を除いた四角
  const building2FRect: BuildingShape = {
    id: '2f',
    type: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 900, y: 0 },
      { x: 900, y: 500 },
      { x: 0, y: 500 },
    ],
    fill: '#000',
    floor: 2,
  };

  // 1F の希望離れ（全辺 900mm デフォルト）
  const desiredDistances1F: Record<number, number> = (() => {
    const d: Record<number, number> = {};
    getBuildingEdgesClockwise(building1FConvex).forEach(e => { d[e.index] = 900; });
    return d;
  })();

  it('凸型 1F + 四角 2F: 北辺に 2 つの根本（凸の左右）', () => {
    const uncoveredEdges1F = getEdgesNotCoveredBy(building1FConvex, building2FRect);
    const edges2F = getBuildingEdgesClockwise(building2FRect);
    // 2F 北辺 = 0,0 → 900,0
    const edge2FNorth = edges2F[0];
    expect(edge2FNorth.handrailDir).toBe('horizontal');

    const roots = findShedRoots(building1FConvex, building2FRect, edge2FNorth, uncoveredEdges1F, desiredDistances1F);

    expect(roots.length).toBe(2);
    // 根本 X 座標: 300, 600
    const xs = roots.map(r => r.rootAxisCoord).sort((a, b) => a - b);
    expect(xs).toEqual([300, 600]);
    // 各根本の希望離れは 900mm
    roots.forEach(r => expect(r.desiredDistance1FMm).toBe(900));
  });

  it('side の判定: 進行方向で先=start、後=end', () => {
    const uncoveredEdges1F = getEdgesNotCoveredBy(building1FConvex, building2FRect);
    const edges2F = getBuildingEdgesClockwise(building2FRect);
    const edge2FNorth = edges2F[0]; // p1=(0,0), p2=(900,0)、進行方向 +x

    const roots = findShedRoots(building1FConvex, building2FRect, edge2FNorth, uncoveredEdges1F, desiredDistances1F);

    // 進行方向 +x なので、x=300 の根本（凸が x=300〜600 にある = 進行方向「先」）
    //   → side='start'
    // x=600 の根本（凸の中央が x=300〜600 にあるが、境界点は x=600 で凸は進行方向「後」）
    //   → side='end'
    const root300 = roots.find(r => r.rootAxisCoord === 300)!;
    const root600 = roots.find(r => r.rootAxisCoord === 600)!;
    expect(root300.side).toBe('start');
    expect(root600.side).toBe('end');
  });

  it('下屋なし（1F == 2F）: 空配列', () => {
    const building1FSame: BuildingShape = {
      id: '1f',
      type: 'polygon',
      points: [...building2FRect.points],
      fill: '#000',
      floor: 1,
    };
    const desired: Record<number, number> = {};
    getBuildingEdgesClockwise(building1FSame).forEach(e => { desired[e.index] = 900; });
    const uncoveredEdges = getEdgesNotCoveredBy(building1FSame, building2FRect);
    const edges2F = getBuildingEdgesClockwise(building2FRect);
    const roots = findShedRoots(building1FSame, building2FRect, edges2F[0], uncoveredEdges, desired);
    // 完全一致判定で 2F に覆われている扱い → 下屋なし → 根本ゼロ
    expect(roots).toEqual([]);
  });

  it('2F 辺が 1F 凸に関係しない辺: 根本ゼロ', () => {
    const uncoveredEdges1F = getEdgesNotCoveredBy(building1FConvex, building2FRect);
    const edges2F = getBuildingEdgesClockwise(building2FRect);
    // 2F 南辺 = 900,500 → 0,500（凸とは関係ない）
    const edge2FSouth = edges2F[2];
    const roots = findShedRoots(building1FConvex, building2FRect, edge2FSouth, uncoveredEdges1F, desiredDistances1F);
    expect(roots).toEqual([]);
  });

  it('各根本に紐付く希望離れが正しく取得される', () => {
    // 1F 下屋辺の凸の頭（edge.index = 2 が凸の左上垂直、3 が頭の水平、など）に
    // 個別の希望離れを設定
    const customDesired: Record<number, number> = {};
    getBuildingEdgesClockwise(building1FConvex).forEach(e => { customDesired[e.index] = 900; });
    // 凸の左の垂直辺を特定: p1=(300,0), p2=(300,-300)
    const edges1F = getBuildingEdgesClockwise(building1FConvex);
    const leftConvexVert = edges1F.find(e => e.p1.x === 300 && e.p1.y === 0 && e.p2.x === 300 && e.p2.y === -300);
    expect(leftConvexVert).toBeDefined();
    customDesired[leftConvexVert!.index] = 750; // 左凸辺だけ 750

    const uncoveredEdges1F = getEdgesNotCoveredBy(building1FConvex, building2FRect);
    const edges2F = getBuildingEdgesClockwise(building2FRect);
    const edge2FNorth = edges2F[0];

    const roots = findShedRoots(building1FConvex, building2FRect, edge2FNorth, uncoveredEdges1F, customDesired);

    // 左根本 (x=300) は凸の左垂直辺 (custom=750mm) に紐付く
    const root300 = roots.find(r => r.rootAxisCoord === 300)!;
    expect(root300.desiredDistance1FMm).toBe(750);
  });
});

describe('calculateBreakpoint', () => {
  const root: ShedRoot = {
    edge1FIndex: 0,
    desiredDistance1FMm: 900,
    rootAxisCoord: 300,  // grid 単位 (= 3000mm)
    side: 'start',
  };

  it('side=start, sign=+1, adjustment=0: 切れ目 = root - 90 = 210', () => {
    const bp = calculateBreakpoint(root, 1, 0);
    expect(bp.axisCoord).toBeCloseTo(300 - 90, 6); // grid 単位 (90 = 900mm)
    expect(bp.appliedDistance1FMm).toBe(900);
    expect(bp.adjustmentMm).toBe(0);
  });

  it('side=start, sign=+1, adjustment=+50: 切れ目 = root - 95 = 205', () => {
    const bp = calculateBreakpoint(root, 1, 50);
    expect(bp.axisCoord).toBeCloseTo(300 - 95, 6);
    expect(bp.appliedDistance1FMm).toBe(950);
    expect(bp.adjustmentMm).toBe(50);
  });

  it('side=end, sign=+1, adjustment=0: 切れ目 = root + 90', () => {
    const rootEnd: ShedRoot = { ...root, side: 'end' };
    const bp = calculateBreakpoint(rootEnd, 1, 0);
    expect(bp.axisCoord).toBeCloseTo(300 + 90, 6);
  });

  it('side=start, sign=-1 (進行方向逆): 切れ目 = root + 90', () => {
    // sign=-1 なら start でも符号反転で +側
    const bp = calculateBreakpoint(root, -1, 0);
    expect(bp.axisCoord).toBeCloseTo(300 + 90, 6);
  });
});
