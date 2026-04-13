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

type Props = { onClose: () => void };

/** 建物プレビューSVG（辺ラベル付き） */
function PreviewSVG({ points, edges, focusedIndex }: {
  points: Point[];
  edges: EdgeInfo[];
  focusedIndex: number | null;
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

  // 重心（ラベルを外側に出すための基準）
  const centroidX = svgPts.reduce((s, p) => s + p.x, 0) / svgPts.length;
  const centroidY = svgPts.reduce((s, p) => s + p.y, 0) / svgPts.length;

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto block">
      <path d={pathD} fill="#3d3d3a" stroke="#1a1a18" strokeWidth={2} />
      {edges.map(edge => {
        const s1 = toSvg(edge.p1);
        const s2 = toSvg(edge.p2);
        const mx = (s1.x + s2.x) / 2;
        const my = (s1.y + s2.y) / 2;
        const isFocused = focusedIndex === edge.index;

        // ラベルを辺の外側（法線方向）に配置
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

export default function AutoLayoutModal({ onClose }: Props) {
  const { canvasData, addHandrails } = useCanvasStore();
  const building = canvasData.buildings[0];
  const scaffoldStart = canvasData.scaffoldStart;

  // 辺リストを取得
  const edges = useMemo(
    () => building ? getBuildingEdgesClockwise(building) : [],
    [building]
  );

  // 各辺の離れ（mm）: edgeIndex → number
  const defaultDist = scaffoldStart?.face1DistanceMm ?? 900;
  const [distances, setDistances] = useState<Record<number, number>>(() => {
    const d: Record<number, number> = {};
    edges.forEach(e => { d[e.index] = defaultDist; });
    return d;
  });

  const [result, setResult] = useState<AutoLayoutResult | null>(null);
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [focusedEdgeIndex, setFocusedEdgeIndex] = useState<number | null>(null);

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

    if (allHandrails.length > 0) addHandrails(allHandrails);
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
          {/* プレビューSVG */}
          <PreviewSVG points={building.points} edges={edges} focusedIndex={focusedEdgeIndex} />

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
    </div>
  );
}
