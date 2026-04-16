'use client';

import React, { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore } from '@/stores/canvasStore';
import { Handrail, HandrailLengthMm, Point } from '@/types';
import { getHandrailColor } from '@/lib/konva/handrailColors';
import {
  getBuildingEdgesClockwise,
  computeAutoLayout,
  placeHandrailsForEdge,
  AutoLayoutResult,
  EdgeInfo,
} from '@/lib/konva/autoLayoutUtils';

type Props = { onClose: () => void; onOpenScaffoldStart: () => void };

/** 建物プレビューSVG（辺ラベル付き） */
function PreviewSVG({ points, edges, focusedIndex, conflictHandrails }: {
  points: Point[];
  edges: EdgeInfo[];
  focusedIndex: number | null;
  conflictHandrails?: { x: number; y: number; lengthMm: number; direction: 'horizontal' | 'vertical' | number }[];
}) {
  if (points.length < 3) return null;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const bw = (Math.max(...xs) - minX) || 1;
  const bh = (Math.max(...ys) - minY) || 1;

  const pad = 28, svgW = 280, svgH = 180;
  const scale = Math.min((svgW - pad * 2) / bw, (svgH - pad * 2) / bh);
  const offsetX = pad + ((svgW - pad * 2) - bw * scale) / 2;
  const offsetY = pad + ((svgH - pad * 2) - bh * scale) / 2;
  const toSvg = (p: Point) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale });

  const svgPts = points.map(toSvg);
  const pathD = svgPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';

  const centroidX = svgPts.reduce((s, p) => s + p.x, 0) / svgPts.length;
  const centroidY = svgPts.reduce((s, p) => s + p.y, 0) / svgPts.length;

  return (
    <>
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} } .conflict-rail{animation:blink 0.8s ease-in-out infinite}`}</style>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto block">
        <path d={pathD} fill="#3d3d3a" stroke="#1a1a18" strokeWidth={2} />
        {conflictHandrails?.map((h, i) => {
          const mmToG = (mm: number) => Math.round(mm / 10);
          const s1 = toSvg({ x: h.x, y: h.y });
          const s2 = h.direction === 'horizontal'
            ? toSvg({ x: h.x + mmToG(h.lengthMm), y: h.y })
            : toSvg({ x: h.x, y: h.y + mmToG(h.lengthMm) });
          return (
            <line key={`c${i}`}
              x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
              stroke="#FF6B35" strokeWidth={4} strokeLinecap="round"
              className="conflict-rail"
            />
          );
        })}
        {edges.map(edge => {
          const s1 = toSvg(edge.p1);
          const s2 = toSvg(edge.p2);
          const mx = (s1.x + s2.x) / 2;
          const my = (s1.y + s2.y) / 2;
          const isFocused = focusedIndex === edge.index;

          const labelDist = 14;
          const lx = mx + edge.nx * labelDist;
          const ly = my + edge.ny * labelDist;

          return (
            <React.Fragment key={edge.index}>
              {isFocused && (
                <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
                  stroke="#378ADD" strokeWidth={4} strokeLinecap="round" />
              )}
              <text x={lx} y={ly}
                textAnchor="middle" dominantBaseline="central"
                fill={isFocused ? '#378ADD' : '#ccc'}
                fontWeight={isFocused ? 'bold' : 'normal'}
                fontSize={isFocused ? 14 : 12} fontFamily="monospace"
              >{edge.label}</text>
            </React.Fragment>
          );
        })}
      </svg>
    </>
  );
}

const FACE_LABEL: Record<string, string> = {
  north: '北', south: '南', east: '東', west: '西',
};

/** 手摺リストを "1800×3 + 600×1" 形式に整形 */
function formatRailsSummary(rails: HandrailLengthMm[]): string {
  if (rails.length === 0) return 'なし';
  const counts: Record<number, number> = {};
  for (const r of rails) counts[r] = (counts[r] ?? 0) + 1;
  const entries = Object.entries(counts)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => b[0] - a[0]);
  return entries.map(([len, cnt]) => `${len}×${cnt}`).join(' + ');
}

export default function AutoLayoutModal({ onClose, onOpenScaffoldStart }: Props) {
  const { canvasData, addHandrails, removeElements } = useCanvasStore();
  const building = canvasData.buildings[0];
  const scaffoldStart = canvasData.scaffoldStart;

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

  // 各辺の離れ（mm）: edgeIndex → number
  const defaultDist = scaffoldStart?.face1DistanceMm ?? 900;
  const [distances, setDistances] = useState<Record<number, number>>(() => {
    const d: Record<number, number> = {};
    edges.forEach(e => {
      if (scaffoldStart) {
        const n = edges.length;
        const startIdx = scaffoldStart.startVertexIndex ?? 0;
        const outEdge = edges[startIdx % n];
        const inEdge = edges[(startIdx - 1 + n) % n];
        const outIsH = outEdge.face === 'north' || outEdge.face === 'south';
        const face1Edge = outIsH ? outEdge : inEdge;
        const face2Edge = outIsH ? inEdge : outEdge;
        if (e.index === face1Edge.index) { d[e.index] = scaffoldStart.face1DistanceMm; return; }
        if (e.index === face2Edge.index) { d[e.index] = scaffoldStart.face2DistanceMm; return; }
      }
      d[e.index] = defaultDist;
    });
    return d;
  });

  const [result, setResult] = useState<AutoLayoutResult | null>(null);
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [focusedEdgeIndex, setFocusedEdgeIndex] = useState<number | null>(null);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);
  const [showLockedAlert, setShowLockedAlert] = useState(false);
  const [pendingHandrails, setPendingHandrails] = useState<Handrail[]>([]);
  const [conflictIds, setConflictIds] = useState<string[]>([]);

  const getDistance = (idx: number) => distances[idx] ?? defaultDist;

  const setDistance = (idx: number, value: number) => {
    setDistances(prev => ({ ...prev, [idx]: value }));
    setResult(null);
  };

  const handleCalc = () => {
    if (!building) return;
    const res = computeAutoLayout(building, distances, scaffoldStart);
    setResult(res);
    const sel: Record<number, number> = {};
    res.edgeLayouts.forEach((_, i) => { sel[i] = 0; });
    setSelections(sel);
  };

  const handlePlace = () => {
    if (!result || !building) return;
    const allHandrails: Handrail[] = [];

    for (let i = 0; i < result.edgeLayouts.length; i++) {
      const el = result.edgeLayouts[i];
      if (el.locked) continue;
      const selIdx = selections[i] ?? 0;
      const candidate = el.candidates[selIdx];
      if (!candidate || candidate.rails.length === 0) continue;

      const placements = placeHandrailsForEdge(el, candidate.rails);
      for (const p of placements) {
        allHandrails.push({
          id: uuidv4(),
          x: p.x, y: p.y,
          lengthMm: p.lengthMm,
          direction: p.direction,
          color: getHandrailColor(p.lengthMm),
        });
      }
    }

    if (allHandrails.length === 0) return;

    // 触れる既存手摺を検出
    const mmToG = (mm: number) => Math.round(mm / 10);
    const TOL = 2;
    const overlappingIds = canvasData.handrails.filter(existing => {
      return allHandrails.some(newH => {
        if (existing.direction !== newH.direction) return false;
        if (existing.direction === 'horizontal') {
          if (Math.abs(existing.y - newH.y) > TOL) return false;
          const e1 = existing.x, e2 = existing.x + mmToG(existing.lengthMm);
          const n1 = newH.x, n2 = newH.x + mmToG(newH.lengthMm);
          return e1 <= n2 + TOL && e2 >= n1 - TOL;
        } else {
          if (Math.abs(existing.x - newH.x) > TOL) return false;
          const e1 = existing.y, e2 = existing.y + mmToG(existing.lengthMm);
          const n1 = newH.y, n2 = newH.y + mmToG(newH.lengthMm);
          return e1 <= n2 + TOL && e2 >= n1 - TOL;
        }
      });
    }).map(h => h.id);

    // 干渉する既存部材がある場合はカスタム確認ダイアログ
    if (overlappingIds.length > 0) {
      setConflictIds(overlappingIds);
      setPendingHandrails(allHandrails);
      useCanvasStore.getState().setHighlightIds(overlappingIds);
      setShowConflictConfirm(true);
      return;
    }

    addHandrails(allHandrails);
    onClose();
  };

  const handleConflictOk = () => {
    useCanvasStore.getState().setHighlightIds([]);
    removeElements(conflictIds);
    addHandrails(pendingHandrails);
    setShowConflictConfirm(false);
    onClose();
  };

  const handleConflictCancel = () => {
    useCanvasStore.getState().setHighlightIds([]);
    setShowConflictConfirm(false);
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
    <div className="fixed inset-0 modal-overlay flex items-end sm:items-center justify-center z-50" onClick={showConflictConfirm ? undefined : onClose}>
      <div className="bg-dark-surface border-t sm:border border-dark-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-dark-surface px-4 py-3 border-b border-dark-border flex items-center justify-between z-10">
          <h2 className="font-bold text-lg">自動割付</h2>
          <button onClick={onClose} className="text-dimension hover:text-canvas px-2">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* プレビューSVG */}
          <PreviewSVG points={building.points} edges={edges} focusedIndex={focusedEdgeIndex}
            conflictHandrails={showConflictConfirm ? canvasData.handrails.filter(h => conflictIds.includes(h.id)) : undefined} />

          {/* 各辺の離れ入力 */}
          <div>
            <p className="text-sm text-dimension mb-2">各辺の離れ (mm)</p>
            <div className="space-y-1.5">
              {edges.map(edge => (
                <div key={edge.index} className="flex items-center gap-2">
                  <span className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${
                    focusedEdgeIndex === edge.index ? 'bg-accent text-white' : 'bg-dark-bg text-dimension'
                  }`}>
                    {edge.label}
                  </span>
                  <span className="text-[10px] text-dimension w-6 shrink-0">{FACE_LABEL[edge.face]}</span>
                  {lockedEdgeIndices.has(edge.index) ? (
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={getDistance(edge.index)}
                        disabled
                        className="w-full bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-sm font-mono opacity-50 cursor-not-allowed"
                      />
                      <div
                        className="absolute inset-0 cursor-not-allowed"
                        onClick={() => setShowLockedAlert(true)}
                      />
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={getDistance(edge.index)}
                      onChange={e => setDistance(edge.index, Math.max(0, Number(e.target.value)))}
                      onFocus={() => setFocusedEdgeIndex(edge.index)}
                      onBlur={() => setFocusedEdgeIndex(null)}
                      className={`flex-1 bg-dark-bg border rounded-lg px-2 py-1.5 text-sm font-mono ${
                        focusedEdgeIndex === edge.index ? 'border-accent' : 'border-dark-border'
                      }`}
                      min={0} step={10}
                    />
                  )}
                  {lockedEdgeIndices.has(edge.index) && (
                    <span className="text-[10px] text-dimension bg-dark-bg px-1.5 py-0.5 rounded border border-dark-border shrink-0">固定</span>
                  )}
                  <span className="text-[10px] text-dimension w-16 text-right shrink-0">{edge.lengthMm}mm</span>
                </div>
              ))}
            </div>
          </div>

          {scaffoldStart && (
            <p className="text-[10px] text-dimension">
              スタート角: {scaffoldStart.corner.toUpperCase()} /
              face1={scaffoldStart.face1FirstHandrail}mm /
              face2={scaffoldStart.face2FirstHandrail}mm
            </p>
          )}

          {/* 計算ボタン */}
          <button onClick={handleCalc}
            className="w-full py-2.5 bg-dark-bg border border-accent text-accent font-bold rounded-xl text-sm hover:bg-accent/10 transition-colors"
          >
            計算する
          </button>

          {/* 計算結果 */}
          {result && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-canvas">割付結果</p>

              {result.edgeLayouts.map((el, i) => {
                const selIdx = selections[i] ?? 0;
                const candidate = el.candidates[selIdx];
                if (!candidate) return null;

                return (
                  <div key={i} className={`bg-dark-bg rounded-xl p-3 ${el.locked ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold">
                        {el.edge.label} ({FACE_LABEL[el.edge.face]})
                        {el.locked && <span className="text-[10px] text-dimension ml-1">L字済</span>}
                      </span>
                      <span className="text-[10px] text-dimension">
                        辺長 {el.edgeLengthMm}mm / 有効 {el.effectiveMm}mm
                      </span>
                    </div>

                    {!el.locked && candidate.rails.length > 0 ? (
                      <>
                        <p className="text-xs text-canvas font-mono mb-1">
                          {formatRailsSummary(candidate.rails)}
                        </p>
                        <div className="flex flex-wrap gap-1 mb-1">
                          {candidate.rails.map((r, ri) => (
                            <span key={ri} className="px-1.5 py-0.5 bg-handrail/20 text-handrail text-[11px] font-mono rounded">
                              {r}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : !el.locked ? (
                      <p className="text-xs text-dimension">手摺なし</p>
                    ) : null}

                    {!el.locked && (
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-mono ${
                          candidate.remainder === 0 ? 'text-green-400' :
                          candidate.remainder < 0 ? 'text-red-400' : 'text-yellow-400'
                        }`}>
                          端数: {candidate.remainder >= 0 ? '+' : ''}{candidate.remainder}mm
                          {candidate.remainder < 0 && ' (突出)'}
                        </span>
                        <span className="text-[10px] text-dimension">{candidate.count}本</span>
                      </div>
                    )}

                    {!el.locked && el.candidates.length > 1 && (
                      <div className="mt-2 pt-2 border-t border-dark-border">
                        <p className="text-[10px] text-dimension mb-1">候補：</p>
                        <div className="flex flex-wrap gap-1">
                          {el.candidates.map((c, ci) => (
                            <button key={ci}
                              onClick={() => setSelections(prev => ({ ...prev, [i]: ci }))}
                              className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
                                selIdx === ci
                                  ? 'border-accent bg-accent/15 text-accent'
                                  : 'border-dark-border text-dimension hover:border-accent/50'
                              }`}
                            >
                              {formatRailsSummary(c.rails)} / {c.remainder >= 0 ? '+' : ''}{c.remainder}mm
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <button onClick={handlePlace}
                className="w-full py-3 bg-accent text-white font-bold rounded-xl text-lg"
              >
                配置する
              </button>
            </div>
          )}
        </div>
      </div>

      {showConflictConfirm && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] w-[90vw] max-w-sm bg-dark-surface border border-dark-border rounded-2xl shadow-2xl p-4">
          <p className="text-sm font-bold mb-1">干渉する既存部材があります</p>
          <p className="text-xs text-dimension mb-4">
            オレンジ色の部材（{conflictIds.length}本）が自動配置と干渉しています。削除して配置しますか？
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConflictCancel}
              className="flex-1 py-2 border border-dark-border rounded-xl text-sm text-dimension"
            >
              キャンセル
            </button>
            <button
              onClick={handleConflictOk}
              className="flex-1 py-2 bg-accent text-white font-bold rounded-xl text-sm"
            >
              削除して配置
            </button>
          </div>
        </div>
      )}

      {showLockedAlert && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLockedAlert(false)} />
          <div className="relative bg-dark-surface border border-dark-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <p className="font-bold text-sm mb-2">変更できません</p>
            <p className="text-xs text-dimension leading-relaxed mb-4">
              この面の離れは足場開始設定で確定された数値です。<br />
              変更する場合は「足場開始」ボタンから再設定してください。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLockedAlert(false)}
                className="flex-1 py-2.5 border border-dark-border text-dimension font-bold rounded-xl text-sm"
              >
                OK
              </button>
              <button
                onClick={() => {
                  setShowLockedAlert(false);
                  onClose();
                  onOpenScaffoldStart();
                }}
                className="flex-1 py-2.5 bg-accent text-white font-bold rounded-xl text-sm"
              >
                再設定する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
