import { describe, it, expect, beforeAll } from 'vitest';
import {
  getBuildingEdgesClockwise,
  splitBuilding2FAt1FVertices,
  splitBuilding1FAtBuilding2FVertices,
  computeBothmode2FLayout,
} from '../autoLayoutUtils';
import type { BuildingShape, ScaffoldStartConfig } from '@/types';

// bothmode 複合バグ調査用 失敗テスト。
// 詳細: docs/bothmode-multi-bug-investigation.md
//
// 全 6 件のテストは「現状コードに対する期待 (= 修正後の正しい挙動)」 を assert する。
// 本ファイルが追加された時点では 6 件すべて FAIL する想定。
// 修正実装が完了すれば PASS に転じる。

// 共通: 矩形 9000×7000 mm の 2F (raw [NW, NE, SE, SW] CW from NW)
// 注意: building.points はグリッド単位 (1 grid = 10 mm)。
// 9000mm 壁 → 点座標差 = 900。 7000mm 壁 → 点座標差 = 700。
// (= getBuildingEdgesClockwise: lengthMm = lenGrid * 10)
// 北/南壁 9000mm、 東/西壁 7000mm (= 観測点 C の師匠入力と同寸)
const buildingRect2F: BuildingShape = {
  id: 'b2', type: 'polygon',
  points: [
    { x: 0, y: 0 },         // 0: NW
    { x: 900, y: 0 },       // 1: NE
    { x: 900, y: 700 },     // 2: SE
    { x: 0, y: 700 },       // 3: SW
  ],
  fill: '#000', floor: 2,
};

// =====================================================================
// 観測点 A: bothmode 入力欄ラベル方角誤り
// =====================================================================
describe('observation A: bothmode 入力欄ラベル (raw face-based) と ⭐-relative 期待値の乖離', () => {
  it('⭐ at SW: 入力欄ラベルは ⭐-relative ["B","C","D","A"] であるべきだが raw ["A","B","C","D"] のまま', () => {
    // 入力欄が表示する label は AutoLayoutModal.tsx L1295-1302 の `edges.map(edge => ...)` から来る。
    // bothmode では `edges = getBuildingEdgesClockwise(building)` (= raw、 L375-381 で relabel 未適用)。
    const rawEdges = getBuildingEdgesClockwise(buildingRect2F);
    const inputFieldLabels = rawEdges.map(e => e.label);

    // 期待: ⭐ at SW (vertex 3) 起点 CW 巡回で ⭐-relative ラベル付け
    //   k=0 edges[3]=west="A", k=1 edges[0]=north="B",
    //   k=2 edges[1]=east="C",  k=3 edges[2]=south="D"
    // → 物理 index 順では ["B","C","D","A"]
    expect(inputFieldLabels).toEqual(['B', 'C', 'D', 'A']);
    // 現コード: ["A","B","C","D"] (= raw face-based) → FAILS
  });
});

// =====================================================================
// 観測点 B: 固定マーク label 不整合 (= 観測点 A と同根)
// =====================================================================
describe('observation B: locked edge labels (face-based) が ⭐-relative 期待値と乖離 (= 観測点 A と同根)', () => {
  it('⭐ at SE: locked labels は ⭐-relative ["A","D"] であるべきだが face-based ["B","C"]', () => {
    // 固定マーク対象は AutoLayoutModal.tsx L384-392 の lockedEdgeIndices で決まり、
    // 物理対象 (= ⭐ adjacent の物理 edge) は正しい。 表示ラベルが入力欄の label を流用するため
    // raw face-based のまま表示される (= 観測点 A の波及)。
    const rawEdges = getBuildingEdgesClockwise(buildingRect2F);
    const startIdx = 2;  // SE = vertex 2 in raw [NW, NE, SE, SW]
    const n = rawEdges.length;
    const lockedIdxs = new Set([
      rawEdges[startIdx].index,
      rawEdges[(startIdx - 1 + n) % n].index,
    ]);
    const inputLabels = rawEdges
      .filter(e => lockedIdxs.has(e.index))
      .map(e => e.label)
      .sort();

    // 期待: ⭐ at SE での ⭐-relative。 locked physical = south + east = 出辺(2A) + 閉じ辺(2D)
    expect(inputLabels).toEqual(['A', 'D']);
    // 現コード: ["B","C"] (= edge[1]=east="B" + edge[2]=south="C", face-based) → FAILS
  });

  it('⭐ at SW: locked labels は ⭐-relative ["A","D"] であるべきだが face-based ["C","D"]', () => {
    const rawEdges = getBuildingEdgesClockwise(buildingRect2F);
    const startIdx = 3;  // SW = vertex 3
    const n = rawEdges.length;
    const lockedIdxs = new Set([
      rawEdges[startIdx].index,
      rawEdges[(startIdx - 1 + n) % n].index,
    ]);
    const inputLabels = rawEdges
      .filter(e => lockedIdxs.has(e.index))
      .map(e => e.label)
      .sort();

    // 期待: ⭐ at SW での ⭐-relative。 locked physical = west + south = 出辺(2A) + 閉じ辺(2D)
    expect(inputLabels).toEqual(['A', 'D']);
    // 現コード: ["C","D"] (= edge[2]=south="C" + edge[3]=west="D", face-based) → FAILS
  });
});

