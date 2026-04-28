import { describe, it, expect } from 'vitest';
import { generateSequentialCandidates } from '../autoLayoutUtils';

describe('generateSequentialCandidates', () => {
  // Phase H-fix-2a: prevEdgeStartDistanceMm 引数追加
  // requiredRailsTotal = prevEdgeStart + edgeLen + (next 凸 ? +endDist : -endDist)
  // ここでは均一前提 (prevEdgeStart = startDist = 900) なので旧仕様と同じ結果になる。
  it('凸コーナー: 希望ぴったりなら1候補だけ返す', () => {
    // 辺3000mm、前辺900、始点900、希望終点900、前=凸、次=凸
    // 有効長 = 900 + 3000 + 900 = 4800
    // 1800×2 + 1200 = 4800 (exact)
    const result = generateSequentialCandidates(3000, 900, 900, true, true, 900);
    expect(result.length).toBe(1);
    expect(result[0].diffFromDesired).toBe(0);
    expect(result[0].actualEndDistanceMm).toBe(900);
  });

  it('凸コーナー: 端数あれば挟む2択', () => {
    // 辺3000mm、前辺900、希望終点950、前=凸、次=凸
    // 有効長 = 4850
    const result = generateSequentialCandidates(3000, 900, 950, true, true, 900);
    expect(result.length).toBe(2);

    const smaller = result.find(r => r.diffFromDesired < 0);
    const larger = result.find(r => r.diffFromDesired > 0);
    expect(smaller).toBeDefined();
    expect(larger).toBeDefined();
    expect(smaller!.actualEndDistanceMm).toBe(900);
    expect(larger!.actualEndDistanceMm).toBe(1000);
  });

  it('凹コーナー(次): 凹の式で計算', () => {
    // 辺2000mm、前辺900、希望終点950、前=凸、次=凹
    // 有効長 = 900 + 2000 - 950 = 1950
    const result = generateSequentialCandidates(2000, 900, 950, true, false, 900);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(2);

    // 各候補の actualEndDistanceMm が凹の式で計算されてるか
    for (const r of result) {
      const calculated = 900 + 2000 - r.totalMm;
      expect(r.actualEndDistanceMm).toBe(calculated);
    }
  });

  it('enabledSizes が空なら空配列', () => {
    const result = generateSequentialCandidates(2000, 900, 900, true, true, 900, []);
    expect(result).toEqual([]);
  });

  it('凹→凸（H面のような場合）: 始点側引く', () => {
    // 辺2000、前辺900、終点900、前=凹、次=凸
    // 有効長 = -900 + 2000 + 900 = 2000
    // 1800+200 = 2000 (exact)
    const result = generateSequentialCandidates(2000, 900, 900, false, true, 900);
    expect(result.length).toBe(1);
    expect(result[0].diffFromDesired).toBe(0);
    expect(result[0].actualEndDistanceMm).toBe(900);
  });

  it('凸→凹（B面のような場合）: 終点側引く', () => {
    // 辺2000、前辺900、終点900、前=凸、次=凹
    // 有効長 = 900 + 2000 - 900 = 2000
    // 1800+200 = 2000 (exact)
    const result = generateSequentialCandidates(2000, 900, 900, true, false, 900);
    expect(result.length).toBe(1);
    expect(result[0].diffFromDesired).toBe(0);
    expect(result[0].actualEndDistanceMm).toBe(900);
  });

  // Phase H-fix-2a: prevEdgeStartDist と startDist が異なるケースの数学的検証
  it('prevEdgeStart が startDist と異なる場合、requiredRailsTotal は prevEdgeStart 由来', () => {
    // 辺3000mm、前辺=950、自身=900、希望終点=900、前=凸、次=凸
    // 有効長 = 950 + 3000 + 900 = 4850 (= startDist=900 とは無関係)
    // exact 解 (1800×2 + 1200 = 4800) と乖離するため 2 候補
    const result = generateSequentialCandidates(3000, 900, 900, true, true, 950);
    expect(result.length).toBe(2);
    // どちらの候補も rails 合計 - 950 - 3000 = 終端離れ になる
    for (const r of result) {
      expect(r.totalMm - 950 - 3000).toBe(r.actualEndDistanceMm);
    }
  });
});
