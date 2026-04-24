import { describe, it, expect } from 'vitest';
import {
  initPhaseDFlowState,
  getCurrentEdgeIndex,
  getStartDistanceForCurrentEdge,
  confirmCurrentEdge,
  rollbackCurrentStep,
  isFlowCompleted,
  getCurrentCandidates,
} from '../phaseDFlow';
import type { PhaseDCandidate } from '@/types';

describe('Phase D Flow: 初期化', () => {
  it('4辺建物で固定辺2つ、最初の currentStep は最初の非固定辺', () => {
    const state = initPhaseDFlowState({
      edgeIndices: [0, 1, 2, 3],
      lockedEdgeIndices: new Set([0, 3]), // 辺0と辺3が固定
      startDistances: {
        face1EdgeIndex: 0,
        face1DistanceMm: 900,
        face2EdgeIndex: 3,
        face2DistanceMm: 900,
      },
      desiredDistances: { 1: 850, 2: 750 },
    });

    expect(state.currentStep).toBe(1); // 辺1が最初
    expect(getCurrentEdgeIndex(state)).toBe(1);
    expect(isFlowCompleted(state)).toBe(false);
  });

  it('全辺固定なら即完了', () => {
    const state = initPhaseDFlowState({
      edgeIndices: [0, 1],
      lockedEdgeIndices: new Set([0, 1]),
      startDistances: {
        face1EdgeIndex: 0,
        face1DistanceMm: 900,
        face2EdgeIndex: 1,
        face2DistanceMm: 900,
      },
      desiredDistances: {},
    });

    expect(state.currentStep).toBe(-1);
    expect(isFlowCompleted(state)).toBe(true);
  });
});

describe('Phase D Flow: 順次進行', () => {
  const setup = () =>
    initPhaseDFlowState({
      edgeIndices: [0, 1, 2, 3],
      lockedEdgeIndices: new Set([0, 3]),
      startDistances: {
        face1EdgeIndex: 0,
        face1DistanceMm: 900,
        face2EdgeIndex: 3,
        face2DistanceMm: 900,
      },
      desiredDistances: { 1: 850, 2: 750 },
    });

  const mockCandidate = (endDist: number): PhaseDCandidate => ({
    railsTotalMm: 5400,
    endDistanceMm: endDist,
    diffFromDesired: 0,
    score: 5.0,
    rails: [1800, 1800, 1800],
  });

  it('辺1を確定すると辺2に進む', () => {
    let state = setup();
    expect(state.currentStep).toBe(1);

    state = confirmCurrentEdge(state, mockCandidate(800));
    expect(state.currentStep).toBe(2);
    expect(state.decisions[1]).toBeDefined();
    expect(state.decisions[1].endDistanceMm).toBe(800);
  });

  it('辺1の始点離れは固定辺0の離れ（900）', () => {
    const state = setup();
    expect(getStartDistanceForCurrentEdge(state)).toBe(900);
  });

  it('辺2の始点離れは辺1の終点離れ', () => {
    let state = setup();
    state = confirmCurrentEdge(state, mockCandidate(800));
    // 今は辺2
    expect(getStartDistanceForCurrentEdge(state)).toBe(800);
  });

  it('全非固定辺を確定すると完了状態', () => {
    let state = setup();
    state = confirmCurrentEdge(state, mockCandidate(800)); // 辺1確定
    state = confirmCurrentEdge(state, mockCandidate(900)); // 辺2確定
    // 辺3は固定なのでスキップ、全完了
    expect(isFlowCompleted(state)).toBe(true);
    expect(state.currentStep).toBe(-1);
  });
});

describe('Phase D Flow: ロールバック', () => {
  const setup = () =>
    initPhaseDFlowState({
      edgeIndices: [0, 1, 2, 3],
      lockedEdgeIndices: new Set([0, 3]),
      startDistances: {
        face1EdgeIndex: 0,
        face1DistanceMm: 900,
        face2EdgeIndex: 3,
        face2DistanceMm: 900,
      },
      desiredDistances: { 1: 850, 2: 750 },
    });

  const mockCandidate = (endDist: number): PhaseDCandidate => ({
    railsTotalMm: 5400,
    endDistanceMm: endDist,
    diffFromDesired: 0,
    score: 5.0,
    rails: [1800, 1800, 1800],
  });

  it('辺2の段階で戻すと辺1に戻り、辺1の decision も消える', () => {
    let state = setup();
    state = confirmCurrentEdge(state, mockCandidate(800)); // 辺1確定、currentStep=2

    state = rollbackCurrentStep(state);
    expect(state.currentStep).toBe(1);
    expect(state.decisions[1]).toBeUndefined();
  });

  it('最初の辺から戻ろうとすると変化なし', () => {
    const state = setup(); // currentStep=1
    const rolled = rollbackCurrentStep(state);
    expect(rolled).toBe(state); // 同じ state が返る（戻れない）
  });
});

describe('Phase D Flow: 候補生成の統合', () => {
  it('実際の辺長で候補が返る（師匠の例）', () => {
    const state = initPhaseDFlowState({
      edgeIndices: [0, 1, 2, 3],
      lockedEdgeIndices: new Set([0, 3]),
      startDistances: {
        face1EdgeIndex: 0,
        face1DistanceMm: 900,
        face2EdgeIndex: 3,
        face2DistanceMm: 900,
      },
      desiredDistances: { 1: 850, 2: 750 },
    });

    // 辺1（辺長3600、始点離れ900、希望終点850）
    const candidates = getCurrentCandidates(state, 3600, [
      1800, 1200, 900, 600, 400, 300, 200,
    ]);
    expect(candidates).not.toBeNull();
    // 希望850に対して larger（900付近）と smaller（800付近）がある
    expect(candidates!.larger).not.toBeNull();
    expect(candidates!.smaller).not.toBeNull();
  });
});
