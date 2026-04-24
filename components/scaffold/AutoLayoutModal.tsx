'use client';

import React, { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore } from '@/stores/canvasStore';
import { Handrail, HandrailLengthMm, PhaseDFlowState, PhaseDCandidate } from '@/types';
import { getHandrailColor } from '@/lib/konva/handrailColors';
import { useHandrailSettingsStore } from '@/stores/handrailSettingsStore';
import {
  getBuildingEdgesClockwise,
  computeAutoLayout,
  placeHandrailsForEdge,
  getEdgesNotCoveredBy,
} from '@/lib/konva/autoLayoutUtils';
import {
  initPhaseDFlowState,
  getCurrentCandidates,
  confirmCurrentEdge,
  rollbackCurrentStep,
  getCurrentEdgeIndex,
  getStartDistanceForCurrentEdge,
  isFlowCompleted,
} from '@/lib/konva/phaseDFlow';

type Props = { onClose: () => void; onOpenScaffoldStart: () => void };

export default function AutoLayoutModal({ onClose, onOpenScaffoldStart }: Props) {
  const { canvasData, addHandrails } = useCanvasStore();
  const enabledSizes = useHandrailSettingsStore(s => s.enabledSizes);
  const priorityConfig = useHandrailSettingsStore(s => s.priorityConfig);

  // 対象階（1F / 2F / both = 1F+2F同時）
  const [targetFloor, setTargetFloor] = useState<1 | 2 | 'both'>(
    () => (canvasData.scaffoldStart?.floor ?? 1) as 1 | 2,
  );

  // 1F建物 / 2F建物（最初に一致したもの）
  const building1F = useMemo(
    () => canvasData.buildings.find(b => (b.floor ?? 1) === 1) ?? null,
    [canvasData.buildings],
  );
  const building2F = useMemo(
    () => canvasData.buildings.find(b => b.floor === 2) ?? null,
    [canvasData.buildings],
  );

  // UI表示の「対象階建物」
  // 1Fのみ: 1F建物 / 2Fのみ: 2F建物 / both: 2F建物（常に全周配置されるため主表示）
  const building = useMemo(() => {
    if (targetFloor === 2) return building2F;
    if (targetFloor === 'both') return building2F; // bothは2Fを主表示
    return building1F;
  }, [targetFloor, building1F, building2F]);

  // bothモード時、1F のうち 2F で覆われていない辺（= 下屋辺）
  // 総2階やオーバーハングではゼロ、下屋ありでは 1 本以上
  const uncoveredEdges1F = useMemo(() => {
    if (targetFloor !== 'both' || !building1F || !building2F) return [];
    return getEdgesNotCoveredBy(building1F, building2F);
  }, [targetFloor, building1F, building2F]);

  // scaffoldStart は対象階のものだけ有効扱い（別階のを引き継がない）
  // both モードは 2F 主表示なので 2F の scaffoldStart を使用
  const scaffoldStart = useMemo(() => {
    const ss = canvasData.scaffoldStart;
    if (!ss) return undefined;
    const effectiveFloor = targetFloor === 'both' ? 2 : targetFloor;
    return (ss.floor ?? 1) === effectiveFloor ? ss : undefined;
  }, [canvasData.scaffoldStart, targetFloor]);

  // 辺リストを取得
  const edges = useMemo(
    () => building ? getBuildingEdgesClockwise(building) : [],
    [building]
  );

  // スタート角に隣接する2辺（固定辺）
  const lockedEdgeIndices = useMemo(() => {
    if (!scaffoldStart || !building) return new Set<number>();
    const edgeList = getBuildingEdgesClockwise(building);
    const n = edgeList.length;
    const startIdx = scaffoldStart.startVertexIndex ?? 0;
    const outEdge = edgeList[startIdx % n];
    const inEdge = edgeList[(startIdx - 1 + n) % n];
    return new Set([outEdge.index, inEdge.index]);
  }, [scaffoldStart, building]);

  // 【Phase D】固定辺の face1/face2 edgeIndex と離れ
  const phaseDLockedInfo = useMemo(() => {
    if (!scaffoldStart || edges.length === 0) return null;
    const n = edges.length;
    const svi = scaffoldStart.startVertexIndex ?? 0;
    const outEdge = edges[svi % n];
    const inEdge = edges[(svi - 1 + n) % n];
    const outIsH = outEdge.face === 'north' || outEdge.face === 'south';
    const face1Edge = outIsH ? outEdge : inEdge;
    const face2Edge = outIsH ? inEdge : outEdge;
    return {
      face1EdgeIndex: face1Edge.index,
      face1DistanceMm: scaffoldStart.face1DistanceMm,
      face2EdgeIndex: face2Edge.index,
      face2DistanceMm: scaffoldStart.face2DistanceMm,
    };
  }, [scaffoldStart, edges]);

  // 【Phase D】繋がる離れ提案モード（常時有効。従来モード削除後も互換目的で const を残置）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const phaseDMode = true;
  const [phaseDStep, setPhaseDStep] = useState<'input' | 'sequential'>('input');
  const [phaseDDesiredDistances, setPhaseDDesiredDistances] = useState<Record<number, number>>({});
  const [phaseDFlowState, setPhaseDFlowState] = useState<PhaseDFlowState | null>(null);

  // 【Phase D】decisions から距離 Record を構築
  const buildPhaseDDistances = (state: PhaseDFlowState): Record<number, number> => {
    const result: Record<number, number> = {};
    // 固定辺
    result[state.startDistances.face1EdgeIndex] = state.startDistances.face1DistanceMm;
    result[state.startDistances.face2EdgeIndex] = state.startDistances.face2DistanceMm;
    // 決定済み
    for (const [idxStr, dec] of Object.entries(state.decisions)) {
      result[Number(idxStr)] = dec.startDistanceMm;
    }
    return result;
  };

  // 【Phase D】配置ハンドラ
  const handlePhaseDPlace = () => {
    if (!phaseDFlowState || !building) return;
    if (!isFlowCompleted(phaseDFlowState)) {
      alert('まだ全辺の決定が完了していません');
      return;
    }

    // Phase D の decisions から distances を構築
    const phaseDDistances = buildPhaseDDistances(phaseDFlowState);

    // 既存の computeAutoLayout で配置計算
    const res = computeAutoLayout(
      building,
      phaseDDistances,
      scaffoldStart,
      enabledSizes,
      priorityConfig,
    );

    // 配置処理
    const mainFloor: 1 | 2 = targetFloor === 1 ? 1 : 2;
    const newHandrails: Handrail[] = [];
    for (const el of res.edgeLayouts) {
      if (el.candidates.length === 0) continue;
      // Phase D では candidate[0] を使う（selections 未使用）
      const rails = el.candidates[0].rails;
      if (rails.length === 0) continue;
      const placements = placeHandrailsForEdge(el, rails);
      for (const p of placements) {
        newHandrails.push({
          id: uuidv4(),
          x: p.x,
          y: p.y,
          lengthMm: p.lengthMm,
          direction: p.direction,
          color: getHandrailColor(p.lengthMm),
          floor: mainFloor,
        });
      }
    }

    // canvas に追加（干渉判定は Phase D-6 以降で検討）
    addHandrails(newHandrails);
    onClose();
  };

  if (!building) {
    return (
      <div className="fixed inset-0 modal-overlay flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-dark-surface border border-dark-border rounded-2xl p-6 text-center" onClick={e => e.stopPropagation()}>
          <p className="text-dimension mb-3">建物がありません</p>
          <button onClick={onClose} className="px-4 py-2 bg-accent text-white rounded-lg text-sm">閉じる</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 modal-overlay flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-dark-surface border-t sm:border border-dark-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-dark-surface px-4 py-3 border-b border-dark-border flex items-center justify-between z-10">
          <h2 className="font-bold text-lg">自動割付</h2>
          <button onClick={onClose} className="text-dimension hover:text-canvas px-2">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* 対象階 */}
          <div>
            <label className="block text-xs text-dimension mb-1.5">対象階</label>
            <div className="flex gap-1.5">
              {([1, 2] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTargetFloor(f)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                    targetFloor === f
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-dark-border text-dimension hover:border-accent/50'
                  }`}
                >
                  {f}Fのみ
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTargetFloor('both')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                  targetFloor === 'both'
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-dark-border text-dimension hover:border-accent/50'
                }`}
              >
                1F+2F
              </button>
            </div>
            {targetFloor === 'both' && (
              <p className="mt-1.5 text-[10px] text-dimension">
                {!building2F
                  ? '⚠️ 2F建物が未作成です。先に2Fを作成してください'
                  : !building1F
                  ? '⚠️ 1F建物が未作成です'
                  : uncoveredEdges1F.length === 0
                  ? '✓ 1F全辺が2Fで覆われます: 2F全周のみ配置、1F足場不要'
                  : `✓ 2F全周配置 + 1Fの下屋辺 ${uncoveredEdges1F.length} 本にも配置`}
              </p>
            )}
          </div>

          {!building && (
            <p className="text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
              {targetFloor === 2 ? '2F建物が未作成です。' : '建物が未作成です。'}
              躯体メニューから建物を先に作成してください。
            </p>
          )}

          {building && (
            <>
          {/* 【Phase D】繋がる離れ提案モード */}
          {phaseDStep === 'input' && (
            <div className="flex flex-col gap-3 p-3">
              <div className="text-sm font-semibold">Step 0: 希望離れ入力</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                各面の希望離れを入力してください。固定辺（スタート角の2辺）は既に確定しています。
              </div>

              <div className="flex flex-col gap-2">
                {edges.map((edge) => {
                  const isLocked = lockedEdgeIndices.has(edge.index);
                  const lockedValue = isLocked && phaseDLockedInfo
                    ? (edge.index === phaseDLockedInfo.face1EdgeIndex
                        ? phaseDLockedInfo.face1DistanceMm
                        : phaseDLockedInfo.face2DistanceMm)
                    : undefined;
                  const currentValue = isLocked
                    ? lockedValue ?? 0
                    : (phaseDDesiredDistances[edge.index] ?? 900);

                  return (
                    <div key={edge.index} className="flex items-center gap-2">
                      <span className="w-16 text-xs font-medium">{edge.label}面</span>
                      {isLocked ? (
                        <>
                          <input
                            type="number"
                            value={currentValue}
                            disabled
                            className="w-24 px-2 py-1 text-sm border rounded bg-gray-100 dark:bg-gray-800"
                          />
                          <span className="text-xs text-gray-500">固定</span>
                        </>
                      ) : (
                        <input
                          type="number"
                          value={currentValue}
                          min={0}
                          step={1}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setPhaseDDesiredDistances(prev => ({ ...prev, [edge.index]: v }));
                          }}
                          className="w-24 px-2 py-1 text-sm border rounded bg-dark-bg"
                        />
                      )}
                      <span className="text-xs text-gray-400">mm</span>
                      <span className="text-xs text-gray-400">（辺長 {Math.round(edge.lengthMm)}mm）</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded"
                  onClick={onClose}
                >
                  キャンセル
                </button>
                <button
                  className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  onClick={() => {
                    if (!phaseDLockedInfo) return;
                    const initialState = initPhaseDFlowState({
                      edgeIndices: edges.map(e => e.index),
                      lockedEdgeIndices,
                      startDistances: phaseDLockedInfo,
                      desiredDistances: phaseDDesiredDistances,
                    });
                    setPhaseDFlowState(initialState);
                    setPhaseDStep('sequential');
                  }}
                >
                  次へ（順次決定へ）
                </button>
              </div>
            </div>
          )}

          {phaseDStep === 'sequential' && phaseDFlowState && (
            <div className="flex flex-col gap-3 p-3">
              <div className="text-sm font-semibold">
                Step 1: 順次決定 ({phaseDFlowState.currentStep < 0 ? phaseDFlowState.edgeOrder.length : phaseDFlowState.currentStep + 1}/{phaseDFlowState.edgeOrder.length}面)
              </div>

              {(() => {
                const currentEdgeIdx = getCurrentEdgeIndex(phaseDFlowState);
                if (currentEdgeIdx === null) {
                  // 全完了
                  return (
                    <div className="flex flex-col gap-2">
                      <div className="text-sm text-green-600 font-medium">✅ 全辺の決定が完了しました</div>
                      <div className="flex justify-end gap-2">
                        <button
                          className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded"
                          onClick={() => {
                            setPhaseDStep('input');
                            setPhaseDFlowState(null);
                          }}
                        >
                          入力に戻る
                        </button>
                        <button
                          className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                          onClick={handlePhaseDPlace}
                        >
                          配置する
                        </button>
                      </div>
                    </div>
                  );
                }

                const currentEdge = edges.find(e => e.index === currentEdgeIdx);
                if (!currentEdge) return null;

                const startDist = getStartDistanceForCurrentEdge(phaseDFlowState);
                const desired = phaseDFlowState.desiredDistances[currentEdgeIdx] ?? 900;
                const candidates = getCurrentCandidates(
                  phaseDFlowState,
                  currentEdge.lengthMm,
                  enabledSizes,
                  priorityConfig,
                );

                if (!candidates) return <div>候補の生成中...</div>;

                const handleSelect = (candidate: PhaseDCandidate) => {
                  const newState = confirmCurrentEdge(phaseDFlowState, candidate);
                  setPhaseDFlowState(newState);
                };

                return (
                  <>
                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                      <div>面: <span className="font-semibold">{currentEdge.label}</span>（{currentEdge.face}）</div>
                      <div>辺長: {Math.round(currentEdge.lengthMm)}mm / 始点離れ: {startDist}mm</div>
                      <div>希望終点離れ: <span className="font-semibold text-blue-500">{desired}mm</span></div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {candidates.exact && (
                        <button
                          className="flex flex-col items-start gap-1 p-3 border-2 border-green-500 bg-green-50 dark:bg-green-900/20 rounded hover:bg-green-100 dark:hover:bg-green-900/30"
                          onClick={() => handleSelect(candidates.exact!)}
                        >
                          <div className="text-xs font-semibold text-green-700 dark:text-green-400">🎯 ぴったり候補</div>
                          <div className="text-sm font-medium text-green-900 dark:text-green-100">{candidates.exact.rails.join(' + ')}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            終点離れ: {candidates.exact.endDistanceMm}mm (±0)
                          </div>
                        </button>
                      )}

                      {candidates.larger && (
                        <button
                          className="flex flex-col items-start gap-1 p-3 border border-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onClick={() => handleSelect(candidates.larger!)}
                        >
                          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">⬆️ 大きい側</div>
                          <div className="text-sm font-medium text-blue-900 dark:text-blue-100">{candidates.larger.rails.join(' + ')}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            終点離れ: {candidates.larger.endDistanceMm}mm (+{candidates.larger.diffFromDesired})
                          </div>
                        </button>
                      )}

                      {candidates.smaller && (
                        <button
                          className="flex flex-col items-start gap-1 p-3 border border-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30"
                          onClick={() => handleSelect(candidates.smaller!)}
                        >
                          <div className="text-xs font-semibold text-orange-700 dark:text-orange-400">⬇️ 小さい側</div>
                          <div className="text-sm font-medium text-orange-900 dark:text-orange-100">{candidates.smaller.rails.join(' + ')}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            終点離れ: {candidates.smaller.endDistanceMm}mm ({candidates.smaller.diffFromDesired})
                          </div>
                        </button>
                      )}

                      {!candidates.exact && !candidates.larger && !candidates.smaller && (
                        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded">
                          ⚠️ 候補が見つかりませんでした。希望離れを見直してください。
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between gap-2 mt-2">
                      <button
                        className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
                        disabled={Object.keys(phaseDFlowState.decisions).length === 0}
                        onClick={() => {
                          const rolled = rollbackCurrentStep(phaseDFlowState);
                          setPhaseDFlowState(rolled);
                        }}
                      >
                        ← 前の辺
                      </button>
                      <button
                        className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded"
                        onClick={() => {
                          setPhaseDStep('input');
                          setPhaseDFlowState(null);
                        }}
                      >
                        入力に戻る
                      </button>
                    </div>

                    {/* 確定済みの履歴表示 */}
                    {Object.keys(phaseDFlowState.decisions).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                        <div className="text-xs font-semibold mb-2">確定済み</div>
                        <div className="flex flex-col gap-1">
                          {Object.entries(phaseDFlowState.decisions).map(([idx, dec]) => {
                            const edge = edges.find(e => e.index === Number(idx));
                            return (
                              <div key={idx} className="text-xs text-gray-600 dark:text-gray-400">
                                {edge?.label}: {dec.selectedCandidate.rails.join('+')} → 終点離れ {dec.endDistanceMm}mm
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
            </>
          )}
        </div>
      </div>

    </div>
  );
}
