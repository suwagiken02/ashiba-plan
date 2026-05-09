import { describe, it, expect } from 'vitest';
import { getHeightAtPosition } from '../heightInterpolation';
import { BuildingShape, HeightMarker } from '@/types';

// 4×4 矩形 (= 各辺 4 グリッド、 全周 16)
// edges: 0=N(0,0→4,0)、 1=E(4,0→4,4)、 2=S(4,4→0,4)、 3=W(0,4→0,0)
const rectBuilding: BuildingShape = {
  id: 'rect1',
  type: 'polygon',
  fill: '#888',
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ],
};

// L 字 (= 6 辺、 全周 24)
// edges:
//   0: (0,0)→(4,0) len=4
//   1: (4,0)→(4,2) len=2
//   2: (4,2)→(6,2) len=2
//   3: (6,2)→(6,6) len=4
//   4: (6,6)→(0,6) len=6
//   5: (0,6)→(0,0) len=6
const lBuilding: BuildingShape = {
  id: 'L1',
  type: 'polygon',
  fill: '#888',
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 6, y: 2 },
    { x: 6, y: 6 },
    { x: 0, y: 6 },
  ],
};

describe('getHeightAtPosition', () => {
  it('returns null when no markers exist for the building', () => {
    expect(getHeightAtPosition(rectBuilding, [], 0, 0)).toBe(null);
  });

  it('returns the only marker height when 1 marker exists (= 全周一定値)', () => {
    const markers: HeightMarker[] = [
      { id: 'm1', buildingId: 'rect1', edgeIndex: 0, t: 0, heightMm: 5000 },
    ];
    // どこをクエリしても同じ値
    expect(getHeightAtPosition(rectBuilding, markers, 2, 0.5)).toBe(5000);
    expect(getHeightAtPosition(rectBuilding, markers, 1, 0.0)).toBe(5000);
  });

  it('linearly interpolates between 2 markers (= 矩形、 中間)', () => {
    // A: edge 0 t=0 → 弧長 0、 height 5000
    // B: edge 2 t=0 → 弧長 8、 height 10000
    const markers: HeightMarker[] = [
      { id: 'A', buildingId: 'rect1', edgeIndex: 0, t: 0, heightMm: 5000 },
      { id: 'B', buildingId: 'rect1', edgeIndex: 2, t: 0, heightMm: 10000 },
    ];
    // クエリ: edge 1 t=0.5 → 弧長 6、 A〜B 間で factor 6/8 = 0.75
    // → 5000 + 0.75 * 5000 = 8750
    expect(getHeightAtPosition(rectBuilding, markers, 1, 0.5)).toBe(8750);
  });

  it('handles wrap-around interpolation (= 周回区間)', () => {
    const markers: HeightMarker[] = [
      { id: 'A', buildingId: 'rect1', edgeIndex: 0, t: 0, heightMm: 5000 },
      { id: 'B', buildingId: 'rect1', edgeIndex: 2, t: 0, heightMm: 10000 },
    ];
    // クエリ: edge 3 t=0.5 → 弧長 14、 B〜A 周回 (= 8..16) で factor (14-8)/8 = 0.75
    // → 10000 + 0.75 * (5000 - 10000) = 6250
    expect(getHeightAtPosition(rectBuilding, markers, 3, 0.5)).toBe(6250);
  });

  it('returns null for out-of-range edgeIndex', () => {
    const markers: HeightMarker[] = [
      { id: 'A', buildingId: 'rect1', edgeIndex: 0, t: 0, heightMm: 5000 },
    ];
    expect(getHeightAtPosition(rectBuilding, markers, 99, 0)).toBe(null);
    expect(getHeightAtPosition(rectBuilding, markers, -1, 0)).toBe(null);
  });

  it('returns exact marker height at marker position', () => {
    const markers: HeightMarker[] = [
      { id: 'A', buildingId: 'rect1', edgeIndex: 0, t: 0, heightMm: 5000 },
      { id: 'B', buildingId: 'rect1', edgeIndex: 2, t: 0, heightMm: 10000 },
    ];
    expect(getHeightAtPosition(rectBuilding, markers, 0, 0)).toBe(5000);
    expect(getHeightAtPosition(rectBuilding, markers, 2, 0)).toBe(10000);
  });

  it('filters markers by buildingId (= 別建物のマーカーは無視)', () => {
    const markers: HeightMarker[] = [
      { id: 'A', buildingId: 'rect1', edgeIndex: 0, t: 0, heightMm: 5000 },
      { id: 'X', buildingId: 'other-building', edgeIndex: 0, t: 0, heightMm: 99000 },
    ];
    // rect1 には A のみ → 全周 5000
    expect(getHeightAtPosition(rectBuilding, markers, 2, 0.5)).toBe(5000);
  });

  it('interpolates correctly on L-shape (= 異なる辺長)', () => {
    // A: edge 0 t=0 → 弧長 0、 height 5000
    // B: edge 4 t=0.5 → 弧長 4+2+2+4+0.5*6 = 15、 height 8000
    const markers: HeightMarker[] = [
      { id: 'A', buildingId: 'L1', edgeIndex: 0, t: 0, heightMm: 5000 },
      { id: 'B', buildingId: 'L1', edgeIndex: 4, t: 0.5, heightMm: 8000 },
    ];
    // クエリ: edge 2 t=0 → 弧長 4+2 = 6、 A〜B (= 0..15) で factor 6/15 = 0.4
    // → 5000 + 0.4 * 3000 = 6200
    expect(getHeightAtPosition(lBuilding, markers, 2, 0)).toBe(6200);
  });
});
