import { describe, it, expect } from 'vitest';
import {
  computeBothmode2FLayout,
  computeBothmode1FLayout,
  splitBuilding2FAt1FVertices,
} from '../autoLayoutUtils';
import type { BuildingShape, ScaffoldStartConfig } from '@/types';

// Phase H-3d-2 Stage 4 / 修正B: bothmode 専用の 1F 計算関数のテスト
// Stage 3 の result2F を入力として、1F 全周を時計回りに割付する。
// 修正B: 連動辺 (collinear) は edgeSegments に含めない (2F 足場と物理共有のため)。

describe('computeBothmode1FLayout', () => {
  const ss: ScaffoldStartConfig = {
    corner: 'nw',
    startVertexIndex: 0,
    face1DistanceMm: 900,
    face2DistanceMm: 900,
    face1FirstHandrail: 1800,
    face2FirstHandrail: 1800,
  };

  it('下屋なし (1F=2F): 全辺 collinear → edgeSegments=0、hasUnresolved=false', () => {
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

    // 修正B: 連動辺は edgeSegments に含まれない
    expect(result1F.edgeSegments.length).toBe(0);
    expect(result1F.hasUnresolved).toBe(false);
  });

  it('凸型1F (B面側下屋): 連動 3 辺は除外、independent 3 辺のみ含まれる', () => {
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

    // 修正B: 連動辺 (0, 1, 5) は除外、independent 辺 (2, 3, 4) のみ
    expect(result1F.edgeSegments.length).toBe(3);
    const indices = result1F.edgeSegments.map(s => s.edge1FIndex).sort((a, b) => a - b);
    expect(indices).toEqual([2, 3, 4]);
    // 全 independent セグメントは startConstraint != collinear-with-2F
    result1F.edgeSegments.forEach(seg => {
      expect(seg.startConstraint.kind).not.toBe('collinear-with-2F');
    });
  });

  it('B面側下屋 (連動なし、中央のみ突き出し): shed 3 辺のみ', () => {
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

    // 修正B: 連動辺 (0, 1, 5, 6, 7) は除外、independent (2, 3, 4) のみ
    expect(result1F.edgeSegments.length).toBe(3);
    const indices = result1F.edgeSegments.map(s => s.edge1FIndex).sort((a, b) => a - b);
    expect(indices).toEqual([2, 3, 4]);
  });

  it('B面側に下屋 2 個: independent 6 辺のみ', () => {
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

    // 修正B: 連動辺 (0, 1, 5, 9, 10, 11) は除外、independent (2,3,4,6,7,8) のみ
    expect(result1F.edgeSegments.length).toBe(6);
    const indices = result1F.edgeSegments.map(s => s.edge1FIndex).sort((a, b) => a - b);
    expect(indices).toEqual([2, 3, 4, 6, 7, 8]);
  });

  it('scaffoldStart 伝搬: 1F の最初のセグメントは最初の柱仕込み点が指す 1F 辺', () => {
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
    const distances2F: Record<number, number> = {};
    for (let i = 0; i < 6; i++) distances2F[i] = 900;
    const distances1F: Record<number, number> = {};
    for (let i = 0; i < 8; i++) distances1F[i] = 900;

    // 重大変更 (B1/B2): 2F polygon は分割済み前提
    const norm2F = splitBuilding2FAt1FVertices(building1F, building2F);
    const result2F = computeBothmode2FLayout(norm2F, building1F, distances2F, distances1F, ss);
    const result1F = computeBothmode1FLayout(building1F, norm2F, result2F, distances1F);

    // 最初の柱は (9000,2000)、edge1FIndex=2 (shed 上辺)。
    // 連動辺除外後、最初に来る independent は edge 2。
    const first = result1F.edgeSegments[0];
    expect(first.edge1FIndex).toBe(2);
    expect(first.startConstraint.kind).toBe('pillar-from-2F');
  });

  it('endConstraint: 次が collinear なら collinear-with-2F、両側 independent なら next-1F-face (locked 概念廃止後は isLocked=false 固定)', () => {
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

    // edge 4 (shed の下辺、Y=5000) → 次 edge 5 (collinear) → endConstraint=collinear-with-2F
    const edge4Seg = result1F.edgeSegments.find(s => s.edge1FIndex === 4);
    expect(edge4Seg).toBeDefined();
    expect(edge4Seg!.endConstraint.kind).toBe('collinear-with-2F');
    // Phase H-3d-2 仕様簡素化: locked 概念廃止、isLocked 常に false
    expect(edge4Seg!.isLocked).toBe(false);

    // edge 3 (shed 東面) → 次 edge 4 (independent) → endConstraint=next-1F-face
    const edge3Seg = result1F.edgeSegments.find(s => s.edge1FIndex === 3);
    expect(edge3Seg).toBeDefined();
    expect(edge3Seg!.endConstraint.kind).toBe('next-1F-face');
    expect(edge3Seg!.isLocked).toBe(false);
  });
});
