import { describe, it, expect } from 'vitest';
import {
  findShedRoots,
  calculateBreakpoint,
  ShedRoot,
  findBestRailsExactly,
  findSegmentSolutions,
  SegmentSplitInput,
} from '../segmentSplit';
import {
  getBuildingEdgesClockwise,
  getEdgesNotCoveredBy,
  EdgeInfo,
} from '../autoLayoutUtils';
import type { BuildingShape, HandrailLengthMm } from '@/types';

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

describe('findBestRailsExactly', () => {
  const sizes: HandrailLengthMm[] = [1800, 1200, 900, 600, 400, 300, 200];

  it('2400mm: [1800, 600] が見つかる（合計一致）', () => {
    const rails = findBestRailsExactly(2400, sizes);
    expect(rails).not.toBeNull();
    expect(rails!.reduce((s, r) => s + r, 0)).toBe(2400);
    // priorityConfig なしなら本数最少優先 → [1800, 600] (2 本) が選ばれる
    expect(rails!.length).toBe(2);
  });

  it('350mm: 作成不可（最小 200 でも不適合）→ null', () => {
    // 350 は 200/300/400... の組合せで作れない
    expect(findBestRailsExactly(350, sizes)).toBeNull();
  });

  it('1234mm: GCD 不整合 → null', () => {
    // sizes の GCD は 100、1234 % 100 != 0 → null
    expect(findBestRailsExactly(1234, sizes)).toBeNull();
  });

  it('targetMm <= 0 → null', () => {
    expect(findBestRailsExactly(0, sizes)).toBeNull();
    expect(findBestRailsExactly(-100, sizes)).toBeNull();
  });

  it('enabledSizes が空 → null', () => {
    expect(findBestRailsExactly(1000, [])).toBeNull();
  });
});

describe('findSegmentSolutions', () => {
  // 共通テスト用の凸型 1F + 四角 2F
  const building1F: BuildingShape = {
    id: '1f',
    type: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: -300 },
      { x: 600, y: -300 },
      { x: 600, y: 0 },
      { x: 900, y: 0 },
      { x: 900, y: 500 },
      { x: 0, y: 500 },
    ],
    fill: '#000',
    floor: 1,
  };

  const building2F: BuildingShape = {
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

  const enabledSizes: HandrailLengthMm[] = [1800, 1200, 900, 600, 400, 300, 200];

  /** 2F 北辺 (p1=(0,0) → p2=(900,0)) を取得 */
  const getEdge2FNorth = (): EdgeInfo => {
    const edges = getBuildingEdgesClockwise(building2F);
    return edges[0]; // 0,0 → 900,0、horizontal、進行方向 +x
  };

  it('凸型 1F + 四角 2F: 希望 900mm でぴったり割れる解が最高スコア', () => {
    const edge2F = getEdge2FNorth();
    const uncoveredEdges1F = getEdgesNotCoveredBy(building1F, building2F);
    const desired: Record<number, number> = {};
    getBuildingEdgesClockwise(building1F).forEach(e => { desired[e.index] = 900; });
    const shedRoots = findShedRoots(building1F, building2F, edge2F, uncoveredEdges1F, desired);
    expect(shedRoots.length).toBe(2);

    // 2F 北辺の cursorStart/End を 900mm 離れで模擬
    // cursorStart = -90 (= 0 - 900mm/10), cursorEnd = 990 (= 900 + 900mm/10)
    const input: SegmentSplitInput = {
      edge2F,
      cursorStart: -90,
      cursorEnd: 990,
      confirmedDistance2FMm: 900,
      shedRoots,
      enabledSizes,
    };

    const solutions = findSegmentSolutions(input);
    expect(solutions.length).toBeGreaterThan(0);

    const best = solutions[0];
    // 希望ぴったり (totalAdj=0) の解が最高スコア
    expect(best.totalAdjustmentMm).toBe(0);
    // 区間は 3 つ（cursorStart → BP1 → BP2 → cursorEnd）
    expect(best.segments.length).toBe(3);
    // 切れ目位置: x=210 と x=690
    const bpAxes = best.breakpoints.map(bp => bp.axisCoord).sort((a, b) => a - b);
    expect(bpAxes).toEqual([210, 690]);
    // segments の合計が cursor 範囲全長と一致
    const totalLen = best.segments.reduce((s, seg) => s + seg.lengthMm, 0);
    expect(totalLen).toBe(10800); // (-90 to 990) = 1080 grid = 10800 mm
  });

  it('shedRoots 0 個: 単一区間として処理（切れ目なし）', () => {
    const edge2F = getEdge2FNorth();
    const input: SegmentSplitInput = {
      edge2F,
      cursorStart: -90,
      cursorEnd: 990,
      confirmedDistance2FMm: 900,
      shedRoots: [],
      enabledSizes,
    };

    const solutions = findSegmentSolutions(input);
    expect(solutions.length).toBeGreaterThan(0);
    const best = solutions[0];
    expect(best.breakpoints.length).toBe(0);
    expect(best.segments.length).toBe(1);
    expect(best.segments[0].lengthMm).toBe(10800);
  });

  it('希望離れがズレないと割り切れない: adjustment 付き解が選ばれる', () => {
    // 1F 凸の左右辺の希望離れを少しずらして、ぴったりが不可能な状況を作る
    // 例: 希望 945mm（GCD=100 と整合せず）
    const edge2F = getEdge2FNorth();
    const uncoveredEdges1F = getEdgesNotCoveredBy(building1F, building2F);
    const desired: Record<number, number> = {};
    getBuildingEdgesClockwise(building1F).forEach(e => {
      // 全 1F 辺を 945 に
      desired[e.index] = 945;
    });
    const shedRoots = findShedRoots(building1F, building2F, edge2F, uncoveredEdges1F, desired);

    const input: SegmentSplitInput = {
      edge2F,
      cursorStart: -90,
      cursorEnd: 990,
      confirmedDistance2FMm: 900,
      shedRoots,
      enabledSizes,
    };

    const solutions = findSegmentSolutions(input);
    expect(solutions.length).toBeGreaterThan(0);
    const best = solutions[0];
    // adjustment が 0 ではない解が選ばれる（945 → 900 や 1000 への調整）
    expect(best.totalAdjustmentMm).toBeGreaterThan(0);
    // segment 合計が cursor 範囲長と一致
    const totalLen = best.segments.reduce((s, seg) => s + seg.lengthMm, 0);
    expect(totalLen).toBe(10800);
  });

  it('全段階で解なし → fallback solution が返る（空配列にならない）', () => {
    // 極端に小さな edge2F で、cursor 範囲が小さすぎて分割不能なケース
    // shedRoots を遠くに設定すると cursor 範囲外で候補ゼロ → fallback
    const edge2F = getEdge2FNorth();
    const input: SegmentSplitInput = {
      edge2F,
      cursorStart: 0,
      cursorEnd: 30,        // 300mm のみ
      confirmedDistance2FMm: 900,
      shedRoots: [
        // 極めて遠い root（cursor 範囲外）
        { edge1FIndex: 99, desiredDistance1FMm: 10000, rootAxisCoord: 5000, side: 'start' },
      ],
      enabledSizes,
    };

    const solutions = findSegmentSolutions(input);
    // 空配列ではない（fallback が必ず返る）
    expect(solutions.length).toBeGreaterThan(0);
    expect(solutions[0].isFallback).toBe(true);
  });
});
