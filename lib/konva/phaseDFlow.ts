/**
 * Phase D: 順次決定フローの state 遷移関数群。
 * すべて純粋関数（state を引数で受け取り、新しい state を返す）。
 * React の useReducer や setState と組み合わせて使う想定。
 */

import type {
  PhaseDFlowState,
  PhaseDEdgeDecision,
  PhaseDCandidate,
  PhaseDEdgeCandidates,
  HandrailLengthMm,
  PriorityConfig,
} from '@/types';
import { generateEdgeCandidatesForPhaseD } from './autoLayoutUtils';

/**
 * 初期 state を生成する。
 * スタート角の2辺は固定辺として扱い、currentStep は最初の非固定辺を指す。
 */
export function initPhaseDFlowState(args: {
  edgeIndices: number[]; // CW 順の全辺インデックス
  lockedEdgeIndices: Set<number>; // 固定辺（2つ）
  startDistances: PhaseDFlowState['startDistances'];
  desiredDistances: Record<number, number>;
}): PhaseDFlowState {
  const { edgeIndices, lockedEdgeIndices, startDistances, desiredDistances } = args;

  // edgeOrder: 固定辺もそのままCW順に保持（スキップしながら処理する設計）
  const edgeOrder = [...edgeIndices];

  // currentStep: 最初の非固定辺の index（edgeOrder 内の位置）
  let currentStep = 0;
  while (
    currentStep < edgeOrder.length &&
    lockedEdgeIndices.has(edgeOrder[currentStep])
  ) {
    currentStep++;
  }
  if (currentStep >= edgeOrder.length) currentStep = -1; // 全固定なら完了

  return {
    edgeOrder,
    lockedEdgeIndices,
    desiredDistances,
    decisions: {},
    currentStep,
    startDistances,
  };
}

/**
 * 現在のステップの辺を取得する。
 */
export function getCurrentEdgeIndex(state: PhaseDFlowState): number | null {
  if (state.currentStep < 0) return null;
  return state.edgeOrder[state.currentStep];
}

/**
 * 現在のステップの辺に対する「始点離れ」を計算する。
 * 前の辺の decision.endDistanceMm、または固定辺の離れから取得。
 */
export function getStartDistanceForCurrentEdge(state: PhaseDFlowState): number {
  if (state.currentStep <= 0) {
    // 最初の辺: 前の辺は (edgeOrder.length - 1) の位置（CWループ）
    const prevIdx =
      (state.currentStep - 1 + state.edgeOrder.length) % state.edgeOrder.length;
    const prevEdgeIndex = state.edgeOrder[prevIdx];

    if (state.lockedEdgeIndices.has(prevEdgeIndex)) {
      if (prevEdgeIndex === state.startDistances.face1EdgeIndex) {
        return state.startDistances.face1DistanceMm;
      }
      if (prevEdgeIndex === state.startDistances.face2EdgeIndex) {
        return state.startDistances.face2DistanceMm;
      }
    }
    if (state.decisions[prevEdgeIndex]) {
      return state.decisions[prevEdgeIndex].endDistanceMm;
    }
    return state.startDistances.face1DistanceMm;
  }

  // 通常ケース: 直前の辺の終点離れ
  const prevEdgeIndex = state.edgeOrder[state.currentStep - 1];
  if (state.lockedEdgeIndices.has(prevEdgeIndex)) {
    if (prevEdgeIndex === state.startDistances.face1EdgeIndex) {
      return state.startDistances.face1DistanceMm;
    }
    if (prevEdgeIndex === state.startDistances.face2EdgeIndex) {
      return state.startDistances.face2DistanceMm;
    }
  }
  const prevDecision = state.decisions[prevEdgeIndex];
  if (prevDecision) return prevDecision.endDistanceMm;
  throw new Error(`Phase D: 前の辺 ${prevEdgeIndex} の離れが確定していません`);
}

/**
 * 現在のステップで候補を決定する（呼び出し側が candidate を選択して渡す）。
 * 次のステップに進む。固定辺はスキップ。
 */
export function confirmCurrentEdge(
  state: PhaseDFlowState,
  selectedCandidate: PhaseDCandidate,
): PhaseDFlowState {
  const currentEdgeIndex = getCurrentEdgeIndex(state);
  if (currentEdgeIndex === null) return state;

  const startDistanceMm = getStartDistanceForCurrentEdge(state);
  const decision: PhaseDEdgeDecision = {
    edgeIndex: currentEdgeIndex,
    selectedCandidate,
    startDistanceMm,
    endDistanceMm: selectedCandidate.endDistanceMm,
  };

  const newDecisions = { ...state.decisions, [currentEdgeIndex]: decision };

  // 次の非固定辺へ
  let nextStep = state.currentStep + 1;
  while (
    nextStep < state.edgeOrder.length &&
    state.lockedEdgeIndices.has(state.edgeOrder[nextStep])
  ) {
    nextStep++;
  }
  if (nextStep >= state.edgeOrder.length) nextStep = -1;

  return {
    ...state,
    decisions: newDecisions,
    currentStep: nextStep,
  };
}

/**
 * 前のステップに戻る（undo）。
 * 1つ前の非固定辺の decision を削除し、currentStep を戻す。
 * 戻れない場合は同じ state を返す。
 */
export function rollbackCurrentStep(state: PhaseDFlowState): PhaseDFlowState {
  let prevStep = state.currentStep - 1;

  // もし完了状態なら、最後の非固定辺に戻る
  if (state.currentStep < 0) {
    prevStep = state.edgeOrder.length - 1;
  }

  while (
    prevStep >= 0 &&
    state.lockedEdgeIndices.has(state.edgeOrder[prevStep])
  ) {
    prevStep--;
  }
  if (prevStep < 0) return state; // 戻れない

  const prevEdgeIndex = state.edgeOrder[prevStep];
  const newDecisions = { ...state.decisions };
  delete newDecisions[prevEdgeIndex];

  return {
    ...state,
    decisions: newDecisions,
    currentStep: prevStep,
  };
}

/**
 * 全辺が確定済みか判定する。
 */
export function isFlowCompleted(state: PhaseDFlowState): boolean {
  return state.currentStep < 0;
}

/**
 * 現在の辺の候補を生成する（generateEdgeCandidatesForPhaseD のラッパー）。
 * 辺長は呼び出し側から渡す（建物情報は state に含めない設計）。
 */
export function getCurrentCandidates(
  state: PhaseDFlowState,
  edgeLengthMm: number,
  enabledSizes: HandrailLengthMm[],
  priorityConfig?: PriorityConfig,
): PhaseDEdgeCandidates | null {
  const currentEdgeIndex = getCurrentEdgeIndex(state);
  if (currentEdgeIndex === null) return null;

  const startDistanceMm = getStartDistanceForCurrentEdge(state);
  const desiredEndDistanceMm = state.desiredDistances[currentEdgeIndex] ?? 900;

  return generateEdgeCandidatesForPhaseD(
    edgeLengthMm,
    startDistanceMm,
    desiredEndDistanceMm,
    enabledSizes,
    priorityConfig,
  );
}
