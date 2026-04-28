import { describe, it, expect } from 'vitest';
import { computeAutoLayout, computeAutoLayoutSequential } from '../autoLayoutUtils';
import type { BuildingShape, ScaffoldStartConfig } from '@/types';

describe('computeAutoLayoutSequential', () => {
  // 9000mm × 9000mm 正方形（grid=10mm単位なので points は 900）
  const square9000: BuildingShape = {
    id: 'b1',
    type: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 900, y: 0 },
      { x: 900, y: 900 },
      { x: 0, y: 900 },
    ],
    fill: '#000',
    floor: 1,
  };

  it('正方形で全辺900希望なら全 exact になる', () => {
    // 各辺 effective = 900 + 9000 + 900 = 10800 = 1800×6 (exact)
    const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const result = computeAutoLayoutSequential(square9000, distances);
    expect(result.edgeResults.length).toBe(4);
    expect(result.hasUnresolved).toBe(false);
    result.edgeResults.forEach(er => {
      expect(er.candidates.length).toBe(1);
      expect(er.isAutoProgress).toBe(true);
      expect(er.candidates[0].diffFromDesired).toBe(0);
    });
  });

  it('全辺945希望なら端数発生で hasUnresolved = true', () => {
    // 945 は 50 の倍数でないため、required = 945+9000+945 = 10890 が
    // GCD=100 と整合せず、delta=0 で exact が見つからない → 2候補（挟む2択）
    const distances = { 0: 945, 1: 945, 2: 945, 3: 945 };
    const result = computeAutoLayoutSequential(square9000, distances);
    expect(result.hasUnresolved).toBe(true);
    const hasMultiple = result.edgeResults.some(er => er.candidates.length === 2);
    expect(hasMultiple).toBe(true);
  });

  it('userSelections で次の辺の始点離れに反映される', () => {
    const distances = { 0: 945, 1: 945, 2: 945, 3: 945 };

    const r1 = computeAutoLayoutSequential(square9000, distances);
    const firstEdge = r1.edgeResults[0];

    expect(firstEdge.candidates.length).toBe(2);

    // 最初の辺で別候補(index=1)を選ぶ
    const userSelections = { [firstEdge.edge.index]: 1 };
    const r2 = computeAutoLayoutSequential(
      square9000,
      distances,
      undefined,
      undefined,
      undefined,
      userSelections,
    );

    expect(r2.edgeResults[0].selectedIndex).toBe(1);
    // 2番目の辺の始点離れ = 1番目の actualEnd → r1 と異なる
    expect(r2.edgeResults[1].startDistanceMm).not.toBe(r1.edgeResults[1].startDistanceMm);
    expect(r2.edgeResults[1].startDistanceMm).toBe(
      r1.edgeResults[0].candidates[1].actualEndDistanceMm,
    );
  });

  it('辺数と各辺の構造が正しい', () => {
    const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const result = computeAutoLayoutSequential(square9000, distances);
    result.edgeResults.forEach((er, i) => {
      expect(er.edge.index).toBe(i);
      expect(er.startDistanceMm).toBeGreaterThan(0);
      expect(er.desiredEndDistanceMm).toBeGreaterThan(0);
      expect(typeof er.prevCornerIsConvex).toBe('boolean');
      expect(typeof er.nextCornerIsConvex).toBe('boolean');
      expect(er.isLocked).toBe(false); // scaffoldStart 未指定なので全て false
    });
  });

  it('全 exact 時は scaffoldCoord/cursorStart/cursorEnd が computeAutoLayout と一致', () => {
    // 全辺900希望 → 全 exact → 各辺の startDistanceMm = 900 = distances[i]
    // この条件下では Sequential の座標計算は既存 computeAutoLayout と完全一致するはず
    const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const seq = computeAutoLayoutSequential(square9000, distances);
    const orig = computeAutoLayout(square9000, distances);

    expect(seq.edgeResults.length).toBe(orig.edgeLayouts.length);
    seq.edgeResults.forEach((er, i) => {
      const ol = orig.edgeLayouts[i];
      expect(er.scaffoldCoord).toBeCloseTo(ol.scaffoldCoord, 6);
      expect(er.cursorStart).toBeCloseTo(ol.cursorStart, 6);
      expect(er.cursorEnd).toBeCloseTo(ol.cursorEnd, 6);
      expect(er.effectiveMm).toBe(ol.effectiveMm);
    });
  });

  // Phase H-fix-2b: scaffoldStart 起点ローテート
  // edges (CW from pts[0]):
  //   0: (0,0)→(900,0)   north,  horizontal
  //   1: (900,0)→(900,900) east, vertical
  //   2: (900,900)→(0,900) south, horizontal
  //   3: (0,900)→(0,0)   west,   vertical
  describe('Phase H-fix-2b: scaffoldStart 起点ローテート', () => {
    it('vertex=2 (SE) 起点: edges[2]=face1, edges[1]=face2 で固定 (起点rotate)', () => {
      const ss: ScaffoldStartConfig = {
        corner: 'se',
        startVertexIndex: 2,
        face1DistanceMm: 700,
        face2DistanceMm: 1100,
        face1FirstHandrail: 1800,
        face2FirstHandrail: 1800,
      };
      // AutoLayoutModal と同じ初期化: locked 辺の distances に face を入れる
      const distances = { 0: 888, 1: 1100, 2: 700, 3: 888 };
      const result = computeAutoLayoutSequential(square9000, distances, ss);

      // 起点辺 = edges[2] (south, horizontal) → face1=700
      expect(result.edgeResults[2].isLocked).toBe(true);
      expect(result.edgeResults[2].startDistanceMm).toBe(700);
      // 閉じ辺 = edges[1] (east, vertical) → face2=1100
      expect(result.edgeResults[1].isLocked).toBe(true);
      expect(result.edgeResults[1].startDistanceMm).toBe(1100);
    });

    it('cascade 順で物理 prev の startDist が確定済みになる (vertex=2 起点)', () => {
      // cascade 順 k=0..3 → 物理 i=2,3,0,1
      // - k=0 (i=2): 起点、face1=900
      // - k=1 (i=3): cascade、prevEdgeStart = intermediate[2].startDist = 900
      // - k=2 (i=0): cascade、prevEdgeStart = intermediate[3].startDist (cascade 確定)
      // - k=3 (i=1): 閉じ、face2=900 で上書き
      const ss: ScaffoldStartConfig = {
        corner: 'se',
        startVertexIndex: 2,
        face1DistanceMm: 900,
        face2DistanceMm: 900,
        face1FirstHandrail: 1800,
        face2FirstHandrail: 1800,
      };
      const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
      const result = computeAutoLayoutSequential(square9000, distances, ss);
      expect(result.hasUnresolved).toBe(false);
      // 全 exact なので cursor と rails 合計が完全整合
      result.edgeResults.forEach(er => {
        expect(er.candidates.length).toBe(1);
      });
    });

    it('閉じ辺は cascade を捨てて face で上書き (vertex=0 起点)', () => {
      // cascade 順 k=0..3 → 物理 i=0,1,2,3
      // k=3 で edges[3] (west, vertical) を face2 で上書き
      const ss: ScaffoldStartConfig = {
        corner: 'nw',
        startVertexIndex: 0,
        face1DistanceMm: 750,
        face2DistanceMm: 1050,
        face1FirstHandrail: 1800,
        face2FirstHandrail: 1800,
      };
      const distances = { 0: 750, 1: 999, 2: 999, 3: 1050 };
      const result = computeAutoLayoutSequential(square9000, distances, ss);

      // 起点 edges[0] horizontal → face1=750
      expect(result.edgeResults[0].startDistanceMm).toBe(750);
      // 閉じ edges[3] vertical → face2=1050 (cascade 値ではなく上書き)
      expect(result.edgeResults[3].startDistanceMm).toBe(1050);
    });

    it('scaffoldStart 無し時は後方互換 (i=0 起点、index 順 cascade)', () => {
      const distances = { 0: 945, 1: 945, 2: 945, 3: 945 };
      const result = computeAutoLayoutSequential(square9000, distances);
      // 全辺 isLocked=false (scaffoldStart 無し)
      result.edgeResults.forEach(er => {
        expect(er.isLocked).toBe(false);
      });
      // edges[0] は startIdx=0 → distances[0]=945 で初期化
      expect(result.edgeResults[0].startDistanceMm).toBe(945);
      // index 順 cascade なので edges[1] は edges[0].actualEnd を継承
      const e0 = result.edgeResults[0];
      const e0End = e0.candidates[e0.selectedIndex]?.actualEndDistanceMm;
      if (e0End !== undefined) {
        expect(result.edgeResults[1].startDistanceMm).toBe(e0End);
      }
    });

    it('scaffoldStart 有り全 exact: 起点辺と閉じ辺の cursor/rails 整合 (閉合誤差ゼロ条件)', () => {
      const ss: ScaffoldStartConfig = {
        corner: 'nw',
        startVertexIndex: 0,
        face1DistanceMm: 900,
        face2DistanceMm: 900,
        face1FirstHandrail: 1800,
        face2FirstHandrail: 1800,
      };
      const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
      const result = computeAutoLayoutSequential(square9000, distances, ss);
      // 全辺で rails 合計 = effectiveMm を確認 (整合)
      result.edgeResults.forEach(er => {
        const railsTotal = er.candidates[er.selectedIndex]?.totalMm ?? 0;
        expect(railsTotal).toBe(er.effectiveMm);
      });
    });
  });
});
