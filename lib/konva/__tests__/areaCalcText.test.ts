import { describe, it, expect } from 'vitest';
import { buildAreaCalcText, formatAlphaLabel } from '../areaCalcText';
import type { Handrail } from '@/types';

type ScaffoldSummary = {
  faceAreas: Map<string, number>;
  faceLabels: Map<string, string>;
  total: number;
  uncalculable: { handrail: Handrail; reason: 'projection-failed' | 'height-undefined' }[];
  byFloor: { floor1: number; floor2: number };
};

function makeScaffoldSummary(overrides: Partial<ScaffoldSummary> = {}): ScaffoldSummary {
  return {
    faceAreas: new Map(),
    faceLabels: new Map(),
    total: 0,
    uncalculable: [],
    byFloor: { floor1: 0, floor2: 0 },
    ...overrides,
  };
}

const dummyHandrail = { id: 'h1' } as Handrail;
const buildingSummaryDefault = { floor1: 35.0, floor2: 0.0, total: 35.0 };

describe('formatAlphaLabel', () => {
  it('4 値の表示ラベル', () => {
    expect(formatAlphaLabel(0)).toBe('建物 = 足場');
    expect(formatAlphaLabel(-900)).toBe('建物 -900mm');
    expect(formatAlphaLabel(450)).toBe('建物 +450mm');
    expect(formatAlphaLabel(900)).toBe('建物 +900mm');
  });
});

describe('buildAreaCalcText', () => {
  it('通常ケース (= α=0、 2 面、 uncalculable 0)', () => {
    const scaffoldSummary = makeScaffoldSummary({
      faceAreas: new Map([['b1-0', 12.5], ['b1-1', 8.0]]),
      faceLabels: new Map([['b1-0', 'A'], ['b1-1', 'B']]),
      total: 20.5,
      byFloor: { floor1: 20.5, floor2: 0 },
    });
    const text = buildAreaCalcText({
      scaffoldSummary,
      buildingSummary: buildingSummaryDefault,
      offsetMm: 0,
      isFloorOnlyMode: false,
    });
    expect(text).toBe(
      [
        '平米計算結果',
        '─────────',
        '[α: 建物 = 足場]',
        '▼ 足場面別',
        ' 面 A: 12.5 m²',
        ' 面 B: 8.0 m²',
        '▼ 足場合計',
        ' 1F: 20.5 m²',
        ' 2F: 0.0 m²',
        ' 合計: 20.5 m²',
        '▼ 建物床㎡',
        ' 1F: 35.0 m²',
        ' 2F: 0.0 m²',
        ' 合計: 35.0 m²',
      ].join('\n'),
    );
  });

  it('α=-900 ラベル反映', () => {
    const scaffoldSummary = makeScaffoldSummary({
      faceAreas: new Map([['b1-0', 10.0]]),
      faceLabels: new Map([['b1-0', 'A']]),
      total: 10.0,
      byFloor: { floor1: 10.0, floor2: 0 },
    });
    const text = buildAreaCalcText({
      scaffoldSummary,
      buildingSummary: buildingSummaryDefault,
      offsetMm: -900,
      isFloorOnlyMode: false,
    });
    expect(text).toContain('[α: 建物 -900mm]');
  });

  it('floor-only mode (= scaffoldSummary null → α/足場節省略、 床㎡のみ)', () => {
    const text = buildAreaCalcText({
      scaffoldSummary: null,
      buildingSummary: buildingSummaryDefault,
      offsetMm: 0,
      isFloorOnlyMode: true,
    });
    expect(text).toBe(
      [
        '平米計算結果',
        '─────────',
        '▼ 建物床㎡',
        ' 1F: 35.0 m²',
        ' 2F: 0.0 m²',
        ' 合計: 35.0 m²',
      ].join('\n'),
    );
    expect(text).not.toContain('α');
    expect(text).not.toContain('足場');
  });

  it('visibleFaces 空 (= 全 0 値、 足場面別セクション省略、 足場合計は残る)', () => {
    const scaffoldSummary = makeScaffoldSummary({
      faceAreas: new Map([['b1-0', 0], ['b1-1', 0]]),
      faceLabels: new Map([['b1-0', 'A'], ['b1-1', 'B']]),
      total: 0,
      byFloor: { floor1: 0, floor2: 0 },
    });
    const text = buildAreaCalcText({
      scaffoldSummary,
      buildingSummary: buildingSummaryDefault,
      offsetMm: 0,
      isFloorOnlyMode: false,
    });
    expect(text).not.toContain('▼ 足場面別');
    expect(text).toContain('▼ 足場合計');
    expect(text).toContain(' 合計: 0.0 m²');
  });

  it('uncalculable projection-failed のみ', () => {
    const scaffoldSummary = makeScaffoldSummary({
      uncalculable: [
        { handrail: dummyHandrail, reason: 'projection-failed' },
        { handrail: dummyHandrail, reason: 'projection-failed' },
      ],
    });
    const text = buildAreaCalcText({
      scaffoldSummary,
      buildingSummary: buildingSummaryDefault,
      offsetMm: 0,
      isFloorOnlyMode: false,
    });
    expect(text).toContain('⚠ 計算不能 2 本');
    expect(text).toContain(' ・射影不能: 2 本');
    expect(text).not.toContain('・高さ未設定');
  });

  it('uncalculable height-undefined のみ', () => {
    const scaffoldSummary = makeScaffoldSummary({
      uncalculable: [
        { handrail: dummyHandrail, reason: 'height-undefined' },
      ],
    });
    const text = buildAreaCalcText({
      scaffoldSummary,
      buildingSummary: buildingSummaryDefault,
      offsetMm: 0,
      isFloorOnlyMode: false,
    });
    expect(text).toContain('⚠ 計算不能 1 本');
    expect(text).toContain(' ・高さ未設定: 1 本');
    expect(text).not.toContain('・射影不能');
  });

  it('uncalculable 両方 reason 表示', () => {
    const scaffoldSummary = makeScaffoldSummary({
      uncalculable: [
        { handrail: dummyHandrail, reason: 'projection-failed' },
        { handrail: dummyHandrail, reason: 'height-undefined' },
        { handrail: dummyHandrail, reason: 'height-undefined' },
      ],
    });
    const text = buildAreaCalcText({
      scaffoldSummary,
      buildingSummary: buildingSummaryDefault,
      offsetMm: 0,
      isFloorOnlyMode: false,
    });
    expect(text).toContain('⚠ 計算不能 3 本');
    expect(text).toContain(' ・射影不能: 1 本');
    expect(text).toContain(' ・高さ未設定: 2 本');
  });
});
