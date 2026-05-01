import { describe, it, expect } from 'vitest';
import { splitBuilding2FAt1FVertices } from '../autoLayoutUtils';
import type { BuildingShape } from '@/types';

// Phase H-3d-2 重大変更 (B1/B2 概念導入): 2F polygon に 1F 頂点を投影する
// 1F 段差頂点が 2F 辺上にある場合、その位置で 2F 辺を分割し、bothmode 計算で
// 各 2F 辺が 1 segment として扱えるようにする。

describe('splitBuilding2FAt1FVertices', () => {
  it('下屋なし (1F=2F): 頂点増えない', () => {
    const square: BuildingShape = {
      id: 's', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    const result = splitBuilding2FAt1FVertices(square, square);
    expect(result.points.length).toBe(4);
    expect(result.points).toEqual(square.points);
  });

  it('1F凸型 (東側下屋): 2F東面に段差頂点 (450,150) が挿入される', () => {
    // 朝の建物
    const building2F: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: -150, y: -150 }, { x: 450, y: -150 },
        { x: 450, y: 550 }, { x: -150, y: 550 },
      ],
    };
    const building1F: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: -150, y: -150 }, { x: 450, y: -150 },
        { x: 450, y: 150 }, { x: 750, y: 150 },
        { x: 750, y: 550 }, { x: -150, y: 550 },
      ],
    };
    const result = splitBuilding2FAt1FVertices(building1F, building2F);
    // 2F東面 (450,-150)→(450,550) に 1F の (450,150) が挿入される
    // (750,150) や (750,550) は 2F 辺上にない
    expect(result.points).toEqual([
      { x: -150, y: -150 }, { x: 450, y: -150 },
      { x: 450, y: 150 }, { x: 450, y: 550 },
      { x: -150, y: 550 },
    ]);
  });

  it('1F頂点が2F辺の端点と一致: 重複追加しない', () => {
    const square: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    const same1F: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    const result = splitBuilding2FAt1FVertices(same1F, square);
    expect(result.points.length).toBe(4);
  });

  it('複数の1F頂点が1辺上に乗る: 進行順に挿入', () => {
    // 1F が同じ 2F 北面に 2 つの段差を持つケース (極端な例)
    const building2F: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: 0, y: 0 }, { x: 12000, y: 0 },
        { x: 12000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    // 1F が北側に 2 か所 凹: (3000,0) と (9000,0) の段差頂点が 2F 北面上に乗る
    const building1F: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: 0, y: 0 }, { x: 3000, y: 0 },
        { x: 3000, y: 1000 }, { x: 9000, y: 1000 },
        { x: 9000, y: 0 }, { x: 12000, y: 0 },
        { x: 12000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    const result = splitBuilding2FAt1FVertices(building1F, building2F);
    // 2F 北面 (0,0)→(12000,0) に (3000,0) と (9000,0) が進行順に挿入される
    expect(result.points[0]).toEqual({ x: 0, y: 0 });
    expect(result.points[1]).toEqual({ x: 3000, y: 0 });
    expect(result.points[2]).toEqual({ x: 9000, y: 0 });
    expect(result.points[3]).toEqual({ x: 12000, y: 0 });
  });

  it('CCW 入力でも出力は CW NW 起点に正規化される (頂点順序が崩れない)', () => {
    // canvasStore に CCW で保存されている可能性に対応するため、出力を必ず CW に揃える。
    // 入力 CCW NW 起点: [(-150,-150),(-150,550),(450,550),(450,-150)]
    // 期待出力 CW NW 起点: [(-150,-150),(450,-150),(450,150),(450,550),(-150,550)]
    const building2F: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: -150, y: -150 }, { x: -150, y: 550 },
        { x: 450, y: 550 }, { x: 450, y: -150 },
      ],
    };
    const building1F: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: -150, y: -150 }, { x: 450, y: -150 },
        { x: 450, y: 150 }, { x: 750, y: 150 },
        { x: 750, y: 550 }, { x: -150, y: 550 },
      ],
    };
    const result = splitBuilding2FAt1FVertices(building1F, building2F);
    expect(result.points).toEqual([
      { x: -150, y: -150 }, { x: 450, y: -150 },
      { x: 450, y: 150 }, { x: 450, y: 550 },
      { x: -150, y: 550 },
    ]);
    // shoelace > 0 (CW Y-down 確認)
    let sum = 0;
    for (let i = 0; i < result.points.length; i++) {
      const p1 = result.points[i];
      const p2 = result.points[(i + 1) % result.points.length];
      sum += p1.x * p2.y - p2.x * p1.y;
    }
    expect(sum).toBeGreaterThan(0);
  });

  it('CW 別頂点起点 (SW 起点) でも NW 起点に正規化される', () => {
    // canvasStore に CW で SW 起点で保存されている可能性に対応。
    // 入力 CW SW 起点: [(-150,550),(-150,-150),(450,-150),(450,550)]
    // 期待出力 CW NW 起点: [(-150,-150),(450,-150),(450,150),(450,550),(-150,550)]
    const building2F: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: -150, y: 550 }, { x: -150, y: -150 },
        { x: 450, y: -150 }, { x: 450, y: 550 },
      ],
    };
    const building1F: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: -150, y: -150 }, { x: 450, y: -150 },
        { x: 450, y: 150 }, { x: 750, y: 150 },
        { x: 750, y: 550 }, { x: -150, y: 550 },
      ],
    };
    const result = splitBuilding2FAt1FVertices(building1F, building2F);
    expect(result.points).toEqual([
      { x: -150, y: -150 }, { x: 450, y: -150 },
      { x: 450, y: 150 }, { x: 450, y: 550 },
      { x: -150, y: 550 },
    ]);
  });

  it('副作用なし: 元のポリゴンは変更されない', () => {
    const building2F: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: -150, y: -150 }, { x: 450, y: -150 },
        { x: 450, y: 550 }, { x: -150, y: 550 },
      ],
    };
    const building1F: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: -150, y: -150 }, { x: 450, y: -150 },
        { x: 450, y: 150 }, { x: 750, y: 150 },
        { x: 750, y: 550 }, { x: -150, y: 550 },
      ],
    };
    const before2F = JSON.stringify(building2F.points);
    const before1F = JSON.stringify(building1F.points);
    splitBuilding2FAt1FVertices(building1F, building2F);
    expect(JSON.stringify(building2F.points)).toBe(before2F);
    expect(JSON.stringify(building1F.points)).toBe(before1F);
  });
});
