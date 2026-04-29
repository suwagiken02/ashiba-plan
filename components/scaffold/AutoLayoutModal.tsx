'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore } from '@/stores/canvasStore';
import { Handrail, HandrailLengthMm, Point, ScaffoldStartConfig } from '@/types';
import { getHandrailColor } from '@/lib/konva/handrailColors';
import NumInput from '@/components/ui/NumInput';
import { useHandrailSettingsStore } from '@/stores/handrailSettingsStore';
import {
  getBuildingEdgesClockwise,
  computeAutoLayoutSequential,
  sequentialResultToAutoLayoutResult,
  placeHandrailsForEdge,
  getEdgesNotCoveredBy,
  isConvexCorner,
  generateSequentialCandidates,
  AutoLayoutResult,
  EdgeInfo,
  SequentialLayoutResult,
  EdgeAdjustment,
  DEFAULT_EDGE_ADJUSTMENT,
} from '@/lib/konva/autoLayoutUtils';
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
  // 初期値: scaffoldStart1F があれば 1F、2F だけあれば 2F、旧 scaffoldStart があればその floor、どれもなければ 1F
  const [targetFloor, setTargetFloor] = useState<1 | 2 | 'both'>(() => {
    if (canvasData.scaffoldStart1F) return 1;
    if (canvasData.scaffoldStart2F) return 2;
    return (canvasData.scaffoldStart?.floor ?? 1) as 1 | 2;
  });

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
  // 優先順: 新フィールド (scaffoldStart1F / scaffoldStart2F) → 旧 scaffoldStart (後方互換)
  // 該当階の建物が存在しない場合は undefined（偽スタート角防止）
  const scaffoldStart = useMemo(() => {
    const effectiveFloor = targetFloor === 'both' ? 2 : targetFloor;
    const hasFloorBuilding = effectiveFloor === 1 ? !!building1F : !!building2F;
    if (!hasFloorBuilding) return undefined;
    const newSS = effectiveFloor === 1 ? canvasData.scaffoldStart1F : canvasData.scaffoldStart2F;
    if (newSS) return newSS;
    const legacy = canvasData.scaffoldStart;
    if (!legacy) return undefined;
    return (legacy.floor ?? 1) === effectiveFloor ? legacy : undefined;
  }, [canvasData.scaffoldStart1F, canvasData.scaffoldStart2F, canvasData.scaffoldStart, targetFloor, building1F, building2F]);

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
  // Phase H-3b-2-1 / H-3d-1: 順次決定の状態管理を 2F / 1F の 2 本立てに拡張
  // - 1Fのみ・2Fのみモードでは sequentialResult2F のみ使用、1F は null 維持
  // - bothmode では 2F 全周 + 1F 下屋辺の両方を保持
  const [sequentialResult2F, setSequentialResult2F] = useState<SequentialLayoutResult | null>(null);
  const [sequentialResult1F, setSequentialResult1F] = useState<SequentialLayoutResult | null>(null);
  const [userSelections2F, setUserSelections2F] = useState<Record<number, number>>({});
  const [userSelections1F, setUserSelections1F] = useState<Record<number, number>>({});
  // Phase I-2: 各辺ごとの「割り変更」「←/→」操作状態
  const [userAdjustments2F, setUserAdjustments2F] = useState<Record<number, EdgeAdjustment>>({});
  const [userAdjustments1F, setUserAdjustments1F] = useState<Record<number, EdgeAdjustment>>({});
  const [activeEdge, setActiveEdge] = useState<{ floor: 1 | 2; index: number } | null>(null);

  // Phase I-3-fix: 順次決定の表示順を scaffoldStart 起点 cascade 順に並べ替え。
  // 内部 cascade は (startIdx + k) % n で進むが edgeResults は物理 index 順で格納されるため、
  // UI 側で改めて cascade 順に並べ直す。scaffoldStart 無し時は startIdx=0 (= 物理順)。
  // ハンドラ内 (state 更新前の seqResult を扱う) でも使えるよう純粋関数として定義。
  const startIdxFor2F = useMemo(() => {
    if (!sequentialResult2F || !scaffoldStart) return 0;
    const n = sequentialResult2F.edgeResults.length;
    return n > 0 ? (scaffoldStart.startVertexIndex ?? 0) % n : 0;
  }, [sequentialResult2F, scaffoldStart]);
  const getCascadeOrderedEdges = (seqResult: SequentialLayoutResult, startIdx: number) => {
    const n = seqResult.edgeResults.length;
    if (n === 0) return [];
    return Array.from({ length: n }, (_, k) => seqResult.edgeResults[(startIdx + k) % n]);
  };
  const cascadeOrdered2F = useMemo(() => {
    if (!sequentialResult2F) return null;
    return getCascadeOrderedEdges(sequentialResult2F, startIdxFor2F);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequentialResult2F, startIdxFor2F]);
  // 1F は scaffoldStart 無し設計 (bothmode 1F 下屋辺)。startIdx=0 で物理 index 順 = 既存挙動。
  const cascadeOrdered1F = useMemo(() => {
    if (!sequentialResult1F) return null;
    return [...sequentialResult1F.edgeResults];
  }, [sequentialResult1F]);

  const getDistance = (idx: number) => distances[idx] ?? defaultDist;

  const setDistance = (idx: number, value: number) => {
    setDistances(prev => ({ ...prev, [idx]: value }));
    setResult(null);
    // 順次決定 state もリセット（1F/2F 両方）
    setSequentialResult2F(null);
    setSequentialResult1F(null);
    setUserSelections2F({});
    setUserSelections1F({});
    // Phase I-2: 離れ変更時は adjustments もリセット
    setUserAdjustments2F({});
    setUserAdjustments1F({});
    setActiveEdge(null);
  };

  const handleCalc = () => {
    if (!building) return;
    // 主建物（1Fのみ→1F、2Fのみ→2F、bothmode→2F）の順次決定
    const seqRes2F = computeAutoLayoutSequential(
      building, distances, scaffoldStart, enabledSizes, priorityConfig, userSelections2F, userAdjustments2F,
    );
    setSequentialResult2F(seqRes2F);
    const res = sequentialResultToAutoLayoutResult(seqRes2F);

    // bothmode: 1F 下屋辺の順次決定（H-3d-1: 1F 用 sequentialResult を独立保持）
    let seqRes1F: SequentialLayoutResult | null = null;
    if (targetFloor === 'both' && building1F && building2F && uncoveredEdges1F.length > 0) {
      const d1: Record<number, number> = {};
      getBuildingEdgesClockwise(building1F).forEach(e => {
        d1[e.index] = distances1F[e.index] ?? 900;
      });
      const fullSeq1F = computeAutoLayoutSequential(building1F, d1, undefined, enabledSizes, priorityConfig, userSelections1F, userAdjustments1F);
      // 下屋辺だけに edgeResults を絞り込む（filter 後の SequentialLayoutResult を組み立て）
      const uncoveredIdxSet = new Set(uncoveredEdges1F.map(e => e.index));
      const filteredEdgeResults = fullSeq1F.edgeResults.filter(er => uncoveredIdxSet.has(er.edge.index));
      // hasUnresolved を filter 後の辺で再判定
      const filteredHasUnresolved = filteredEdgeResults.some(er => !er.isLocked && !er.isAutoProgress);
      seqRes1F = { edgeResults: filteredEdgeResults, hasUnresolved: filteredHasUnresolved };
      setSequentialResult1F(seqRes1F);
      // 旧形式 resultSub も互換のため作成（handlePlace のため）
      const filteredAdapted = sequentialResultToAutoLayoutResult(seqRes1F);
      setResultSub(filteredAdapted);
      const selSub: Record<number, number> = {};
      filteredAdapted.edgeLayouts.forEach(el => { selSub[el.edge.index] = el.selectedIndex; });
      setSelectionsSub(selSub);
    } else {
      setSequentialResult1F(null);
      setResultSub(null);
      setSelectionsSub({});
    }

    setResult(res);
    const sel: Record<number, number> = {};
    res.edgeLayouts.forEach((el, i) => { sel[i] = el.selectedIndex; });
    setSelections(sel);

    // Phase I-3-fix: cascade 順で「最初の未解決辺」を探す
    // 起点辺・閉じ辺も対象 (isLocked スキップを廃止、isAutoProgress のみスキップ)
    const startIdx2F = scaffoldStart && seqRes2F.edgeResults.length > 0
      ? (scaffoldStart.startVertexIndex ?? 0) % seqRes2F.edgeResults.length
      : 0;
    const ordered2F = getCascadeOrderedEdges(seqRes2F, startIdx2F);
    const firstUnresolved2F = ordered2F.find(er => !er.isAutoProgress);
    const has2FUnresolved = firstUnresolved2F !== undefined;
    if (has2FUnresolved && firstUnresolved2F) {
      setActiveEdge({ floor: 2, index: firstUnresolved2F.edge.index });
    } else if (seqRes1F) {
      const ordered1F = getCascadeOrderedEdges(seqRes1F, 0);
      const firstUnresolved1F = ordered1F.find(er => !er.isAutoProgress);
      if (firstUnresolved1F) {
        setActiveEdge({ floor: 1, index: firstUnresolved1F.edge.index });
      } else {
        setActiveEdge(null);
      }
    } else {
      setActiveEdge(null);
    }
  };

  // 1F 下屋辺だけの SequentialLayoutResult を組み立てるヘルパー
  const recompute1FSubResult = (
    selections1F: Record<number, number>,
    adjustments1F: Record<number, EdgeAdjustment> = userAdjustments1F,
  ): SequentialLayoutResult | null => {
    if (targetFloor !== 'both' || !building1F || !building2F || uncoveredEdges1F.length === 0) {
      return null;
    }
    const d1: Record<number, number> = {};
    getBuildingEdgesClockwise(building1F).forEach(e => {
      d1[e.index] = distances1F[e.index] ?? 900;
    });
    const fullSeq1F = computeAutoLayoutSequential(
      building1F, d1, undefined, enabledSizes, priorityConfig, selections1F, adjustments1F,
    );
    const uncoveredIdxSet = new Set(uncoveredEdges1F.map(e => e.index));
    const filteredEdgeResults = fullSeq1F.edgeResults.filter(er => uncoveredIdxSet.has(er.edge.index));
    const filteredHasUnresolved = filteredEdgeResults.some(er => !er.isLocked && !er.isAutoProgress);
    return { edgeResults: filteredEdgeResults, hasUnresolved: filteredHasUnresolved };
  };

  // Phase H-3d-1: 順次決定の候補選択（2F / 1F 両対応）
  const handleSequentialSelect = (floor: 1 | 2, edgeIndex: number, candIdx: number) => {
    if (!building) return;

    if (floor === 2) {
      // 2F の選択
      const newSelections2F = { ...userSelections2F, [edgeIndex]: candIdx };
      setUserSelections2F(newSelections2F);

      const seqRes2F = computeAutoLayoutSequential(
        building, distances, scaffoldStart, enabledSizes, priorityConfig, newSelections2F, userAdjustments2F,
      );
      setSequentialResult2F(seqRes2F);
      const adapted = sequentialResultToAutoLayoutResult(seqRes2F);
      setResult(adapted);
      const sel: Record<number, number> = {};
      adapted.edgeLayouts.forEach((el, i) => { sel[i] = el.selectedIndex; });
      setSelections(sel);

      // Phase I-3-fix: cascade 順で次の未解決辺を探す
      const startIdx2F = scaffoldStart && seqRes2F.edgeResults.length > 0
        ? (scaffoldStart.startVertexIndex ?? 0) % seqRes2F.edgeResults.length
        : 0;
      const ordered2F = getCascadeOrderedEdges(seqRes2F, startIdx2F);
      const currentIdx2F = ordered2F.findIndex(er => er.edge.index === edgeIndex);
      const next2F = ordered2F
        .slice(currentIdx2F + 1)
        .find(er => !er.isAutoProgress);

      if (next2F) {
        setActiveEdge({ floor: 2, index: next2F.edge.index });
        return;
      }

      // 2F 全解決 → 1F 下屋辺の最初の未解決へ（あれば）
      if (sequentialResult1F) {
        const ordered1F = getCascadeOrderedEdges(sequentialResult1F, 0);
        const first1F = ordered1F.find(er => !er.isAutoProgress);
        if (first1F) {
          setActiveEdge({ floor: 1, index: first1F.edge.index });
          return;
        }
      }
      setActiveEdge(null);
    } else {
      // 1F 下屋辺の選択
      const newSelections1F = { ...userSelections1F, [edgeIndex]: candIdx };
      setUserSelections1F(newSelections1F);

      const seqRes1F = recompute1FSubResult(newSelections1F);
      setSequentialResult1F(seqRes1F);
      if (seqRes1F) {
        const adaptedSub = sequentialResultToAutoLayoutResult(seqRes1F);
        setResultSub(adaptedSub);
        const selSub: Record<number, number> = {};
        adaptedSub.edgeLayouts.forEach(el => { selSub[el.edge.index] = el.selectedIndex; });
        setSelectionsSub(selSub);

        // Phase I-3-fix: 1F は scaffoldStart 無し → cascade 順 = 物理 index 順
        const ordered1F = getCascadeOrderedEdges(seqRes1F, 0);
        const currentIdx1F = ordered1F.findIndex(er => er.edge.index === edgeIndex);
        const next1F = ordered1F
          .slice(currentIdx1F + 1)
          .find(er => !er.isAutoProgress);
        if (next1F) {
          setActiveEdge({ floor: 1, index: next1F.edge.index });
          return;
        }
      }
      // 1F 全解決
      setActiveEdge(null);
    }
  };

  // Phase H-3d-1: 順次決定で前の辺に戻る（2F / 1F 両対応、floor 跨ぎあり）
  const handleSequentialBack = () => {
    if (!building || !activeEdge) return;

    if (activeEdge.floor === 1 && sequentialResult1F) {
      // Phase I-3-fix: cascade 順で前の未解決辺を探す
      const ordered1F = getCascadeOrderedEdges(sequentialResult1F, 0);
      const currentIdx = ordered1F.findIndex(er => er.edge.index === activeEdge.index);
      const prev1F = ordered1F
        .slice(0, currentIdx)
        .reverse()
        .find(er => !er.isAutoProgress);
      if (prev1F) {
        const newSelections1F = { ...userSelections1F };
        delete newSelections1F[prev1F.edge.index];
        setUserSelections1F(newSelections1F);
        // Phase I-2: 戻り辺の adjustments もクリア
        const newAdjustments1F = { ...userAdjustments1F };
        delete newAdjustments1F[prev1F.edge.index];
        setUserAdjustments1F(newAdjustments1F);
        const seqRes1F = recompute1FSubResult(newSelections1F, newAdjustments1F);
        setSequentialResult1F(seqRes1F);
        setActiveEdge({ floor: 1, index: prev1F.edge.index });
        return;
      }
      // 1F 内に戻る先なし → 2F の最後の未解決辺に戻る (cascade 順)
      if (sequentialResult2F) {
        const startIdx2F = scaffoldStart && sequentialResult2F.edgeResults.length > 0
          ? (scaffoldStart.startVertexIndex ?? 0) % sequentialResult2F.edgeResults.length
          : 0;
        const ordered2F = getCascadeOrderedEdges(sequentialResult2F, startIdx2F);
        const last2F = [...ordered2F].reverse().find(er => !er.isAutoProgress);
        if (last2F) {
          const newSelections2F = { ...userSelections2F };
          delete newSelections2F[last2F.edge.index];
          setUserSelections2F(newSelections2F);
          const newAdjustments2F = { ...userAdjustments2F };
          delete newAdjustments2F[last2F.edge.index];
          setUserAdjustments2F(newAdjustments2F);
          const seqRes2F = computeAutoLayoutSequential(
            building, distances, scaffoldStart, enabledSizes, priorityConfig, newSelections2F, newAdjustments2F,
          );
          setSequentialResult2F(seqRes2F);
          setActiveEdge({ floor: 2, index: last2F.edge.index });
        }
      }
      return;
    }

    // 2F の場合
    if (activeEdge.floor === 2 && sequentialResult2F) {
      // Phase I-3-fix: cascade 順で前の未解決辺を探す
      const startIdx2F = scaffoldStart && sequentialResult2F.edgeResults.length > 0
        ? (scaffoldStart.startVertexIndex ?? 0) % sequentialResult2F.edgeResults.length
        : 0;
      const ordered2F = getCascadeOrderedEdges(sequentialResult2F, startIdx2F);
      const currentIdx = ordered2F.findIndex(er => er.edge.index === activeEdge.index);
      const prev2F = ordered2F
        .slice(0, currentIdx)
        .reverse()
        .find(er => !er.isAutoProgress);
      if (!prev2F) return;
      const newSelections2F = { ...userSelections2F };
      delete newSelections2F[prev2F.edge.index];
      setUserSelections2F(newSelections2F);
      // Phase I-2: 戻り辺の adjustments もクリア
      const newAdjustments2F = { ...userAdjustments2F };
      delete newAdjustments2F[prev2F.edge.index];
      setUserAdjustments2F(newAdjustments2F);
      const seqRes2F = computeAutoLayoutSequential(
        building, distances, scaffoldStart, enabledSizes, priorityConfig, newSelections2F, newAdjustments2F,
      );
      setSequentialResult2F(seqRes2F);
      setActiveEdge({ floor: 2, index: prev2F.edge.index });
    }
  };

  // 順次決定をキャンセル（両 floor の state をクリア）
  const handleSequentialCancel = () => {
    setActiveEdge(null);
    setSequentialResult2F(null);
    setSequentialResult1F(null);
    setUserSelections2F({});
    setUserSelections1F({});
    // Phase I-2: adjustments もクリア
    setUserAdjustments2F({});
    setUserAdjustments1F({});
    setResult(null);
    setResultSub(null);
  };

  // Phase I-2: 「割り変更」「←/→」操作のハンドラ
  // - 「割り変更」(handleVariationChange): 該当 side の variationIdx を +1
  // - 「←/→」(handleOffsetChange): 該当 side の offsetIdx を ±1、variationIdx を 0 リセット
  // 更新後は computeAutoLayoutSequential 全 cascade 再計算で後続辺にも伝播
  const applyAdjustmentsUpdate = (
    floor: 1 | 2,
    edgeIndex: number,
    updater: (cur: EdgeAdjustment) => EdgeAdjustment | null,
  ) => {
    if (!building) return;
    const isF2 = floor === 2;
    const cur = (isF2 ? userAdjustments2F : userAdjustments1F)[edgeIndex] ?? DEFAULT_EDGE_ADJUSTMENT;
    const next = updater(cur);
    if (next === null) return;

    if (isF2) {
      const newAdjustments2F = { ...userAdjustments2F, [edgeIndex]: next };
      setUserAdjustments2F(newAdjustments2F);
      const seqRes2F = computeAutoLayoutSequential(
        building, distances, scaffoldStart, enabledSizes, priorityConfig, userSelections2F, newAdjustments2F,
      );
      setSequentialResult2F(seqRes2F);
      const adapted = sequentialResultToAutoLayoutResult(seqRes2F);
      setResult(adapted);
      const sel: Record<number, number> = {};
      adapted.edgeLayouts.forEach((el, i) => { sel[i] = el.selectedIndex; });
      setSelections(sel);
    } else {
      const newAdjustments1F = { ...userAdjustments1F, [edgeIndex]: next };
      setUserAdjustments1F(newAdjustments1F);
      const seqRes1F = recompute1FSubResult(userSelections1F, newAdjustments1F);
      setSequentialResult1F(seqRes1F);
      if (seqRes1F) {
        const adaptedSub = sequentialResultToAutoLayoutResult(seqRes1F);
        setResultSub(adaptedSub);
        const selSub: Record<number, number> = {};
        adaptedSub.edgeLayouts.forEach(el => { selSub[el.edge.index] = el.selectedIndex; });
        setSelectionsSub(selSub);
      }
    }
  };

  const handleVariationChange = (
    floor: 1 | 2,
    edgeIndex: number,
    side: 'larger' | 'smaller',
    direction: 'next' | 'prev' = 'next',
  ) => {
    applyAdjustmentsUpdate(floor, edgeIndex, cur => {
      const curVar = cur[side].variationIdx;
      if (direction === 'prev' && curVar === 0) return null; // ガード: 0 未満には行かない
      const newVar = direction === 'next' ? curVar + 1 : curVar - 1;
      return {
        ...cur,
        [side]: { ...cur[side], variationIdx: newVar },
      };
    });
  };

  const handleOffsetChange = (
    floor: 1 | 2,
    edgeIndex: number,
    side: 'larger' | 'smaller',
    direction: 'next' | 'prev',
  ) => {
    applyAdjustmentsUpdate(floor, edgeIndex, cur => {
      const curOffset = cur[side].offsetIdx;
      if (direction === 'prev' && curOffset === 0) return null; // ガード: 進めない
      const newOffset = direction === 'next' ? curOffset + 1 : curOffset - 1;
      return {
        ...cur,
        [side]: { offsetIdx: newOffset, variationIdx: 0 }, // variationIdx リセット
      };
    });
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
    <div className="fixed inset-0 modal-overlay flex items-end sm:items-center justify-center z-50" onClick={(showConflictConfirm || activeEdge !== null) ? undefined : onClose}>
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
                        // 順次決定 state をリセット（1F の距離変更は 1F のみ影響だが、安全のため両方）
                        setSequentialResult2F(null);
                        setSequentialResult1F(null);
                        setUserSelections2F({});
                        setUserSelections1F({});
                        setActiveEdge(null);
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

      {/* Phase H-3d-1: 順次決定モーダル（2F / 1F 両対応） */}
      {activeEdge !== null && (() => {
        // activeEdge.floor に応じて対応する SequentialLayoutResult を取り出す
        const activeSeqResult = activeEdge.floor === 2 ? sequentialResult2F : sequentialResult1F;
        if (!activeSeqResult) return null;
        const activeEdgeResult = activeSeqResult.edgeResults.find(er => er.edge.index === activeEdge.index);
        if (!activeEdgeResult) return null;

        // Phase I-3-fix: 進捗は cascade 順 (起点辺・閉じ辺も含む、autoProgress のみスキップ)
        const unresolved2F = (cascadeOrdered2F ?? []).filter(er => !er.isAutoProgress);
        const unresolved1F = (cascadeOrdered1F ?? []).filter(er => !er.isAutoProgress);
        const totalNum = unresolved2F.length + unresolved1F.length;
        const currentNum = activeEdge.floor === 2
          ? unresolved2F.findIndex(er => er.edge.index === activeEdge.index) + 1
          : unresolved2F.length + unresolved1F.findIndex(er => er.edge.index === activeEdge.index) + 1;

        // プレビュー用: 1F の場合は building1F の points / edges を使用
        const previewBuilding = activeEdge.floor === 2 ? building : building1F;
        const previewEdges = activeEdge.floor === 2 ? edges : edges1FAll;

        const floorLabel = activeEdge.floor === 2 ? '2F' : '1F 下屋辺';

        return (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-dark-surface border-t sm:border border-dark-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto z-10">
              {/* ヘッダー */}
              <div className="px-4 py-3 border-b border-dark-border">
                <p className="font-bold text-sm">足場の繋ぎ方を選んでください（{floorLabel}）</p>
                <p className="text-xs text-dimension mt-0.5">未解決 {currentNum} / {totalNum} 面</p>
              </div>

              {/* プレビュー */}
              {previewBuilding && (
                <div className="px-4 pt-3">
                  <PreviewSVG
                    points={previewBuilding.points}
                    edges={previewEdges}
                    focusedIndex={activeEdge.index}
                    blinkEdgeIndex={activeEdge.index}
                    scaffoldStart={activeEdge.floor === 2 ? scaffoldStart : undefined}
                  />
                </div>
              )}

              {/* 該当辺の情報 */}
              <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-dark-bg border border-dark-border">
                <div className="text-sm font-bold">
                  📍 {floorLabel} {activeEdgeResult.edge.label}面（{FACE_LABEL[activeEdgeResult.edge.face]} / {activeEdgeResult.edge.lengthMm}mm）
                </div>
                <div className="text-[11px] text-dimension mt-1">
                  始点離れ: <span className="font-mono text-canvas">{activeEdgeResult.startDistanceMm}mm</span>
                  <span className="ml-1">
                    {(() => {
                      // 起点辺/閉じ辺判定: 2F のみ scaffoldStart 利用、1F は scaffoldStart=undefined
                      if (activeEdge.floor !== 2 || !scaffoldStart) {
                        return '（前辺の終端から継承）';
                      }
                      const nP = previewEdges.length;
                      const sIdx = (scaffoldStart.startVertexIndex ?? 0) % nP;
                      const cIdx = (sIdx - 1 + nP) % nP;
                      if (activeEdgeResult.edge.index === sIdx) return '（足場開始で固定）';
                      if (activeEdgeResult.edge.index === cIdx) return '（足場開始で固定 - 閉じ辺）';
                      return '（前辺の終端から継承）';
                    })()}
                  </span>
                </div>
                <div className="text-[11px] text-dimension">
                  希望する次の面の離れ: <span className="font-mono text-canvas">{activeEdgeResult.desiredEndDistanceMm}mm</span>
                </div>
              </div>

              {/* Phase I-3: 候補ヘッダー + 候補カード + 操作ボタン */}
              {(() => {
                // 操作ボタンに必要な context を IIFE 内で組み立て
                const activeAdjustments = activeEdge.floor === 2 ? userAdjustments2F : userAdjustments1F;
                const activeAdj = activeAdjustments[activeEdge.index] ?? DEFAULT_EDGE_ADJUSTMENT;
                const nPreview = previewEdges.length;
                const nextEdge = previewEdges[(activeEdgeResult.edge.index + 1) % nPreview];
                // Phase I-3-fix: 閉じ辺判定 (2F のみ、scaffoldStart 必須)
                const sIdx = activeEdge.floor === 2 && scaffoldStart
                  ? (scaffoldStart.startVertexIndex ?? 0) % nPreview
                  : 0;
                const closeIdx = (sIdx - 1 + nPreview) % nPreview;
                const isCloseCorner = activeEdge.floor === 2 && !!scaffoldStart
                  && activeEdgeResult.edge.index === closeIdx;
                // 物理 prev の startDist を取得（bothmode 1F filtered の場合は近似値 fallback）
                const prevPhysIdx = (activeEdgeResult.edge.index - 1 + nPreview) % nPreview;
                const prevER = activeSeqResult.edgeResults.find(er => er.edge.index === prevPhysIdx);
                const prevStartForProbe = prevER ? prevER.startDistanceMm : (activeEdgeResult.startDistanceMm ?? 900);

                // 「→」枯れ判定: 該当 side で offsetIdx+1 の候補が存在するか probe
                const canAdvanceOffset = (side: 'larger' | 'smaller'): boolean => {
                  const probeAdj = {
                    larger: side === 'larger'
                      ? { offsetIdx: activeAdj.larger.offsetIdx + 1, variationIdx: 0 }
                      : { offsetIdx: 0, variationIdx: 0 },
                    smaller: side === 'smaller'
                      ? { offsetIdx: activeAdj.smaller.offsetIdx + 1, variationIdx: 0 }
                      : { offsetIdx: 0, variationIdx: 0 },
                  };
                  const probe = generateSequentialCandidates(
                    activeEdgeResult.edge.lengthMm,
                    activeEdgeResult.startDistanceMm,
                    activeEdgeResult.desiredEndDistanceMm,
                    activeEdgeResult.prevCornerIsConvex,
                    activeEdgeResult.nextCornerIsConvex,
                    prevStartForProbe,
                    enabledSizes,
                    priorityConfig,
                    probeAdj.larger.offsetIdx,
                    probeAdj.smaller.offsetIdx,
                    probeAdj.larger.variationIdx,
                    probeAdj.smaller.variationIdx,
                  );
                  return probe.some(c => c.side === side);
                };

                return (
                  <>
                    {/* 候補ヘッダー */}
                    <div className="px-4 pt-3 pb-1 text-xs font-bold text-canvas">
                      {activeEdgeResult.edge.label}面の割付候補
                    </div>

                    {/* 候補カードリスト */}
                    <div className="px-4 pb-4 space-y-2">
                      {activeEdgeResult.candidates.map((cand, idx) => {
                        // exact は ←/→ が無意味なので disabled。部材変更は smallerVariationIdx 流用で機能。
                        const isExact = cand.side === 'exact';
                        // ←/→ ハンドラに渡す side: exact のときは smaller (Phase I-1 仕様準拠)
                        const sideForHandler: 'larger' | 'smaller' = cand.side === 'exact' ? 'smaller' : cand.side;
                        const sideOffsetIdx = sideForHandler === 'larger'
                          ? activeAdj.larger.offsetIdx
                          : activeAdj.smaller.offsetIdx;

                        // 部材変更←: variationIdx === 0 で disabled
                        const variationPrevDisabled = cand.variationIdx === 0;
                        // 部材変更→: 次の variation がない で disabled
                        const variationNextDisabled = cand.variationIdx + 1 >= cand.variationCount;
                        // 離れ変更←: exact / 閉じ辺 / offsetIdx===0 で disabled
                        const prevDisabled = isExact || isCloseCorner || sideOffsetIdx === 0;
                        // 離れ変更→: exact / 閉じ辺 / probe で枯れ で disabled
                        const nextDisabled = isExact || isCloseCorner || !canAdvanceOffset(sideForHandler);

                        const arrowBtnClass =
                          'px-2 py-1 text-xs rounded bg-dark-border/50 text-dimension hover:bg-dark-border hover:text-canvas disabled:opacity-30 disabled:cursor-not-allowed';

                        return (
                          <div
                            key={idx}
                            className="border border-dark-border rounded-xl bg-dark-bg overflow-hidden"
                          >
                            {/* Phase I-3-fix3: タップ可能エリアを青ストロークで明示
                                通常時は accent/40 の薄い青、hover で accent (=#378ADD) 100% に。
                                左右 margin は操作ボタン群の px-3 と揃える */}
                            <button
                              onClick={() => handleSequentialSelect(activeEdge.floor, activeEdge.index, idx)}
                              className="block w-[calc(100%-1.5rem)] mx-3 mt-3 mb-2 p-3 border border-accent/40 hover:border-accent hover:bg-accent/10 rounded-lg transition-colors text-left"
                            >
                              <div className="flex flex-wrap gap-1 mb-2">
                                {cand.rails.map((r, ri) => (
                                  <span key={ri} className="px-1.5 py-0.5 bg-handrail/20 text-handrail text-[11px] font-mono rounded">
                                    {r}
                                  </span>
                                ))}
                              </div>
                              <div className="text-xs font-mono text-accent">
                                → {nextEdge.label}面の離れ: <span className="font-bold">{cand.actualEndDistanceMm}mm</span>
                              </div>
                            </button>
                            {/* Phase I-3-fix2: 操作ボタン
                                [←] 部材変更 [→] / [←] 離れ変更 [→]
                                各グループは ←/→ ボタン + 中央ラベル、部材変更のみ下にカウンタ */}
                            <div className="px-3 pb-3 flex flex-wrap gap-x-4 gap-y-2 items-start">
                              {/* 部材変更グループ */}
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleVariationChange(activeEdge.floor, activeEdge.index, sideForHandler, 'prev')}
                                    disabled={variationPrevDisabled}
                                    className={arrowBtnClass}
                                    title="前の rails パターンに戻る"
                                  >
                                    ←
                                  </button>
                                  <span className="text-xs text-dimension/70 px-1 select-none">部材変更</span>
                                  <button
                                    onClick={() => handleVariationChange(activeEdge.floor, activeEdge.index, sideForHandler, 'next')}
                                    disabled={variationNextDisabled}
                                    className={arrowBtnClass}
                                    title="次の rails パターンに切替"
                                  >
                                    →
                                  </button>
                                </div>
                                <span className="text-[10px] font-mono text-dimension/50">
                                  {cand.variationIdx + 1}/{cand.variationCount}
                                </span>
                              </div>
                              {/* 離れ変更グループ */}
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleOffsetChange(activeEdge.floor, activeEdge.index, sideForHandler, 'prev')}
                                    disabled={prevDisabled}
                                    className={arrowBtnClass}
                                    title="前の離れに戻る"
                                  >
                                    ←
                                  </button>
                                  <span className="text-xs text-dimension/70 px-1 select-none">離れ変更</span>
                                  <button
                                    onClick={() => handleOffsetChange(activeEdge.floor, activeEdge.index, sideForHandler, 'next')}
                                    disabled={nextDisabled}
                                    className={arrowBtnClass}
                                    title="次の離れに進む"
                                  >
                                    →
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              {/* フッター */}
              <div className="px-4 py-3 border-t border-dark-border flex gap-2 justify-between">
                <button
                  onClick={handleSequentialBack}
                  disabled={currentNum <= 1}
                  className="px-3 py-2 text-xs border border-dark-border text-dimension rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← 前の辺に戻る
                </button>
                <button
                  onClick={handleSequentialCancel}
                  className="px-3 py-2 text-xs border border-dark-border text-dimension rounded-xl"
                >
                  キャンセル
                </button>
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
