import { describe, it, expect } from 'vitest';
import { computeAutoLayoutSequential } from '../autoLayoutUtils';
import type { BuildingShape } from '@/types';

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

  it('全辺950希望なら端数発生で hasUnresolved = true', () => {
    // 各辺 effective = 950 + 9000 + 950 = 10900
    // 1800×6 = 10800 (rem -100), 1800×6 + 200 = 11000 (rem +100) → 挟む2択
    const distances = { 0: 950, 1: 950, 2: 950, 3: 950 };
    const result = computeAutoLayoutSequential(square9000, distances);
    expect(result.hasUnresolved).toBe(true);
    const hasMultiple = result.edgeResults.some(er => er.candidates.length === 2);
    expect(hasMultiple).toBe(true);
  });

  it('userSelections で次の辺の始点離れに反映される', () => {
    const distances = { 0: 950, 1: 950, 2: 950, 3: 950 };

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
});