// =====================================================================
// 観測点 C: distances index 不一致による +12mm ずれ
// =====================================================================
describe('observation C: distances state は raw building の edge.index でキー保存、 cascade は normalized building の edge.index で読み出し → split で頂点挿入されると key 乖離', () => {
  // 凸型 1F: 矩形 9000×7000 mm + 北側中央突き出し 3000×1000 mm
  // 注意: building.points はグリッド単位 (1 grid = 10 mm)。
  //   矩形主体: 9m × 7m → 座標 900 × 700
  //   突き出し: 3m × 1m、 中央配置 (x:[300,600], y:[-100, 0])
  // 1F vertices (CW from NW、 grid 単位):
  //   0: (0,0)       NW (= 2F の NW と共有)
  //   1: (300,0)     splitL (突き出し base 左、 2F の北辺上)
  //   2: (300,-100)  突き出し top-left
  //   3: (600,-100)  突き出し top-right
  //   4: (600,0)     splitR (突き出し base 右、 2F の北辺上)
  //   5: (900,0)     NE (= 2F と共有)
  //   6: (900,700)   SE
  //   7: (0,700)     SW
  const buildingConvex1F: BuildingShape = {
    id: 'b1c', type: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: -100 },
      { x: 600, y: -100 },
      { x: 600, y: 0 },
      { x: 900, y: 0 },
      { x: 900, y: 700 },
      { x: 0, y: 700 },
    ],
    fill: '#000', floor: 1,
  };

  // setup 共通化 (beforeAll で 1 回計算)
  let result: ReturnType<typeof computeBothmode2FLayout>;
  let seg2A: ReturnType<typeof computeBothmode2FLayout>['edgeSegments'][number];

  beforeAll(() => {
    const normalizedBuilding2F = splitBuilding2FAt1FVertices(buildingConvex1F, buildingRect2F);
    const normalizedBuilding1F = splitBuilding1FAtBuilding2FVertices(buildingConvex1F, buildingRect2F);

    // 師匠の入力 (face-based UI 経由 = raw key 0..3 で保存)
    // 2A=北=888, 2B=東=900, 2C=南=900, 2D=西=888
    const distances2F: Record<number, number> = { 0: 888, 1: 900, 2: 900, 3: 888 };
    // 1F 突き出し 3 辺 (uncovered): 1A=1B=1C=888
    const distances1F: Record<number, number> = { 1: 888, 2: 888, 3: 888 };

    // ⭐ at SE: normalizedBuilding2F.points = [NW, splitL, splitR, NE, SE, SW] (6 頂点)
    // SE の normalized index = 4
    const scaffoldStart: ScaffoldStartConfig = {
      corner: 'se',
      startVertexIndex: 4,
      face1DistanceMm: 900,  // 南 (= face1, horizontal out edge)
      face2DistanceMm: 900,  // 東 (= face2, vertical in edge)
      face1FirstHandrail: 1800,
      face2FirstHandrail: 1800,
      floor: 2,
    };

    result = computeBothmode2FLayout(
      normalizedBuilding2F, normalizedBuilding1F,
      distances2F, distances1F, scaffoldStart,
    );

    // 2A = south = normalized edge index 4 (cascade k=0 で出 edge)
    const found = result.edgeSegments.find(s => s.edge2FIndex === 4);
    if (!found) throw new Error('seg2A (edge2FIndex=4) not found in result');
    seg2A = found;
  });

  it('1800×6=10800 候補の actualEndDistanceMm = 900 (= 仕様 b で 10800-9000-900) のはずだが 912 を返す', () => {
    const candidate10800 = seg2A.candidates.find(c => {
      const total = c.rails.reduce((a, b) => a + b, 0);
      return total === 10800 && c.side === 'larger';
    });
    expect(candidate10800).toBeDefined();

    // 期待 (仕様 b、 distances key が正しく解決されれば):
    //   prev = distances[normalized 3=east] = 900 (= 「2B 東」 入力値が east の distance に解決)
    //   next = distances[normalized 5=west] = 888 (= 「2D 西」 入力値が west の distance に解決)
    //   1800×6 のとき targetEnd = 10800 - 9000 - 900 = 900
    // 実際 (raw vs normalized key 不一致):
    //   distances[3] = 888 (= raw key 3 = 西の値が east として読まれる)
    //   distances[5] = undefined → fallback 900 (= west default)
    //   1800×6 のとき targetEnd = 10800 - 9000 - 888 = 912
    expect(candidate10800!.actualEndDistanceMm).toBe(900);
    // → FAILS (実際 912)
  });

  it('1800×5+900+600+200=10700 候補の actualEndDistanceMm = 800 のはずだが 812 を返す', () => {
    const candidate10700 = seg2A.candidates.find(c => {
      const total = c.rails.reduce((a, b) => a + b, 0);
      return total === 10700 && c.side === 'smaller';
    });
    expect(candidate10700).toBeDefined();

    // 期待: targetEnd = 10700 - 9000 - 900 = 800
    // 実際 (key 不一致): targetEnd = 10700 - 9000 - 888 = 812
    expect(candidate10700!.actualEndDistanceMm).toBe(800);
    // → FAILS (実際 812)
  });

  it('seg2A.desiredEndDistanceMm = 888 (= 西の入力値、 仕様 b) のはずだが 900 (= default fallback) を返す', () => {
    // 期待: distances[normalized 5 = west] = 888 (= raw key 3 = 西の値が west の distance に解決)
    // 実際: distances[5] = undefined → fallback 900 (= autoLayoutUtils.ts:1564 の `?? 900`)
    expect(seg2A.desiredEndDistanceMm).toBe(888);
    // → FAILS (実際 900)
  });
});
