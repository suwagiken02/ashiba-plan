import { describe, it, expect } from 'vitest';
import { splitBuilding1FAtBuilding2FVertices } from '../autoLayoutUtils';
import type { BuildingShape } from '@/types';

// Phase H-3d-2 修正A: 1F ポリゴンに 2F 頂点を投影して頂点挿入
// 部分連動 (1F辺の一部だけが2F辺と同位置) を扱えるよう、ジオメトリ前処理を行う。

describe('splitBuilding1FAtBuilding2FVertices', () => {
  it('下屋なし (1F=2F): 頂点増えない', () => {
    const square: BuildingShape = {
      id: 's', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    const result = splitBuilding1FAtBuilding2FVertices(square, square);
    expect(result.points.length).toBe(4);
    expect(result.points).toEqual(square.points);
  });

  it('1F南面が複合辺: 2F南端頂点 (450,550) を 1F南面に挿入', () => {
    // 昨夜の建物に対応
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
    const result = splitBuilding1FAtBuilding2FVertices(building1F, building2F);
    // 1F南面 (Y=550) に (450,550) が挿入される
    expect(result.points).toEqual([
      { x: -150, y: -150 }, { x: 450, y: -150 },
      { x: 450, y: 150 }, { x: 750, y: 150 },
      { x: 750, y: 550 }, { x: 450, y: 550 },
      { x: -150, y: 550 },
    ]);
  });

  it('2F頂点が1F辺の端点と一致: 重複追加しない', () => {
    // 1F が 2F と同じ範囲、2F 頂点はすべて 1F の頂点としても存在
    const square: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    const same2F: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: 0, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    const result = splitBuilding1FAtBuilding2FVertices(square, same2F);
    // 端点が重複なので何も追加されない
    expect(result.points.length).toBe(4);
  });

  it('複数の2F頂点が1辺上に乗る: 進行順に挿入', () => {
    // 1F が大きな矩形、2F が中央で東西に飛び出した形 (北辺に2点投影)
    const building1F: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: 0, y: 0 }, { x: 12000, y: 0 },
        { x: 12000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    // 2F: 北辺は Y=0 で X=[3000,9000]、北辺の端点 (3000,0) と (9000,0) が
    //     1F北辺 (Y=0, X=[0,12000]) 上に乗る
    const building2F: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: 3000, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 5000 }, { x: 3000, y: 5000 },
      ],
    };
    const result = splitBuilding1FAtBuilding2FVertices(building1F, building2F);
    // 1F北辺は (0,0) → (12000,0)、進行方向は X 増加。
    // (3000,0) → (9000,0) の順で挿入される。
    expect(result.points[0]).toEqual({ x: 0, y: 0 });
    expect(result.points[1]).toEqual({ x: 3000, y: 0 });
    expect(result.points[2]).toEqual({ x: 9000, y: 0 });
    expect(result.points[3]).toEqual({ x: 12000, y: 0 });
  });

  it('CCW 入力でも出力は CW NW 起点に正規化される', () => {
    // 入力 CCW NW 起点
    const building1F: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: -150, y: -150 }, { x: -150, y: 550 },
        { x: 750, y: 550 }, { x: 750, y: 150 },
        { x: 450, y: 150 }, { x: 450, y: -150 },
      ],
    };
    const building2F: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: -150, y: -150 }, { x: 450, y: -150 },
        { x: 450, y: 550 }, { x: -150, y: 550 },
      ],
    };
    const result = splitBuilding1FAtBuilding2FVertices(building1F, building2F);
    // 1F polygon に 2F の (450,550) を投影 → 1F南面 (750,550)→(-150,550) で X=450 を分割
    // CCW を CW NW 起点に正規化した結果:
    expect(result.points).toEqual([
      { x: -150, y: -150 }, { x: 450, y: -150 },
      { x: 450, y: 150 }, { x: 750, y: 150 },
      { x: 750, y: 550 }, { x: 450, y: 550 },
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

  it('副作用なし: 元のポリゴンは変更されない', () => {
    const building1F: BuildingShape = {
      id: '1', type: 'polygon', fill: '#000', floor: 1,
      points: [
        { x: 0, y: 0 }, { x: 12000, y: 0 },
        { x: 12000, y: 7000 }, { x: 0, y: 7000 },
      ],
    };
    const building2F: BuildingShape = {
      id: '2', type: 'polygon', fill: '#000', floor: 2,
      points: [
        { x: 3000, y: 0 }, { x: 9000, y: 0 },
        { x: 9000, y: 5000 }, { x: 3000, y: 5000 },
      ],
    };
    const before1F = JSON.stringify(building1F.points);
    const before2F = JSON.stringify(building2F.points);
    splitBuilding1FAtBuilding2FVertices(building1F, building2F);
    expect(JSON.stringify(building1F.points)).toBe(before1F);
    expect(JSON.stringify(building2F.points)).toBe(before2F);
  });
});
