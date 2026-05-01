import { describe, it, expect } from 'vitest';
import {
  computeBothmode2FLayout,
  splitBuilding2FAt1FVertices,
} from '../autoLayoutUtils';
import type { BuildingShape, ScaffoldStartConfig } from '@/types';

// Phase H-3d-2 重大変更 (B1/B2 概念導入): bothmode 専用の 2F 計算関数のテスト
// 入力 building2F は呼び出し側で splitBuilding2FAt1FVertices 適用済みの想定。
// 各 2F 辺は常に 1 segment として処理される (segmentIndex=0, segmentCount=1)。

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

  it('下屋なし (1F=2F): 4 辺、各 1 segment、柱なし', () => {
    const square: BuildingShape = {
      id: 'b', type: 'polygon',
      points: [
        { x: 0, y: 0 }, { x: 900, y: 0 },
        { x: 900, y: 900 }, { x: 0, y: 900 },
      ],
      fill: '#000', floor: 1,
    };
    const distances = { 0: 900, 1: 900, 2: 900, 3: 900 };
    // 1F=2F なので分割しても変化なし
    const norm2F = splitBuilding2FAt1FVertices(square, square);
    const result = computeBothmode2FLayout(norm2F, square, distances, distances, ss);
    expect(result.edgeSegments.length).toBe(4);
    result.edgeSegments.forEach(seg => {
      expect(seg.segmentCount).toBe(1);
      expect(seg.segmentIndex).toBe(0);
      expect(seg.desiredEndSource.kind).toBe('next-2F-face');
    });
  });

  it('B 面側下屋 (連動なし): 分割後 5 辺、B1/B2 が独立した edge に', () => {
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
    const distances2F = { 0: 900, 1: 900, 2: 900, 3: 900, 4: 900 };
    const distances1F = { 0: 900, 1: 900, 2: 900, 3: 900, 4: 900, 5: 900 };
    // 2F 分割: (9000, 2000) が 2F 東面に投影され、5 辺になる
    const norm2F = splitBuilding2FAt1FVertices(building1F, building2F);
    expect(norm2F.points.length).toBe(5);

    const result = computeBothmode2FLayout(
      norm2F, building1F, distances2F, distances1F, ss,
    );
    // 5 辺、各 1 segment = 計 5 セグメント
    expect(result.edgeSegments.length).toBe(5);
    result.edgeSegments.forEach(seg => {
      expect(seg.segmentCount).toBe(1);
      expect(seg.segmentIndex).toBe(0);
    });

    // edge index 1 (B1, 上半分): 1F 段差ピラー検出 → 1F-face-pillar
    const b1 = result.edgeSegments.find(s => s.edge2FIndex === 1);
    expect(b1).toBeDefined();
    expect(b1!.desiredEndSource.kind).toBe('1F-face-pillar');

    // edge index 2 (B2, 下半分): 終点が 1F 連動辺の起点 → next-2F-face
    const b2 = result.edgeSegments.find(s => s.edge2FIndex === 2);
    expect(b2).toBeDefined();
    expect(b2!.desiredEndSource.kind).toBe('next-2F-face');
  });

  it('B 面側下屋 + 上下とも連動なし: 分割後 6 辺、ピラー 2 本', () => {
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
    // 2F 分割: (9000, 2000) と (9000, 5000) が 2F 東面に投影 → 6 辺
    const norm2F = splitBuilding2FAt1FVertices(building1F, building2F);
    expect(norm2F.points.length).toBe(6);

    const result = computeBothmode2FLayout(
      norm2F, building1F, distances2F, distances1F, ss,
    );
    // 6 辺、各 1 segment
    expect(result.edgeSegments.length).toBe(6);
    // 1F-face-pillar の数 = 2 (= B 面の 2 本の柱)
    const pillarCount = result.edgeSegments.filter(
      s => s.desiredEndSource.kind === '1F-face-pillar'
    ).length;
    expect(pillarCount).toBe(2);
  });

  it('B 面側に下屋 2 個 (連動なし): 分割後 8 辺、ピラー 4 本', () => {
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
    const distances2F: Record<number, number> = {};
    for (let i = 0; i < 8; i++) distances2F[i] = 900;
    const distances1F: Record<number, number> = {};
    for (let i = 0; i < 12; i++) distances1F[i] = 900;
    // 2F 分割: (9000, 1000), (9000, 3000), (9000, 5000), (9000, 7000) が投影 → 8 辺
    const norm2F = splitBuilding2FAt1FVertices(building1F, building2F);
    expect(norm2F.points.length).toBe(8);

    const result = computeBothmode2FLayout(
      norm2F, building1F, distances2F, distances1F, ss,
    );
    expect(result.edgeSegments.length).toBe(8);
    // 1F-face-pillar の数 = 4 (= 2 個下屋 × 2 本ずつ)
    const pillarCount = result.edgeSegments.filter(
      s => s.desiredEndSource.kind === '1F-face-pillar'
    ).length;
    expect(pillarCount).toBe(4);
  });

  it('scaffoldStart 起点辺は最初のセグメント (locked 概念廃止後は isLocked=false)', () => {
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
    // Phase H-3d-2 仕様簡素化: locked 概念廃止。互換性のためフィールドは残るが常に false。
    expect(first.isLocked).toBe(false);
    // 起点辺の startDistanceMm は scaffoldStart.face1DistanceMm (= 900) から取得
    expect(first.startDistanceMm).toBe(900);
  });

  it('cascade: 各セグメントの startDistanceMm が継承される', () => {
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
    // 全 exact ケース → 全セグメント startDistanceMm=900
    result.edgeSegments.forEach(seg => {
      expect(seg.startDistanceMm).toBe(900);
    });
  });
});
