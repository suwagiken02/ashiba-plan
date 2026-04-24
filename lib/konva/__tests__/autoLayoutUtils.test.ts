import { describe, it, expect } from 'vitest';
import {
  findBestEndCombinations,
  getSectionOfSize,
  getScoreOfSize,
  scoreCombination,
} from '../autoLayoutUtils';
import type { HandrailLengthMm, PriorityConfig } from '@/types';

const DEFAULT_SIZES: HandrailLengthMm[] = [1800, 1200, 900, 600, 400, 300, 200];

describe('findBestEndCombinations - ベースライン', () => {
  // 端数ぴったり系
  it('1800mm ぴったり', () => {
    const result = findBestEndCombinations(1800, DEFAULT_SIZES);
    expect(result).toMatchSnapshot();
  });

  it('1500mm 端数', () => {
    const result = findBestEndCombinations(1500, DEFAULT_SIZES);
    expect(result).toMatchSnapshot();
  });

  it('2100mm 端数', () => {
    const result = findBestEndCombinations(2100, DEFAULT_SIZES);
    expect(result).toMatchSnapshot();
  });

  it('2400mm 端数', () => {
    const result = findBestEndCombinations(2400, DEFAULT_SIZES);
    expect(result).toMatchSnapshot();
  });

  it('3000mm 端数', () => {
    const result = findBestEndCombinations(3000, DEFAULT_SIZES);
    expect(result).toMatchSnapshot();
  });

  it('5400mm 端数', () => {
    const result = findBestEndCombinations(5400, DEFAULT_SIZES);
    expect(result).toMatchSnapshot();
  });

  it('10000mm 長辺', () => {
    const result = findBestEndCombinations(10000, DEFAULT_SIZES);
    expect(result).toMatchSnapshot();
  });

  // エッジケース
  it('0mm', () => {
    const result = findBestEndCombinations(0, DEFAULT_SIZES);
    expect(result).toMatchSnapshot();
  });

  it('100mm 未満の微小辺', () => {
    const result = findBestEndCombinations(50, DEFAULT_SIZES);
    expect(result).toMatchSnapshot();
  });

  // enabledSizes 縮小ケース
  it('1800 と 900 のみ有効', () => {
    const result = findBestEndCombinations(3600, [1800, 900]);
    expect(result).toMatchSnapshot();
  });

  it('大物禁止（900 以下のみ）', () => {
    const result = findBestEndCombinations(3000, [900, 600, 400, 300, 200]);
    expect(result).toMatchSnapshot();
  });
});

describe('getSectionOfSize', () => {
  const config: PriorityConfig = {
    order: [1800, 1200, 900, 600, 400, 300, 200],
    mainCount: 1,
    subCount: 3,
    adjustCount: 3,
  };

  it('メインセクション', () => {
    expect(getSectionOfSize(1800, config)).toBe('main');
  });

  it('サブセクション', () => {
    expect(getSectionOfSize(1200, config)).toBe('sub');
    expect(getSectionOfSize(900, config)).toBe('sub');
    expect(getSectionOfSize(600, config)).toBe('sub');
  });

  it('調整セクション', () => {
    expect(getSectionOfSize(400, config)).toBe('adjust');
    expect(getSectionOfSize(300, config)).toBe('adjust');
    expect(getSectionOfSize(200, config)).toBe('adjust');
  });

  it('除外（order にあるが全セクション超過）', () => {
    const cfg2: PriorityConfig = { ...config, adjustCount: 2 }; // 200 が除外に
    expect(getSectionOfSize(200, cfg2)).toBe('excluded');
  });

  it('除外（order にない）', () => {
    expect(getSectionOfSize(1500, config)).toBe('excluded');
  });
});

