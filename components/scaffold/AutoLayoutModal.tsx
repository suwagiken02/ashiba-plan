'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore } from '@/stores/canvasStore';
import { Handrail, HandrailLengthMm, Point, ScaffoldStartConfig, PhaseDFlowState, PhaseDCandidate } from '@/types';
import { getHandrailColor } from '@/lib/konva/handrailColors';
import NumInput from '@/components/ui/NumInput';
import { useHandrailSettingsStore } from '@/stores/handrailSettingsStore';
import {
  getBuildingEdgesClockwise,
  computeAutoLayout,
  placeHandrailsForEdge,
  getEdgesNotCoveredBy,
  isConvexCorner,
  AutoLayoutResult,
  EdgeInfo,
  EdgeLayout,
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

/** 建物プレビューSVG（辺ラベル付き、1F+2F同時対応） */
function PreviewSVG({ points, edges, focusedIndex, conflictHandrails, blinkEdgeIndex, subPoints, subEdges, subHighlightIndices, focusedSubIndex, scaffoldStart }: {
  points: Point[];
  edges: EdgeInfo[];
  focusedIndex: number | null;
  conflictHandrails?: { x: number; y: number; lengthMm: number; direction: 'horizontal' | 'vertical' | number }[];
  blinkEdgeIndex?: number;
  /** 1F+2F同時モード用: サブ建物（= 1F）の points */
  subPoints?: Point[];
  /** サブ建物の全辺情報（ラベル付与用） */
  subEdges?: EdgeInfo[];
  /** サブ建物で強調する辺の index 集合（= 下屋辺） */
  subHighlightIndices?: Set<number>;
  /** サブ建物でフォーカスされた辺（離れ入力 focus 時） */
  focusedSubIndex?: number | null;
  /** スタート角マーカー表示用（主建物 points 側） */
  scaffoldStart?: ScaffoldStartConfig;
}) {
  if (points.length < 3) return null;

  // 1F と 2F の points を合わせたバウンディングボックスで描画スケール算出
  const allX = [...points.map(p => p.x), ...(subPoints?.map(p => p.x) ?? [])];
  const allY = [...points.map(p => p.y), ...(subPoints?.map(p => p.y) ?? [])];
  const minX = Math.min(...allX), minY = Math.min(...allY);
  const bw = (Math.max(...allX) - minX) || 1;
  const bh = (Math.max(...allY) - minY) || 1;

  const pad = 32, svgW = 280, svgH = 180;
  const scale = Math.min((svgW - pad * 2) / bw, (svgH - pad * 2) / bh);
  const offsetX = pad + ((svgW - pad * 2) - bw * scale) / 2;
  const offsetY = pad + ((svgH - pad * 2) - bh * scale) / 2;
  const toSvg = (p: Point) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale });

  const svgPts = points.map(toSvg);
  const pathD = svgPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';

  // サブ建物（1F）のパス
  const subSvgPts = subPoints?.map(toSvg);
  const subPathD = subSvgPts
    ? subSvgPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'
    : null;

  return (
    <>
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} } .conflict-rail{animation:blink 0.8s ease-in-out infinite}`}</style>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto block">
        {/* サブ建物（1F）を背景に薄いアウトラインで描画 */}
        {subPathD && (
          <path d={subPathD} fill="rgba(160,160,170,0.15)" stroke="#888" strokeWidth={1} strokeDasharray="4 3" />
        )}

        {/* 主建物（2F または単一建物） */}
        <path d={pathD} fill="#3d3d3a" stroke="#1a1a18" strokeWidth={2} />

        {/* サブ建物の強調辺（= 下屋辺） */}
        {subEdges && subHighlightIndices && subEdges.filter(e => subHighlightIndices.has(e.index)).map(edge => {
          const s1 = toSvg(edge.p1);
          const s2 = toSvg(edge.p2);
          const mx = (s1.x + s2.x) / 2;
          const my = (s1.y + s2.y) / 2;
          const isFocused = focusedSubIndex === edge.index;
          const N = subEdges.length;
          const prevEdge = subEdges[(edge.index - 1 + N) % N];
          const nextEdge = subEdges[(edge.index + 1) % N];
          const concavePrev = !isConvexCorner(prevEdge, edge);
          const concaveNext = !isConvexCorner(edge, nextEdge);
          const labelDist = (concavePrev || concaveNext) ? 22 : 14;
          const lx = mx + edge.nx * labelDist;
          const ly = my + edge.ny * labelDist;
          return (
            <React.Fragment key={`sub-${edge.index}`}>
              <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
                stroke={isFocused ? '#fbbf24' : '#10b981'} strokeWidth={isFocused ? 5 : 3} strokeLinecap="round" />
              <text x={lx} y={ly}
                textAnchor="middle" dominantBaseline="central"
                fill={isFocused ? '#fbbf24' : '#10b981'}
                fontWeight="bold"
                fontSize={11} fontFamily="monospace"
              >{`1${edge.label}`}</text>
            </React.Fragment>
          );
        })}

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
        {blinkEdgeIndex !== undefined && edges.filter(e => e.index === blinkEdgeIndex).map(edge => {
          const s1 = toSvg(edge.p1);
          const s2 = toSvg(edge.p2);
          return (
            <line key={`blink-${edge.index}`} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
              stroke="#FF6B35" strokeWidth={6} strokeLinecap="round" className="conflict-rail" />
          );
        })}
        {edges.map(edge => {
          const s1 = toSvg(edge.p1);
          const s2 = toSvg(edge.p2);
          const mx = (s1.x + s2.x) / 2;
          const my = (s1.y + s2.y) / 2;
          const isFocused = focusedIndex === edge.index;

          const N = edges.length;
          const prevEdge = edges[(edge.index - 1 + N) % N];
          const nextEdge = edges[(edge.index + 1) % N];
          const concavePrev = !isConvexCorner(prevEdge, edge);
          const concaveNext = !isConvexCorner(edge, nextEdge);
          const labelDist = (concavePrev || concaveNext) ? 22 : 14;
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
        {/* スタート角★マーカー（最前面） */}
        {scaffoldStart && scaffoldStart.startVertexIndex !== undefined && points.length > 0 && (() => {
          const idx = scaffoldStart.startVertexIndex! % points.length;
          const svgPt = toSvg(points[idx]);
          return (
            <text
              x={svgPt.x}
              y={svgPt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={20}
              fontWeight="bold"
              fill="#FFD700"
              stroke="#000"
              strokeWidth={0.8}
              style={{ paintOrder: 'stroke' }}
            >
              ★
            </text>
          );
        })()}
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

  // bothモード時、プレビュー用に 1F 全辺（ラベル A/B/C/D...）
  const edges1FAll = useMemo(() => {
    if (targetFloor !== 'both' || !building1F) return [];
    return getBuildingEdgesClockwise(building1F);
  }, [targetFloor, building1F]);

  // 下屋辺の index セット（プレビュー強調 & 下屋入力 UI で利用）
  const uncoveredIdxSet1F = useMemo(
    () => new Set(uncoveredEdges1F.map(e => e.index)),
    [uncoveredEdges1F],
  );

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

  // 下屋辺の変化時に distances1F を初期化（デフォルト 900mm）。
  // 既に入力があれば保持。
  useEffect(() => {
    setDistances1F(prev => {
      const next: Record<number, number> = {};
      uncoveredEdges1F.forEach(e => {
        next[e.index] = prev[e.index] ?? 900;
      });
      return next;
    });
  }, [uncoveredEdges1F]);

  // 対象階切替時は distances をその階用に再構築
  useEffect(() => {
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
    setDistances(d);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFloor, building?.id]);

  const [result, setResult] = useState<AutoLayoutResult | null>(null);
  // 「1F+2F同時」モード専用: サブ階層（= 1F 下屋辺）の割付結果
  const [resultSub, setResultSub] = useState<AutoLayoutResult | null>(null);
  // 「1F+2F同時」モード専用: 1F下屋辺用の離れ（edgeIndex → mm）
  const [distances1F, setDistances1F] = useState<Record<number, number>>({});
  // 「1F+2F同時」モード専用: 1F下屋辺の候補選択 index
  const [selectionsSub, setSelectionsSub] = useState<Record<number, number>>({});
  const [focusedSubEdgeIndex, setFocusedSubEdgeIndex] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [focusedEdgeIndex, setFocusedEdgeIndex] = useState<number | null>(null);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);
  const [showLockedAlert, setShowLockedAlert] = useState(false);
  const [pendingHandrails, setPendingHandrails] = useState<Handrail[]>([]);
  const [conflictIds, setConflictIds] = useState<string[]>([]);
  const [distanceSuggestions, setDistanceSuggestions] = useState<{
    edgeIndex: number;
    edgeLabel: string;
    currentDist: number;
    suggestions: number[];
  }[]>([]);
  const [currentSuggestionIdx, setCurrentSuggestionIdx] = useState(0);

  // 【Phase D】繋がる離れ提案モード（常時有効。従来モードのコードは残すが UI からはアクセス不可）
  const phaseDMode = true;
  const setPhaseDMode = (_: boolean) => {}; // no-op、既存呼び出し箇所のエラー回避
  const [phaseDStep, setPhaseDStep] = useState<'input' | 'sequential' | 'done'>('input');
  const [phaseDDesiredDistances, setPhaseDDesiredDistances] = useState<Record<number, number>>({});
  const [phaseDFlowState, setPhaseDFlowState] = useState<PhaseDFlowState | null>(null);

  const getDistance = (idx: number) => distances[idx] ?? defaultDist;

  const setDistance = (idx: number, value: number) => {
    setDistances(prev => ({ ...prev, [idx]: value }));
    setResult(null);
  };

  // 問題辺の effectiveMm は「隣接2辺の離れ」で決まる（自身の離れは無関係）。
  // 修正する離れは問題辺の隣接非L辺（= prev か next の非L字側）を対象にする。
  // 新離れ = 隣接非L辺の現在離れ - 問題辺のremainder
  //   remainder > 0 (不足) → 新離れ = 現在離れ - remainder（隣接離れを縮める）
  //   remainder < 0 (突出) → 新離れ = 現在離れ + |remainder|（隣接離れを伸ばす）
  // 戻り値は "どの辺を調整するか" も含む。
  const findDistanceSuggestions = (el: EdgeLayout): {
    adjustEdgeIndex: number; adjustLabel: string; currentDist: number; newDists: number[];
  } | null => {
    const edgeIdx = edges.findIndex(e => e.index === el.edge.index);
    if (edgeIdx < 0) return null;
    const nE = edges.length;
    const prevE = edges[(edgeIdx - 1 + nE) % nE];
    const nextE = edges[(edgeIdx + 1) % nE];
    // 隣接辺のうち L字固定でない側を調整対象とする
    let adjE: typeof prevE | null = null;
    if (!lockedEdgeIndices.has(prevE.index)) adjE = prevE;
    else if (!lockedEdgeIndices.has(nextE.index)) adjE = nextE;
    if (!adjE) return null; // 両隣が L字固定 → 調整不能
    const currentDist = distances[adjE.index] ?? 900;
    const newDists: number[] = [];
    for (const cand of el.candidates) {
      if (cand.remainder === 0) continue;
      const newDist = Math.round(currentDist - cand.remainder);
      if (newDist > 0 && newDist !== currentDist && !newDists.includes(newDist)) {
        newDists.push(newDist);
      }
    }
    if (newDists.length === 0) return null;
    return { adjustEdgeIndex: adjE.index, adjustLabel: adjE.label, currentDist, newDists: newDists.slice(0, 2) };
  };

  const handleCalc = () => {
    if (!building) return;
    // プライマリ計算（1Fのみ→1F全周 / 2Fのみ→2F全周 / both→2F全周）
    const res = computeAutoLayout(building, distances, scaffoldStart, enabledSizes, priorityConfig);

    // 1F+2F 同時モード: 1F のうち 2F で覆われていない辺（下屋辺）を計算
    if (targetFloor === 'both' && building1F && building2F && uncoveredEdges1F.length > 0) {
      // 1F 全辺の離れを用意（下屋辺は UI で編集された値、その他はデフォルト 900mm）
      const d1: Record<number, number> = {};
      getBuildingEdgesClockwise(building1F).forEach(e => {
        d1[e.index] = distances1F[e.index] ?? 900;
      });
      const res1 = computeAutoLayout(building1F, d1, undefined, enabledSizes, priorityConfig);
      // 下屋辺だけに edgeLayouts を絞り込む
      const uncoveredIdxSet = new Set(uncoveredEdges1F.map(e => e.index));
      const filtered = res1.edgeLayouts.filter(el => uncoveredIdxSet.has(el.edge.index));
      setResultSub({ edgeLayouts: filtered });
      // 選択 index を初期化
      const sel: Record<number, number> = {};
      filtered.forEach(el => { sel[el.edge.index] = 0; });
      setSelectionsSub(sel);
    } else {
      setResultSub(null);
      setSelectionsSub({});
    }

    // 端数が残る面を検出（固定面は除く）
    const problemEdges = res.edgeLayouts.filter(el =>
      !el.locked &&
      el.candidates[0]?.remainder !== 0 &&
      !lockedEdgeIndices.has(el.edge.index)
    );

    console.log('[handleCalc] problemEdges:', problemEdges.map(el => ({
      label: el.edge.label,
      remainder: el.candidates[0]?.remainder,
      locked: el.locked,
      lockedByIndex: lockedEdgeIndices.has(el.edge.index),
    })));

    if (problemEdges.length > 0) {
      const seen = new Set<string>();
      const suggestions = problemEdges
        .map(el => {
          const r = findDistanceSuggestions(el);
          if (!r) return null;
          // 同じ隣接非L辺を複数の問題辺が指す場合は重複排除
          const key = `${r.adjustEdgeIndex}|${r.newDists.join(',')}`;
          if (seen.has(key)) return null;
          seen.add(key);
          return {
            edgeIndex: r.adjustEdgeIndex,
            edgeLabel: r.adjustLabel,
            currentDist: r.currentDist,
            suggestions: r.newDists,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      console.log('[handleCalc] suggestions:', suggestions.map(s => ({
        label: s.edgeLabel,
        currentDist: s.currentDist,
        suggestions: s.suggestions,
      })));

      if (suggestions.length > 0) {
        setDistanceSuggestions(suggestions);
        setCurrentSuggestionIdx(0);
        setResult(res); // 現在の結果も表示
        return;
      }
    }

    setDistanceSuggestions([]);
    setResult(res);
    const sel: Record<number, number> = {};
    res.edgeLayouts.forEach((_, i) => { sel[i] = 0; });
    setSelections(sel);
  };

  const handleSuggestionAccept = (newDist: number) => {
    const suggestion = distanceSuggestions[currentSuggestionIdx];
    const newDistances = { ...distances, [suggestion.edgeIndex]: newDist };
    setDistances(newDistances);
    proceedToNextSuggestion(newDistances);
  };

  const handleSuggestionSkip = () => {
    proceedToNextSuggestion(distances);
  };

  const proceedToNextSuggestion = (currentDistances: Record<number, number>) => {
    const nextIdx = currentSuggestionIdx + 1;
    if (nextIdx < distanceSuggestions.length) {
      setCurrentSuggestionIdx(nextIdx);
    } else {
      setDistanceSuggestions([]);
      if (!building) return;
      const res = computeAutoLayout(building, currentDistances, scaffoldStart, enabledSizes, priorityConfig);
      setResult(res);
      const sel: Record<number, number> = {};
      res.edgeLayouts.forEach((_, i) => { sel[i] = 0; });
      setSelections(sel);
    }
  };

  const handlePlace = () => {
    if (!result || !building) return;
    const allHandrails: Handrail[] = [];

    // L字辺も通常辺と同様に配置する（L字辺の特徴は「離れ固定 + ダイアログ対象外」のみ）。
    // ScaffoldStartModal で既に置かれた L字辺の始点手摺は、下の overlappingIds で検出されて
    // 削除ダイアログが出るので、ユーザーが置換を承認すれば正しい配置に再構成される。
    for (let i = 0; i < result.edgeLayouts.length; i++) {
      const el = result.edgeLayouts[i];
      const selIdx = selections[i] ?? 0;
      const candidate = el.candidates[selIdx];
      if (!candidate || candidate.rails.length === 0) continue;

      const placements = placeHandrailsForEdge(el, candidate.rails);
      // プライマリの所属階:
      // 1Fのみ → 1F、2Fのみ → 2F、both → 2F（botheは2F全周が主）
      const mainFloor: 1 | 2 = targetFloor === 1 ? 1 : 2;
      for (const p of placements) {
        allHandrails.push({
          id: uuidv4(),
          x: p.x, y: p.y,
          lengthMm: p.lengthMm,
          direction: p.direction,
          color: getHandrailColor(p.lengthMm),
          floor: mainFloor,
        });
      }
    }

    // 1F+2F 同時: 1F のうち 2F で覆われない辺（下屋辺）の手摺を追加
    if (targetFloor === 'both' && resultSub) {
      for (const el of resultSub.edgeLayouts) {
        const selIdx = selectionsSub[el.edge.index] ?? 0;
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
            floor: 1, // 下屋辺は1F部材
          });
        }
      }
    }

    if (allHandrails.length === 0) return;

    // 触れる既存手摺を検出（各手摺について同じ階のもののみ比較）。
    // 1F+2F同時モードでも、1F 手摺は 1F と、2F 手摺は 2F と比較される。
    const mmToG = (mm: number) => Math.round(mm / 10);
    const TOL = 2;
    const overlappingIds = canvasData.handrails.filter(existing => {
      return allHandrails.some(newH => {
        if ((newH.floor ?? 1) !== (existing.floor ?? 1)) return false;
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
    <div className="fixed inset-0 modal-overlay flex items-end sm:items-center justify-center z-50" onClick={(showConflictConfirm || distanceSuggestions.length > 0) ? undefined : onClose}>
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
          {!phaseDMode ? (
            <>
          {/* プレビューSVG（bothモードでは 1F を背景、下屋辺を緑で強調） */}
          <PreviewSVG
            points={building.points}
            edges={edges}
            focusedIndex={focusedEdgeIndex}
            conflictHandrails={showConflictConfirm ? canvasData.handrails.filter(h => conflictIds.includes(h.id)) : undefined}
            subPoints={targetFloor === 'both' && building1F ? building1F.points : undefined}
            subEdges={targetFloor === 'both' ? edges1FAll : undefined}
            subHighlightIndices={targetFloor === 'both' ? uncoveredIdxSet1F : undefined}
            focusedSubIndex={focusedSubEdgeIndex}
            scaffoldStart={scaffoldStart}
          />

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
                    // NumInput: 内部テキストstate + blur/Enterでコミット。
                    // これにより入力途中の "9" や空欄を許容し、Backspace で自由に編集可能。
                    <NumInput
                      value={getDistance(edge.index)}
                      onChange={v => setDistance(edge.index, Math.max(0, v))}
                      onFocus={() => setFocusedEdgeIndex(edge.index)}
                      onBlur={() => setFocusedEdgeIndex(null)}
                      min={0} step={1}
                      className={`flex-1 bg-dark-bg border rounded-lg px-2 py-1.5 text-sm font-mono ${
                        focusedEdgeIndex === edge.index ? 'border-accent' : 'border-dark-border'
                      }`}
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

          {/* 1F下屋辺の離れ入力（1F+2F同時モード・下屋辺あり時のみ表示） */}
          {targetFloor === 'both' && uncoveredEdges1F.length > 0 && (
            <div>
              <p className="text-sm text-dimension mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
                1F 下屋辺の離れ (mm)
                <span className="text-[10px] text-dimension/70">({uncoveredEdges1F.length} 本)</span>
              </p>
              <div className="space-y-1.5">
                {uncoveredEdges1F.map(edge => (
                  <div key={`sub-${edge.index}`} className="flex items-center gap-2">
                    <span className={`w-8 h-6 flex items-center justify-center rounded text-xs font-bold ${
                      focusedSubEdgeIndex === edge.index ? 'bg-green-500 text-white' : 'bg-dark-bg text-green-400'
                    }`}>
                      1{edge.label}
                    </span>
                    <span className="text-[10px] text-dimension w-6 shrink-0">{FACE_LABEL[edge.face]}</span>
                    <NumInput
                      value={distances1F[edge.index] ?? 900}
                      onChange={v => {
                        setDistances1F(prev => ({ ...prev, [edge.index]: Math.max(0, v) }));
                        setResultSub(null);
                      }}
                      onFocus={() => setFocusedSubEdgeIndex(edge.index)}
                      onBlur={() => setFocusedSubEdgeIndex(null)}
                      min={0} step={1}
                      className={`flex-1 bg-dark-bg border rounded-lg px-2 py-1.5 text-sm font-mono ${
                        focusedSubEdgeIndex === edge.index ? 'border-green-500' : 'border-dark-border'
                      }`}
                    />
                    <span className="text-[10px] text-dimension w-16 text-right shrink-0">{edge.lengthMm}mm</span>
                  </div>
                ))}
              </div>
            </div>
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
              <p className="text-sm font-bold text-canvas">
                {targetFloor === 'both' ? '割付結果 (2F全周)' : '割付結果'}
              </p>

              {result.edgeLayouts.map((el, i) => {
                const selIdx = selections[i] ?? 0;
                const candidate = el.candidates[selIdx];
                if (!candidate) return null;

                return (
                  <div key={i} className="bg-dark-bg rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold">
                        {el.edge.label} ({FACE_LABEL[el.edge.face]})
                        {el.locked && <span className="text-[10px] text-dimension ml-1">L字固定</span>}
                      </span>
                      <span className="text-[10px] text-dimension">
                        辺長 {el.edgeLengthMm}mm / 有効 {el.effectiveMm}mm
                      </span>
                    </div>

                    {candidate.rails.length > 0 ? (
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
                    ) : (
                      <p className="text-xs text-dimension">手摺なし</p>
                    )}

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

                    {el.candidates.length > 1 && (
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

              {/* 1F 下屋辺の結果（bothモード + 下屋あり時のみ） */}
              {targetFloor === 'both' && resultSub && resultSub.edgeLayouts.length > 0 && (
                <div className="pt-3 mt-3 border-t border-dark-border space-y-2">
                  <p className="text-sm font-bold text-green-400">
                    割付結果 (1F 下屋辺)
                  </p>
                  {resultSub.edgeLayouts.map((el) => {
                    const selIdx = selectionsSub[el.edge.index] ?? 0;
                    const candidate = el.candidates[selIdx];
                    if (!candidate) return null;
                    return (
                      <div key={`sub-${el.edge.index}`} className="bg-dark-bg rounded-xl p-3 border-l-2 border-green-500">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-green-400">
                            1{el.edge.label} ({FACE_LABEL[el.edge.face]})
                          </span>
                          <span className="text-[10px] text-dimension">
                            辺長 {el.edgeLengthMm}mm / 有効 {el.effectiveMm}mm
                          </span>
                        </div>
                        {candidate.rails.length > 0 ? (
                          <>
                            <p className="text-xs text-canvas font-mono mb-1">
                              {formatRailsSummary(candidate.rails)}
                            </p>
                            <div className="flex flex-wrap gap-1 mb-1">
                              {candidate.rails.map((r, ri) => (
                                <span key={ri} className="px-1.5 py-0.5 bg-green-500/20 text-green-300 text-[11px] font-mono rounded">
                                  {r}
                                </span>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-dimension">手摺なし</p>
                        )}
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
                        {el.candidates.length > 1 && (
                          <div className="mt-2 pt-2 border-t border-dark-border">
                            <p className="text-[10px] text-dimension mb-1">候補：</p>
                            <div className="flex flex-wrap gap-1">
                              {el.candidates.map((c, ci) => (
                                <button key={ci}
                                  onClick={() => setSelectionsSub(prev => ({ ...prev, [el.edge.index]: ci }))}
                                  className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
                                    selIdx === ci
                                      ? 'border-green-500 bg-green-500/15 text-green-400'
                                      : 'border-dark-border text-dimension hover:border-green-500/50'
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
                </div>
              )}

              <button onClick={handlePlace}
                className="w-full py-3 bg-accent text-white font-bold rounded-xl text-lg"
              >
                配置する
              </button>
            </div>
          )}
            </>
          ) : (
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
                  onClick={() => setPhaseDMode(false)}
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
            </>
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

      {distanceSuggestions.length > 0 && currentSuggestionIdx < distanceSuggestions.length && (() => {
        const suggestion = distanceSuggestions[currentSuggestionIdx];
        const currentRemainder = result?.edgeLayouts.find(el => el.edge.index === suggestion.edgeIndex)?.candidates[0]?.remainder;
        return (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative bg-dark-surface border-t sm:border border-dark-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg z-10">
              <div className="px-4 py-3 border-b border-dark-border">
                <p className="font-bold text-sm">離れの調整提案</p>
                <p className="text-xs text-dimension mt-0.5">{currentSuggestionIdx + 1} / {distanceSuggestions.length} 面</p>
              </div>

              <div className="px-4 pt-3">
                <PreviewSVG
                  points={building!.points}
                  edges={edges}
                  focusedIndex={suggestion.edgeIndex}
                  blinkEdgeIndex={suggestion.edgeIndex}
                  scaffoldStart={scaffoldStart}
                />
              </div>

              <div className="px-4 py-3 space-y-3">
                <p className="text-sm">
                  <span className="font-bold">{suggestion.edgeLabel}面</span>（現在の離れ: {suggestion.currentDist}mm）で
                  <span className="text-yellow-400 font-bold"> 端数{currentRemainder ?? '?'}mm </span>が発生しています。
                </p>
                <p className="text-xs text-dimension">以下の離れに変更すると端数0になります：</p>
                <div className="flex flex-wrap gap-2">
                  {suggestion.suggestions.map((dist) => (
                    <button key={dist} onClick={() => handleSuggestionAccept(dist)}
                      className="px-4 py-2 bg-accent/15 border border-accent text-accent font-bold rounded-xl text-sm hover:bg-accent/25 transition-colors"
                    >
                      {dist}mm
                      <span className="text-[10px] ml-1 opacity-70">({dist > suggestion.currentDist ? '+' : ''}{dist - suggestion.currentDist})</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSuggestionSkip}
                    className="flex-1 py-2.5 border border-dark-border text-dimension rounded-xl text-sm"
                  >
                    変更せず次へ
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
