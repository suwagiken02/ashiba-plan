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

  // Phase I-1: offsetIdx / variationIdx 拡張
  describe('Phase I-1: offsetIdx / variationIdx 拡張', () => {
    it('デフォルト 0/0 で既存挙動と完全一致 (回帰)', () => {
      // 端数あり: 2 候補返す (smaller / larger)
      const r1 = generateSequentialCandidates(3000, 900, 950, true, true, 900);
      const r2 = generateSequentialCandidates(
        3000, 900, 950, true, true, 900, undefined, undefined, 0, 0, 0, 0,
      );
      expect(r2.length).toBe(r1.length);
      expect(r2[0].rails).toEqual(r1[0].rails);
      expect(r2[1].rails).toEqual(r1[1].rails);
    });

    it('side フィールドが各候補に正しく付く', () => {
      // 端数あり: smaller と larger
      const r = generateSequentialCandidates(3000, 900, 950, true, true, 900);
      expect(r.length).toBe(2);
      const smaller = r.find(c => c.side === 'smaller');
      const larger = r.find(c => c.side === 'larger');
      expect(smaller).toBeDefined();
      expect(larger).toBeDefined();
      expect(smaller!.diffFromDesired).toBeLessThan(0);
      expect(larger!.diffFromDesired).toBeGreaterThan(0);
    });

    it('exact 候補に side="exact" が付く', () => {
      // 全 exact ケース: 1 候補のみ、side='exact'
      const r = generateSequentialCandidates(3000, 900, 900, true, true, 900);
      expect(r.length).toBe(1);
      expect(r[0].side).toBe('exact');
      expect(r[0].diffFromDesired).toBe(0);
    });

    it('largerOffsetIdx を進めると次の delta に飛ぶ', () => {
      // 辺3000mm、前辺900、希望950、凸→凸
      // 有効長 = 900 + 3000 + 950 = 4850 → exact なし
      // larger 側 delta=+1 で 4851 を試すが GCD=100 で見つからない
      // delta=+50 で 4900 = 1800x2+900+400 等 (見つかる) → larger 0番目 = +50
      // delta=+150 で 5000 = 1800x2+1200+200 等 → larger 1番目 = +150
      const r0 = generateSequentialCandidates(
        3000, 900, 950, true, true, 900, undefined, undefined,
        0, 0, 0, 0,
      );
      const r1 = generateSequentialCandidates(
        3000, 900, 950, true, true, 900, undefined, undefined,
        1, 0, 0, 0,  // largerOffsetIdx=1
      );
      const larger0 = r0.find(c => c.side === 'larger');
      const larger1 = r1.find(c => c.side === 'larger');
      expect(larger0).toBeDefined();
      expect(larger1).toBeDefined();
      // 1番目の larger は 0番目より delta が大きい
      expect(larger1!.diffFromDesired).toBeGreaterThan(larger0!.diffFromDesired);
    });

    it('smallerOffsetIdx を進めると次の delta に飛ぶ', () => {
      const r0 = generateSequentialCandidates(
        3000, 900, 950, true, true, 900, undefined, undefined,
        0, 0, 0, 0,
      );
      const r1 = generateSequentialCandidates(
        3000, 900, 950, true, true, 900, undefined, undefined,
        0, 1, 0, 0,  // smallerOffsetIdx=1
      );
      const smaller0 = r0.find(c => c.side === 'smaller');
      const smaller1 = r1.find(c => c.side === 'smaller');
      expect(smaller0).toBeDefined();
      expect(smaller1).toBeDefined();
      // 1番目の smaller は 0番目より delta が大きい (絶対値)
      expect(Math.abs(smaller1!.diffFromDesired))
        .toBeGreaterThan(Math.abs(smaller0!.diffFromDesired));
    });

    it('variationCount がその delta の総 rails パターン数を返す', () => {
      // exact ケース: 4800mm 有効長で多数のパターンがあるはず
      // 1800x2+1200=4800, 1800+1200x2+600=4800, 等
      const r = generateSequentialCandidates(3000, 900, 900, true, true, 900);
      expect(r.length).toBe(1);
      expect(r[0].side).toBe('exact');
      expect(r[0].variationCount).toBeGreaterThanOrEqual(1);
      expect(r[0].variationIdx).toBe(0);
    });

    it('variationIdx を進めると同じ delta 内で別 rails が選ばれる', () => {
      // exact ケース、variationCount > 1 なら別パターンに切替
      const r0 = generateSequentialCandidates(
        3000, 900, 900, true, true, 900, undefined, undefined,
        0, 0, 0, 0,
      );
      // variationCount を確認してから variationIdx=1 を試す
      const exact0 = r0[0];
      if (exact0.variationCount > 1) {
        const r1 = generateSequentialCandidates(
          3000, 900, 900, true, true, 900, undefined, undefined,
          0, 0, 0, 1,  // smallerVariationIdx=1 (exact は smaller を流用)
        );
        const exact1 = r1.find(c => c.side === 'exact');
        expect(exact1).toBeDefined();
        // delta は同じだが rails パターンが異なる
        expect(exact1!.diffFromDesired).toBe(exact0.diffFromDesired);
        expect(exact1!.rails).not.toEqual(exact0.rails);
        expect(exact1!.variationIdx).toBe(1);
      }
    });

    it('offsetIdx で枯れたら配列に含まれない', () => {
      // 極端に大きい offsetIdx を渡す → smaller/larger 共に枯れる
      const r = generateSequentialCandidates(
        3000, 900, 950, true, true, 900, undefined, undefined,
        9999, 9999, 0, 0,
      );
      // exact もないので 0 件 or exact のみ (この入力では exact なし)
      const smaller = r.find(c => c.side === 'smaller');
      const larger = r.find(c => c.side === 'larger');
      expect(smaller).toBeUndefined();
      expect(larger).toBeUndefined();
    });

    it('variationIdx で枯れたら配列に含まれない', () => {
      // exact ケースで variationIdx を variationCount 超えに → exact が含まれない
      const r0 = generateSequentialCandidates(3000, 900, 900, true, true, 900);
      const exact0 = r0[0];
      const exceedIdx = exact0.variationCount + 100;
      const r1 = generateSequentialCandidates(
        3000, 900, 900, true, true, 900, undefined, undefined,
        0, 0, 0, exceedIdx,
      );
      const exact1 = r1.find(c => c.side === 'exact');
      expect(exact1).toBeUndefined();
    });

    it('variation 切替後も rails 合計 = 有効長 を維持', () => {
      // exact ケース、variation を切り替えても rails 合計は同じ (= 4800mm)
      const r0 = generateSequentialCandidates(3000, 900, 900, true, true, 900);
      const exact0 = r0[0];
      if (exact0.variationCount > 1) {
        for (let v = 0; v < exact0.variationCount; v++) {
          const r = generateSequentialCandidates(
            3000, 900, 900, true, true, 900, undefined, undefined,
            0, 0, 0, v,
          );
          const ex = r.find(c => c.side === 'exact');
          expect(ex).toBeDefined();
          expect(ex!.totalMm).toBe(exact0.totalMm);  // 全て 4800mm
        }
      }
    });
  });
});