describe('getScoreOfSize', () => {
  const config: PriorityConfig = {
    order: [1800, 1200, 900, 600, 400, 300, 200],
    mainCount: 1,
    subCount: 3,
    adjustCount: 3,
  };

  it('メインは10.0', () => {
    expect(getScoreOfSize(1800, config)).toBe(10.0);
  });

  it('サブ先頭は6.0、次は5.9、最後は5.8', () => {
    expect(getScoreOfSize(1200, config)).toBeCloseTo(6.0, 5);
    expect(getScoreOfSize(900, config)).toBeCloseTo(5.9, 5);
    expect(getScoreOfSize(600, config)).toBeCloseTo(5.8, 5);
  });

  it('調整先頭は2.0、最後は1.8', () => {
    expect(getScoreOfSize(400, config)).toBeCloseTo(2.0, 5);
    expect(getScoreOfSize(200, config)).toBeCloseTo(1.8, 5);
  });

  it('除外は -Infinity', () => {
    expect(getScoreOfSize(1500, config)).toBe(-Infinity);
  });
});

describe('scoreCombination', () => {
  const config: PriorityConfig = {
    order: [1800, 1200, 900, 600, 400, 300, 200],
    mainCount: 1,
    subCount: 3,
    adjustCount: 3,
  };

  it('1800 単独', () => {
    expect(scoreCombination([1800], config)).toBe(10.0);
  });

  it('900+600 の平均', () => {
    // 900=5.9, 600=5.8、平均 5.85
    expect(scoreCombination([900, 600], config)).toBeCloseTo(5.85, 5);
  });

  it('1200+300 の平均', () => {
    // 1200=6.0, 300=1.9、平均 3.95
    expect(scoreCombination([1200, 300], config)).toBeCloseTo(3.95, 5);
  });

  it('1800+600 の平均', () => {
    // 1800=10.0, 600=5.8、平均 7.9
    expect(scoreCombination([1800, 600], config)).toBeCloseTo(7.9, 5);
  });

  it('空配列は0', () => {
    expect(scoreCombination([], config)).toBe(0);
  });
});

describe('findBestEndCombinations - priorityConfig 優先評価', () => {
  const config: PriorityConfig = {
    order: [1800, 1200, 900, 600, 400, 300, 200],
    mainCount: 1,
    subCount: 3,
    adjustCount: 3,
  };

  it('1500mm → 900+600 が第1候補', () => {
    const result = findBestEndCombinations(1500, DEFAULT_SIZES, config);
    expect(result.length).toBeGreaterThan(0);
    const first = result[0];
    expect(first.remainder).toBe(0);
    expect(first.rails.slice().sort((a, b) => b - a)).toEqual([900, 600]);
  });

  it('2100mm → 1200+900 が第1候補', () => {
    const result = findBestEndCombinations(2100, DEFAULT_SIZES, config);
    const first = result[0];
    expect(first.remainder).toBe(0);
    expect(first.rails.slice().sort((a, b) => b - a)).toEqual([1200, 900]);
  });

  it('2400mm → 1800+600 が第1候補（1200+1200より優先）', () => {
    const result = findBestEndCombinations(2400, DEFAULT_SIZES, config);
    const first = result[0];
    expect(first.remainder).toBe(0);
    expect(first.rails.slice().sort((a, b) => b - a)).toEqual([1800, 600]);
  });

  it('1800mm → 1800単独（変化なし）', () => {
    const result = findBestEndCombinations(1800, DEFAULT_SIZES, config);
    const first = result[0];
    expect(first.remainder).toBe(0);
    expect(first.rails).toEqual([1800]);
  });
});

describe('findBestEndCombinations - 900 中心の現場設定', () => {
  const config: PriorityConfig = {
    order: [900, 1800, 1200, 600, 400, 300, 200],
    mainCount: 1,
    subCount: 3,
    adjustCount: 3,
  };

  it('1500mm → 900+600 が第1候補（第1優先の900を使う）', () => {
    const result = findBestEndCombinations(1500, DEFAULT_SIZES, config);
    const first = result[0];
    expect(first.remainder).toBe(0);
    expect(first.rails.slice().sort((a, b) => b - a)).toEqual([900, 600]);
  });

  it('3600mm → 900×4 が第1候補', () => {
    const result = findBestEndCombinations(3600, DEFAULT_SIZES, config);
    const first = result[0];
    expect(first.remainder).toBe(0);
    expect(first.rails).toEqual([900, 900, 900, 900]);
  });
});
