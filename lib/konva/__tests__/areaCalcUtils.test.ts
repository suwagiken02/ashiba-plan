import { describe, it, expect } from 'vitest';
import {
  computePolygonArea,
  getFloorArea,
  findHostBuilding,
  computeSpanArea,
  groupHandrailsByFace,
  computeScaffoldAreaSummary,
  computeBuildingFloorAreaSummary,
} from '../areaCalcUtils';
import type { BuildingShape, Handrail, HeightMarker } from '@/types';

// === Helpers ===
function makeRect(id: string, w: number, h: number, x = 0, y = 0, floor?: 1 | 2): BuildingShape {
  return {
    id,
    type: 'polygon',
    fill: '#888',
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    floor,
  };
}

function makeHandrail(
  id: string,
  x: number,
  y: number,
  lengthMm: 1800 | 1500 | 1200 | 1000 | 900 = 1800,
  direction: 'horizontal' | 'vertical' = 'horizontal',
): Handrail {
  return { id, x, y, lengthMm, direction, color: '#000' };
}

function makeMarker(id: string, buildingId: string, edgeIndex: number, t: number, heightMm: number): HeightMarker {
  return { id, buildingId, edgeIndex, t, heightMm };
}

// === computePolygonArea ===
describe('computePolygonArea', () => {
  it('returns 1 m² for 1m × 1m square (= 100×100 grid)', () => {
    expect(computePolygonArea([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ])).toBe(1);
  });

  it('returns same value for CW and CCW (= 絶対値)', () => {
    const cw = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const ccw = [...cw].reverse();
    expect(computePolygonArea(cw)).toBe(computePolygonArea(ccw));
  });

  it('handles L-shape correctly (= 12 m²)', () => {
    // 400×400 - 200×200 切欠き = 120,000 grid² = 12 m²
    expect(computePolygonArea([
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 },
      { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 },
    ])).toBe(12);
  });

  it('handles triangle (= 2 m²)', () => {
    // 200×200/2 = 20,000 grid² = 2 m²
    expect(computePolygonArea([
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 },
    ])).toBe(2);
  });

  it('returns 0 for degenerate (= 3 点未満)', () => {
    expect(computePolygonArea([])).toBe(0);
    expect(computePolygonArea([{ x: 0, y: 0 }])).toBe(0);
    expect(computePolygonArea([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe(0);
  });
});

// === getFloorArea ===
describe('getFloorArea', () => {
  it('returns area of 5m × 4m rect (= 20 m²)', () => {
    expect(getFloorArea(makeRect('b1', 500, 400))).toBe(20);
  });

  it('returns area of L-shape building (= 12 m²)', () => {
    const b: BuildingShape = {
      id: 'L1', type: 'polygon', fill: '#888',
      points: [
        { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 },
        { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 },
      ],
    };
    expect(getFloorArea(b)).toBe(12);
  });

  it('handles building with no roof (= uses building.points)', () => {
    expect(getFloorArea(makeRect('b1', 100, 100))).toBe(1);
  });
});

// === findHostBuilding ===
describe('findHostBuilding', () => {
  it('finds nearest building edge for nearby handrail', () => {
    const b = makeRect('b1', 1000, 100);
    const h = makeHandrail('h1', 100, -5, 1800, 'horizontal');
    const result = findHostBuilding(h, [b]);
    expect(result).not.toBeNull();
    expect(result!.building.id).toBe('b1');
    expect(result!.edgeIndex).toBe(0);
  });

  it('selects nearer building when 2 exist', () => {
    const b1 = makeRect('b1', 100, 100, 0, 0);
    const b2 = makeRect('b2', 100, 100, 500, 0);
    const h = makeHandrail('h1', 10, -5, 1800, 'horizontal');
    expect(findHostBuilding(h, [b1, b2])!.building.id).toBe('b1');
  });

  it('returns null when handrail too far (= > 2000mm = 200 grid)', () => {
    const b = makeRect('b1', 100, 100);
    const h = makeHandrail('h1', 10, -300, 1800, 'horizontal');
    expect(findHostBuilding(h, [b])).toBeNull();
  });

  it('filters by floorFilter (= 1F / 2F)', () => {
    const b1 = makeRect('b1', 100, 100, 0, 0, 1);
    const b2 = makeRect('b2', 100, 100, 0, 0, 2);
    const h = makeHandrail('h1', 10, -5, 1800, 'horizontal');
    expect(findHostBuilding(h, [b1, b2], { floorFilter: 2 })!.building.id).toBe('b2');
    expect(findHostBuilding(h, [b1, b2], { floorFilter: 1 })!.building.id).toBe('b1');
  });

  it('returns null when no building of specified floor exists', () => {
    const b = makeRect('b1', 100, 100, 0, 0, 1);
    const h = makeHandrail('h1', 10, -5, 1800, 'horizontal');
    expect(findHostBuilding(h, [b], { floorFilter: 2 })).toBeNull();
  });
});

// === computeSpanArea ===
describe('computeSpanArea', () => {
  it('computes area with α=0 (= lengthMm × heightAvg ÷ 1e6)', () => {
    // 建物 10m × 1m、 北辺中央に H=5000mm マーカー (= 全周一定値)
    const b = makeRect('b1', 1000, 100);
    const m = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const h = makeHandrail('h1', 100, -5, 1800, 'horizontal');
    // 1800 × 5000 ÷ 1e6 = 9 m²
    expect(computeSpanArea(h, [b], [m], 0)).toBe(9);
  });

  it('applies α = -900 mm', () => {
    const b = makeRect('b1', 1000, 100);
    const m = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const h = makeHandrail('h1', 100, -5, 1800, 'horizontal');
    // 1800 × (5000 - 900) ÷ 1e6 = 7.38 m²
    expect(computeSpanArea(h, [b], [m], -900)).toBeCloseTo(7.38, 5);
  });

  it('applies α = +450 mm', () => {
    const b = makeRect('b1', 1000, 100);
    const m = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const h = makeHandrail('h1', 100, -5, 1800, 'horizontal');
    // 1800 × (5000 + 450) ÷ 1e6 = 9.81 m²
    expect(computeSpanArea(h, [b], [m], 450)).toBeCloseTo(9.81, 5);
  });

  it('applies α = +900 mm', () => {
    const b = makeRect('b1', 1000, 100);
    const m = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const h = makeHandrail('h1', 100, -5, 1800, 'horizontal');
    // 1800 × (5000 + 900) ÷ 1e6 = 10.62 m²
    expect(computeSpanArea(h, [b], [m], 900)).toBeCloseTo(10.62, 5);
  });

  it('returns null when building has no markers', () => {
    const b = makeRect('b1', 1000, 100);
    const h = makeHandrail('h1', 100, -5, 1800, 'horizontal');
    expect(computeSpanArea(h, [b], [], 0)).toBeNull();
  });

  it('returns null when handrail too far from building', () => {
    const b = makeRect('b1', 1000, 100);
    const m = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const h = makeHandrail('h1', 100, -300, 1800, 'horizontal');
    expect(computeSpanArea(h, [b], [m], 0)).toBeNull();
  });

  it('uses floorTag=1 to select 1F building', () => {
    const b1 = makeRect('b1', 1000, 100, 0, 0, 1);
    const b2 = makeRect('b2', 1000, 100, 0, 0, 2);
    const m1 = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const m2 = makeMarker('m2', 'b2', 0, 0.5, 9000);
    const h = makeHandrail('h1', 100, -5, 1800, 'horizontal');
    // floorTag=1 → b1 (5000mm) → 9 m²
    expect(computeSpanArea(h, [b1, b2], [m1, m2], 0, 1)).toBe(9);
  });

  it('uses floorTag=2 to select 2F building', () => {
    const b1 = makeRect('b1', 1000, 100, 0, 0, 1);
    const b2 = makeRect('b2', 1000, 100, 0, 0, 2);
    const m1 = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const m2 = makeMarker('m2', 'b2', 0, 0.5, 9000);
    const h = makeHandrail('h1', 100, -5, 1800, 'horizontal');
    // floorTag=2 → b2 (9000mm) → 1800 × 9000 ÷ 1e6 = 16.2 m²
    expect(computeSpanArea(h, [b1, b2], [m1, m2], 0, 2)).toBe(16.2);
  });
});

// === groupHandrailsByFace ===
describe('groupHandrailsByFace', () => {
  it('groups handrails on same edge together', () => {
    const b = makeRect('b1', 1000, 100);
    const h1 = makeHandrail('h1', 100, -5);
    const h2 = makeHandrail('h2', 500, -5);
    const result = groupHandrailsByFace([h1, h2], [b]);
    expect(result.faceGroups.size).toBe(1);
    expect(result.faceGroups.get('b1-0')?.length).toBe(2);
  });

  it('groups handrails on different edges separately', () => {
    const b = makeRect('b1', 1000, 1000);
    const h1 = makeHandrail('h1', 100, -5, 1800, 'horizontal');
    const h2 = makeHandrail('h2', 1005, 100, 1800, 'vertical');
    const result = groupHandrailsByFace([h1, h2], [b]);
    expect(result.faceGroups.size).toBe(2);
  });

  it('groups handrails on different buildings separately', () => {
    const b1 = makeRect('b1', 1000, 100, 0, 0);
    const b2 = makeRect('b2', 1000, 100, 0, 500);
    const h1 = makeHandrail('h1', 100, -5);
    const h2 = makeHandrail('h2', 100, 495);
    const result = groupHandrailsByFace([h1, h2], [b1, b2]);
    expect(result.faceGroups.size).toBe(2);
    expect(result.faceGroups.has('b1-0')).toBe(true);
    expect(result.faceGroups.has('b2-0')).toBe(true);
  });

  it('separates floors by designation', () => {
    const b1 = makeRect('b1', 1000, 100, 0, 0, 1);
    const b2 = makeRect('b2', 1000, 100, 0, 0, 2);
    const h1 = makeHandrail('h1', 100, -5);
    const h2 = makeHandrail('h2', 100, -5);
    const designation = new Map<string, 1 | 2>([['h1', 1], ['h2', 2]]);
    const result = groupHandrailsByFace([h1, h2], [b1, b2], designation);
    expect(result.faceGroups.size).toBe(2);
    expect(result.faceGroups.has('b1-0')).toBe(true);
    expect(result.faceGroups.has('b2-0')).toBe(true);
  });

  it('works without floorDesignation (= 全建物対象)', () => {
    const b = makeRect('b1', 1000, 100);
    const h = makeHandrail('h1', 100, -5);
    const result = groupHandrailsByFace([h], [b]);
    expect(result.faceGroups.size).toBe(1);
  });

  it('defaults unregistered handrails to 2F when designation is set (= ★12)', () => {
    const b1 = makeRect('b1', 1000, 100, 0, 0, 1);
    const b2 = makeRect('b2', 1000, 100, 0, 0, 2);
    const h = makeHandrail('h1', 100, -5);
    const designation = new Map<string, 1 | 2>(); // empty Map
    const result = groupHandrailsByFace([h], [b1, b2], designation);
    expect(result.faceGroups.has('b2-0')).toBe(true);
  });

  it('separates uncalculable handrails', () => {
    const b = makeRect('b1', 1000, 100);
    const h1 = makeHandrail('h1', 100, -5);
    const h2 = makeHandrail('h2', 100, -300); // 遠すぎ
    const result = groupHandrailsByFace([h1, h2], [b]);
    expect(result.faceGroups.size).toBe(1);
    expect(result.uncalculable.length).toBe(1);
    expect(result.uncalculable[0].id).toBe('h2');
  });
});

// === computeScaffoldAreaSummary ===
describe('computeScaffoldAreaSummary', () => {
  it('aggregates total + face breakdown', () => {
    const b = makeRect('b1', 1000, 100);
    const m = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const h1 = makeHandrail('h1', 100, -5);
    const h2 = makeHandrail('h2', 500, -5);
    const result = computeScaffoldAreaSummary([h1, h2], [b], [m], 0);
    expect(result.faceAreas.get('b1-0')).toBe(18);
    expect(result.total).toBe(18);
    expect(result.uncalculable.length).toBe(0);
  });

  it('separates uncalculable handrails', () => {
    const b = makeRect('b1', 1000, 100);
    const m = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const h1 = makeHandrail('h1', 100, -5);
    const h2 = makeHandrail('h2', 100, -300);
    const result = computeScaffoldAreaSummary([h1, h2], [b], [m], 0);
    expect(result.total).toBe(9);
    expect(result.uncalculable.length).toBe(1);
  });

  it('returns 0 total with empty handrails', () => {
    const b = makeRect('b1', 1000, 100);
    const m = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const result = computeScaffoldAreaSummary([], [b], [m], 0);
    expect(result.total).toBe(0);
    expect(result.uncalculable.length).toBe(0);
  });

  it('separates floors by designation, byFloor sums to total', () => {
    const b1 = makeRect('b1', 1000, 100, 0, 0, 1);
    const b2 = makeRect('b2', 1000, 100, 0, 0, 2);
    const m1 = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const m2 = makeMarker('m2', 'b2', 0, 0.5, 9000);
    const h1 = makeHandrail('h1', 100, -5);
    const h2 = makeHandrail('h2', 100, -5);
    const designation = new Map<string, 1 | 2>([['h1', 1], ['h2', 2]]);
    const result = computeScaffoldAreaSummary([h1, h2], [b1, b2], [m1, m2], 0, designation);
    expect(result.byFloor.floor1).toBe(9);
    expect(result.byFloor.floor2).toBe(16.2);
    expect(result.total).toBeCloseTo(25.2, 5);
  });

  it('treats all handrails as floor1 when designation undefined', () => {
    const b = makeRect('b1', 1000, 100);
    const m = makeMarker('m1', 'b1', 0, 0.5, 5000);
    const h = makeHandrail('h1', 100, -5);
    const result = computeScaffoldAreaSummary([h], [b], [m], 0);
    expect(result.byFloor.floor1).toBe(9);
    expect(result.byFloor.floor2).toBe(0);
  });
});

// === computeBuildingFloorAreaSummary ===
describe('computeBuildingFloorAreaSummary', () => {
  it('returns floor1 only for 1F buildings (= 1 + 4 = 5 m²)', () => {
    const b1 = makeRect('b1', 100, 100, 0, 0, 1);
    const b2 = makeRect('b2', 200, 200, 0, 0, 1);
    const result = computeBuildingFloorAreaSummary([b1, b2]);
    expect(result.floor1).toBe(5);
    expect(result.floor2).toBe(0);
    expect(result.total).toBe(5);
  });

  it('returns floor2 only for 2F buildings', () => {
    const b = makeRect('b1', 100, 100, 0, 0, 2);
    const result = computeBuildingFloorAreaSummary([b]);
    expect(result.floor1).toBe(0);
    expect(result.floor2).toBe(1);
    expect(result.total).toBe(1);
  });

  it('handles mixed 1F + 2F', () => {
    const b1 = makeRect('b1', 100, 100, 0, 0, 1);
    const b2 = makeRect('b2', 200, 200, 0, 0, 2);
    const result = computeBuildingFloorAreaSummary([b1, b2]);
    expect(result.floor1).toBe(1);
    expect(result.floor2).toBe(4);
    expect(result.total).toBe(5);
  });

  it('treats undefined floor as 1F', () => {
    const b = makeRect('b1', 100, 100);
    const result = computeBuildingFloorAreaSummary([b]);
    expect(result.floor1).toBe(1);
    expect(result.floor2).toBe(0);
  });

  it('returns all 0 for empty buildings', () => {
    const result = computeBuildingFloorAreaSummary([]);
    expect(result.floor1).toBe(0);
    expect(result.floor2).toBe(0);
    expect(result.total).toBe(0);
  });
});
