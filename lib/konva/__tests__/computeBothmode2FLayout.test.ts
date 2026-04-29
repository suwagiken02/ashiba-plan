import { describe, it, expect } from 'vitest';
import { computeBothmode2FLayout } from '../autoLayoutUtils';
import type { BuildingShape, ScaffoldStartConfig } from '@/types';

// Phase H-3d-2 Stage 3: bothmode 専用の 2F 計算関数のテスト
// 2F 面が 1F 下屋と交差する場合のセグメント分割と柱仕込みを検証する。

describe('computeBothmode2FLayout', () => {
  // 共通: scaffoldStart (NW=vertex 0、face1=900, face2=900)
  const ss: ScaffoldStartConfig = {
    corner: 'nw',
    startVertexIndex: 0,
    face1DistanceMm: 900,
    face2DistanceMm: 900,
    face1FirstHandrail: 1800,
    face2FirstHandrail: 1800,
  };

  it('下屋なし (1F=2F): 全辺連動 → 各 2F 面は 1 セグメント、柱なし', () => {
    const square: BuildingShape = {
      id: 'b', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 900, y: 0 },
        { x: 900, y: 900 }, { x: 0, y: 900 },
      ],
      fill: '#000', floor: 1,
    };
    const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const result = computeBothmode2FLayout(square, square, distances, distances, ss);
    // 4 辺、各 1 セグメント = 計 4 セグメント
    expect(result.edgeSegments.length).toBe(4);
    // 各セグメントは segmentCount=1
    result.edgeSegments.forEach(seg => {
      expect(seg.segmentCount).toBe(1);
      expect(seg.segmentIndex).toBe(0);
      // 全 next-2F-face (柱仕込みなし)
      expect(seg.desiredEndSource.kind).toBe('next-2F-face');
    });
  });

  it('B 面側下屋 (連動なし): 2F の B 面が 2 セグメント (柱 1 本)', () => {
    // 2F: 9000x7000 四角
    const building2F: BuildingShape = {
      id: 'b2', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
      fill: '#000', floor: 2,
    };
    // 1F: 2F + 東側に下屋 (X=9000-12000, Y=2000-7000)
    const building1F: BuildingShape = {
      id: 'b1', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 2000 }, { x: 12000, y: 2000 },
        { x: 12000, y: 7000 }, { x: 0, y: 7000 },
      ],
      fill: '#000', floor: 1,
    };
    const distances2F = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const distances1F = { 0: 900, 1: 900, 2: 900, 3: 900, 4: 900, 5: 900 };
    const result = computeBothmode2FLayout(
      building2F, building1F, distances2F, distances1F, ss,
    );

    // 2F 辺数 4。B 面 (index=1) は 2 セグメント、他は 1 セグメント。
    // 計 4 + 1 = 5 セグメント
    expect(result.edgeSegments.length).toBe(5);

    const bSegs = result.edgeSegments.filter(s => s.edge2FIndex === 1);
    expect(bSegs.length).toBe(2);
    expect(bSegs[0].segmentCount).toBe(2);
    expect(bSegs[0].segmentIndex).toBe(0);
    expect(bSegs[0].desiredEndSource.kind).toBe('1F-face-pillar');
    expect(bSegs[1].segmentIndex).toBe(1);
    expect(bSegs[1].desiredEndSource.kind).toBe('next-2F-face');
  });

  it('B 面側下屋 + 上下とも連動なし: 2F の B 面が 3 セグメント (柱 2 本)', () => {
    // 2F: 9000x7000 四角
    const building2F: BuildingShape = {
      id: 'b2', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
      fill: '#000', floor: 2,
    };
    // 1F: 2F + 東に「中央のみ」突き出した下屋 (X=9000-12000, Y=2000-5000)
    // 下屋の上下端 (Y=2000, Y=5000) で B 面を切る → 2 つの柱 → 3 セグメント
    const building1F: BuildingShape = {
      id: 'b1', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 2000 }, { x: 12000, y: 2000 },
        { x: 12000, y: 5000 }, { x: 9000, y: 5000 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
      fill: '#000', floor: 1,
    };
    const distances2F = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const distances1F: Record<number, number> = {};
    for (let i = 0; i < 8; i++) distances1F[i] = 900;
    const result = computeBothmode2FLayout(
      building2F, building1F, distances2F, distances1F, ss,
    );

    const bSegs = result.edgeSegments.filter(s => s.edge2FIndex === 1);
    expect(bSegs.length).toBe(3);
    expect(bSegs[0].segmentCount).toBe(3);
    expect(bSegs[0].desiredEndSource.kind).toBe('1F-face-pillar');
    expect(bSegs[1].desiredEndSource.kind).toBe('1F-face-pillar');
    expect(bSegs[2].desiredEndSource.kind).toBe('next-2F-face');
    // 計 4 (他 3 辺) + 3 = 6 セグメント
    expect(result.edgeSegments.length).toBe(6);
  });

  it('B 面側に下屋 2 個 (連動なし): 2F の B 面が 5 セグメント (柱 4 本)', () => {
    const building2F: BuildingShape = {
      id: 'b2', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 9000 }, { x: 0, y: 9000 },
      ],
      fill: '#000', floor: 2,
    };
    // 1F: 2F + 東に 2 つの下屋 (Y=1000-3000 と Y=5000-7000)
    const building1F: BuildingShape = {
      id: 'b1', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 1000 }, { x: 12000, y: 1000 },
        { x: 12000, y: 3000 }, { x: 9000, y: 3000 },
        { x: 9000, y: 5000 }, { x: 12000, y: 5000 },
        { x: 12000, y: 7000 }, { x: 9000, y: 7000 },
        { x: 9000, y: 9000 }, { x: 0, y: 9000 },
      ],
      fill: '#000', floor: 1,
    };
    const distances2F = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const distances1F: Record<number, number> = {};
    for (let i = 0; i < 12; i++) distances1F[i] = 900;
    const result = computeBothmode2FLayout(
      building2F, building1F, distances2F, distances1F, ss,
    );

    const bSegs = result.edgeSegments.filter(s => s.edge2FIndex === 1);
    expect(bSegs.length).toBe(5);
    expect(bSegs[0].segmentCount).toBe(5);
    // 4 つの柱 (1F 由来) → desiredEndSource は最後を除いて全て 1F-face-pillar
    for (let s = 0; s < 4; s++) {
      expect(bSegs[s].desiredEndSource.kind).toBe('1F-face-pillar');
    }
    expect(bSegs[4].desiredEndSource.kind).toBe('next-2F-face');
  });

  it('scaffoldStart 固定: 起点辺の最初のセグメントは isLocked=true', () => {
    const square: BuildingShape = {
      id: 'b', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 900, y: 0 },
        { x: 900, y: 900 }, { x: 0, y: 900 },
      ],
      fill: '#000', floor: 1,
    };
    const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const result = computeBothmode2FLayout(square, square, distances, distances, ss);
    // ループ最初のセグメント (= edge2FIndex=0、segmentIndex=0) が起点辺
    const first = result.edgeSegments[0];
    expect(first.edge2FIndex).toBe(0);
    expect(first.segmentIndex).toBe(0);
    expect(first.isLocked).toBe(true);
  });

  it('cascade: 前セグメントの actualEnd が次セグメントの startDistanceMm に継承', () => {
    // 単純な四角で全 exact ケース → 全セグメント startDistanceMm=900 で揃う
    const square: BuildingShape = {
      id: 'b', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 900, y: 0 },
        { x: 900, y: 900 }, { x: 0, y: 900 },
      ],
      fill: '#000', floor: 1,
    };
    const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const result = computeBothmode2FLayout(square, square, distances, distances, ss);
    // 各セグメントの startDistanceMm が 900 (cascade 整合)
    result.edgeSegments.forEach(seg => {
      expect(seg.startDistanceMm).toBe(900);
    });
  });
});
