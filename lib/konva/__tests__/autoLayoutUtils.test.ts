import { describe, it, expect } from 'vitest';
import { findBestEndCombinations } from '../autoLayoutUtils';
import type { HandrailLengthMm } from '@/types';

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
