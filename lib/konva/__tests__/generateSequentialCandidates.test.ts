import { describe, it, expect } from 'vitest';
import { generateSequentialCandidates } from '../autoLayoutUtils';

describe('generateSequentialCandidates', () => {
  it('凸コーナー: 希望ぴったりなら1候補だけ返す', () => {
    // 辺3000mm、始点900、希望終点900、前=凸、次=凸
    // 有効長 = 900 + 3000 + 900 = 4800
    // 1800×2 + 1200 = 4800 (exact)
    const result = generateSequentialCandidates(3000, 900, 900, true, true);
    expect(result.length).toBe(1);
    expect(result[0].diffFromDesired).toBe(0);
    expect(result[0].actualEndDistanceMm).toBe(900);
  });

  it('凸コーナー: 端数あれば挟む2択', () => {
    // 辺3000mm、始点900、希望終点950、前=凸、次=凸
    // 有効長 = 4850
    const result = generateSequentialCandidates(3000, 900, 950, true, true);
    expect(result.length).toBe(2);

    const smaller = result.find(r => r.diffFromDesired < 0);
    const larger = result.find(r => r.diffFromDesired > 0);
    expect(smaller).toBeDefined();
    expect(larger).toBeDefined();
    expect(smaller!.actualEndDistanceMm).toBe(900);
    expect(larger!.actualEndDistanceMm).toBe(1000);
  });

  it('凹コーナー(次): 凹の式で計算', () => {
    // 辺2000mm、始点900、希望終点950、前=凸、次=凹
    // 有効長 = 900 + 2000 - 950 = 1950
    const result = generateSequentialCandidates(2000, 900, 950, true, false);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(2);

    // 各候補の actualEndDistanceMm が凹の式で計算されてるか
    for (const r of result) {
      const calculated = 900 + 2000 - r.totalMm;
      expect(r.actualEndDistanceMm).toBe(calculated);
    }
  });

  it('enabledSizes が空なら空配列', () => {
    const result = generateSequentialCandidates(2000, 900, 900, true, true, []);
    expect(result).toEqual([]);
  });

  it('凹→凸（H面のような場合）: 始点側引く', () => {
    // 辺2000、始点900、終点900、前=凹、次=凸
    // 有効長 = -900 + 2000 + 900 = 2000
    // 1800+200 = 2000 (exact)
    const result = generateSequentialCandidates(2000, 900, 900, false, true);
    expect(result.length).toBe(1);
    expect(result[0].diffFromDesired).toBe(0);
    expect(result[0].actualEndDistanceMm).toBe(900);
  });

  it('凸→凹（B面のような場合）: 終点側引く', () => {
    // 辺2000、始点900、終点900、前=凸、次=凹
    // 有効長 = 900 + 2000 - 900 = 2000
    // 1800+200 = 2000 (exact)
    const result = generateSequentialCandidates(2000, 900, 900, true, false);
    expect(result.length).toBe(1);
    expect(result[0].diffFromDesired).toBe(0);
    expect(result[0].actualEndDistanceMm).toBe(900);
  });
});
