import { describe, it, expect } from 'vitest';
import {
  computeBothmode2FLayout,
  computeBothmode1FLayout,
} from '../autoLayoutUtils';
import type { BuildingShape, ScaffoldStartConfig } from '@/types';

// Phase H-3d-2 Stage 4: bothmode 専用の 1F 計算関数のテスト
// Stage 3 の result2F を入力として、1F 全周を時計回りに割付する。

describe('computeBothmode1FLayout', () => {
  const ss: ScaffoldStartConfig = {
    corner: 'nw',
    startVertexIndex: 0,
    face1DistanceMm: 900,
    face2DistanceMm: 900,
    face1FirstHandrail: 1800,
    face2FirstHandrail: 1800,
  };

  it('下屋なし (1F=2F): 4 セグメント、全て collinear-with-2F、全 locked、hasUnresolved=false', () => {
    const square: BuildingShape = {
      id: 'b', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 900, y: 0 },
        { x: 900, y: 900 }, { x: 0, y: 900 },
      ],
      fill: '#000', floor: 1,
    };
    const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
    const result2F = computeBothmode2FLayout(square, square, distances, distances, ss);
    const result1F = computeBothmode1FLayout(square, square, result2F, distances);

    expect(result1F.edgeSegments.length).toBe(4);
    expect(result1F.hasUnresolved).toBe(false);
    result1F.edgeSegments.forEach(seg => {
      expect(seg.startConstraint.kind).toBe('collinear-with-2F');
      expect(seg.endConstraint.kind).toBe('collinear-with-2F');
      expect(seg.isLocked).toBe(true);
      expect(seg.segmentCount).toBe(1);
      expect(seg.segmentIndex).toBe(0);
      expect(seg.startDistanceMm).toBe(900);
    });
  });

  it('凸型1F (B面側下屋): 6 セグメント、collinear 3 本 + independent 3 本', () => {
    const building2F: BuildingShape = {
      id: 'b2', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
      fill: '#000', floor: 2,
    };
    // 1F: 2F + 東側下屋 (Y=2000-7000)
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
    const distances1F: Record<number, number> = {};
    for (let i = 0; i < 6; i++) distances1F[i] = 900;

    const result2F = computeBothmode2FLayout(building2F, building1F, distances2F, distances1F, ss);
    const result1F = computeBothmode1FLayout(building1F, building2F, result2F, distances1F);

    // 6 1F 辺すべて分類済 (covered なし)、各 1 セグメント
    expect(result1F.edgeSegments.length).toBe(6);

    const collinearSegs = result1F.edgeSegments.filter(
      s => s.startConstraint.kind === 'collinear-with-2F'
        && s.endConstraint.kind === 'collinear-with-2F'
    );
    // collinear 辺: index 0, 1, 5 = 3 本
    expect(collinearSegs.length).toBe(3);
    collinearSegs.forEach(seg => expect(seg.isLocked).toBe(true));

    // 残り 3 本は independent (startConstraint != collinear-with-2F)
    const independentSegs = result1F.edgeSegments.filter(
      s => s.startConstraint.kind !== 'collinear-with-2F'
    );
    expect(independentSegs.length).toBe(3);
  });

  it('B面側下屋 (連動なし、中央のみ突き出し): 8 セグメント、shed 3 辺 independent', () => {
    const building2F: BuildingShape = {
      id: 'b2', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
      fill: '#000', floor: 2,
    };
    // 1F: 2F + 東中央のみ下屋 (Y=2000-5000)
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

    const result2F = computeBothmode2FLayout(building2F, building1F, distances2F, distances1F, ss);
    const result1F = computeBothmode1FLayout(building1F, building2F, result2F, distances1F);

    // 8 1F 辺すべて分類済 (covered なし)
    expect(result1F.edgeSegments.length).toBe(8);

    // collinear 辺: index 0, 1, 5, 6, 7 = 5 本
    const collinearSegs = result1F.edgeSegments.filter(
      s => s.startConstraint.kind === 'collinear-with-2F'
    );
    expect(collinearSegs.length).toBe(5);

    // independent 辺: 2, 3, 4 (shed の 3 辺) = 3 本
    const independentSegs = result1F.edgeSegments.filter(
      s => s.startConstraint.kind !== 'collinear-with-2F'
    );
    expect(independentSegs.length).toBe(3);
  });

  it('B面側に下屋 2 個: 12 セグメント、collinear 6 + independent 6', () => {
    const building2F: BuildingShape = {
      id: 'b2', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 9000 }, { x: 0, y: 9000 },
      ],
      fill: '#000', floor: 2,
    };
    // 1F: 2F + 東に 2 個の下屋 (Y=1000-3000、Y=5000-7000)
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

    const result2F = computeBothmode2FLayout(building2F, building1F, distances2F, distances1F, ss);
    const result1F = computeBothmode1FLayout(building1F, building2F, result2F, distances1F);

    expect(result1F.edgeSegments.length).toBe(12);

    // collinear: 0, 1, 5, 9, 10, 11 = 6 本
    const collinearSegs = result1F.edgeSegments.filter(
      s => s.startConstraint.kind === 'collinear-with-2F'
    );
    expect(collinearSegs.length).toBe(6);

    // independent: 2,3,4,6,7,8 = 6 本
    const independentSegs = result1F.edgeSegments.filter(
      s => s.startConstraint.kind !== 'collinear-with-2F'
    );
    expect(independentSegs.length).toBe(6);
  });

  it('scaffoldStart 伝搬: 1F 開始辺は最初の柱仕込み点が指す 1F 辺', () => {
    const building2F: BuildingShape = {
      id: 'b2', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
      fill: '#000', floor: 2,
    };
    // 東中央のみ下屋 (Y=2000-5000)
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

    const result2F = computeBothmode2FLayout(building2F, building1F, distances2F, distances1F, ss);
    const result1F = computeBothmode1FLayout(building1F, building2F, result2F, distances1F);

    // 最初の柱は (9000,2000)、edge1FIndex=2 (shed 上辺)。
    // よって 1F の最初のセグメントは edge1FIndex=2 から始まる。
    const first = result1F.edgeSegments[0];
    expect(first.edge1FIndex).toBe(2);
    expect(first.startConstraint.kind).toBe('pillar-from-2F');
  });

  it('isLocked: collinear 辺は常に locked、independent で次が collinear なら locked、両側 independent なら not locked', () => {
    const building2F: BuildingShape = {
      id: 'b2', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
      fill: '#000', floor: 2,
    };
    // 東中央のみ下屋: shed 内部 (edge3) は両側 independent → not locked
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

    const result2F = computeBothmode2FLayout(building2F, building1F, distances2F, distances1F, ss);
    const result1F = computeBothmode1FLayout(building1F, building2F, result2F, distances1F);

    // 全 collinear セグメントは locked
    const collinearSegs = result1F.edgeSegments.filter(
      s => s.startConstraint.kind === 'collinear-with-2F'
    );
    collinearSegs.forEach(seg => expect(seg.isLocked).toBe(true));

    // edge 4 (shed の上辺、Y=5000) → 次 edge 5 (collinear) → locked、endConstraint=collinear-with-2F
    const edge4Seg = result1F.edgeSegments.find(s => s.edge1FIndex === 4);
    expect(edge4Seg).toBeDefined();
    expect(edge4Seg!.endConstraint.kind).toBe('collinear-with-2F');
    expect(edge4Seg!.isLocked).toBe(true);

    // edge 3 (shed 東面) → 次 edge 4 (independent) → not locked、endConstraint=next-1F-face
    const edge3Seg = result1F.edgeSegments.find(s => s.edge1FIndex === 3);
    expect(edge3Seg).toBeDefined();
    expect(edge3Seg!.endConstraint.kind).toBe('next-1F-face');
    expect(edge3Seg!.isLocked).toBe(false);
  });
});
