'use client';

import React, { useMemo } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import {
  computeScaffoldAreaSummary,
  computeBuildingFloorAreaSummary,
} from '@/lib/konva/areaCalcUtils';

const ALPHA_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '建物 = 足場' },
  { value: -900, label: '建物 -900mm' },
  { value: 450, label: '建物 +450mm' },
  { value: 900, label: '建物 +900mm' },
];

export default function AreaCalculationModal() {
  const {
    showAreaCalcModal, setShowAreaCalcModal,
    canvasData, floorDesignation,
    areaCalcOffsetMm, setAreaCalcOffsetMm,
    areaCalcIncludeInPdf, setAreaCalcIncludeInPdf,
  } = useCanvasStore();

  // 足場 0 個 → 床㎡のみモード自動判定 (= 平米計算 Phase E-2 ★4)
  const isFloorOnlyMode = canvasData.handrails.length === 0;

  // 動的再計算: α / floorDesignation 変更で即時更新
  const scaffoldSummary = useMemo(() => {
    if (isFloorOnlyMode) return null;
    const fdEntries = Object.entries(floorDesignation);
    const fdMap = fdEntries.length > 0
      ? new Map(fdEntries) as Map<string, 1 | 2>
      : undefined;
    return computeScaffoldAreaSummary(
      canvasData.handrails, canvasData.buildings,
      canvasData.heightMarkers ?? [], areaCalcOffsetMm, fdMap,
    );
  }, [isFloorOnlyMode, canvasData.handrails, canvasData.buildings,
      canvasData.heightMarkers, areaCalcOffsetMm, floorDesignation]);

  const buildingSummary = useMemo(() =>
    computeBuildingFloorAreaSummary(canvasData.buildings),
    [canvasData.buildings]);

  // uncalculable を reason 別 groupBy (= 平米計算 Phase E-2 ★5)
  const uncalcByReason = useMemo(() => {
    if (!scaffoldSummary) return { projectionFailed: 0, heightUndefined: 0, total: 0 };
    let pf = 0, hu = 0;
    for (const u of scaffoldSummary.uncalculable) {
      if (u.reason === 'projection-failed') pf++;
      else hu++;
    }
    return { projectionFailed: pf, heightUndefined: hu, total: pf + hu };
  }, [scaffoldSummary]);

  // 0 値の面は非表示 (= 平米計算 Phase E-2 ★3)、 faceLabels の A,B,C... 順でソート
  const visibleFaces = useMemo(() => {
    if (!scaffoldSummary) return [];
    return Array.from(scaffoldSummary.faceAreas.entries())
      .filter(([, area]) => area > 0)
      .sort(([a], [b]) => {
        const la = scaffoldSummary.faceLabels.get(a) ?? '';
        const lb = scaffoldSummary.faceLabels.get(b) ?? '';
        return la.localeCompare(lb);
      });
  }, [scaffoldSummary]);

  if (!showAreaCalcModal) return null;

  const handleClose = () => setShowAreaCalcModal(false);

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-center justify-center">
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-sm mx-4 w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-base text-canvas font-bold mb-4">平米計算結果</h2>

        {!isFloorOnlyMode && (
          <div className="mb-4">
            <p className="text-xs text-dimension mb-2">足場の高さ:</p>
            <div className="flex flex-col gap-1">
              {ALPHA_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-xs text-canvas cursor-pointer">
                  <input
                    type="radio"
                    name="area-calc-alpha"
                    checked={areaCalcOffsetMm === opt.value}
                    onChange={() => setAreaCalcOffsetMm(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {!isFloorOnlyMode && visibleFaces.length > 0 && scaffoldSummary && (
          <section className="mb-3">
            <h3 className="text-xs font-bold text-canvas mb-1">▼ 足場面別</h3>
            <ul className="text-xs text-dimension space-y-0.5">
              {visibleFaces.map(([faceKey, area]) => (
                <li key={faceKey}>
                  面 {scaffoldSummary.faceLabels.get(faceKey)}: {area.toFixed(1)} m²
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isFloorOnlyMode && scaffoldSummary && (
          <section className="mb-3">
            <h3 className="text-xs font-bold text-canvas mb-1">▼ 足場合計</h3>
            <ul className="text-xs text-dimension space-y-0.5">
              <li>1F 足場: {scaffoldSummary.byFloor.floor1.toFixed(1)} m²</li>
              <li>2F 足場: {scaffoldSummary.byFloor.floor2.toFixed(1)} m²</li>
              <li>合計: {scaffoldSummary.total.toFixed(1)} m²</li>
            </ul>
          </section>
        )}

        <section className="mb-3">
          <h3 className="text-xs font-bold text-canvas mb-1">▼ 建物床㎡</h3>
          <ul className="text-xs text-dimension space-y-0.5">
            <li>1F: {buildingSummary.floor1.toFixed(1)} m²</li>
            <li>2F: {buildingSummary.floor2.toFixed(1)} m²</li>
            <li>合計: {buildingSummary.total.toFixed(1)} m²</li>
          </ul>
        </section>

        {!isFloorOnlyMode && uncalcByReason.total > 0 && (
          <section className="mb-3 px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded">
            <p className="text-xs text-amber-300">⚠ 計算不能 {uncalcByReason.total} 本</p>
            {uncalcByReason.projectionFailed > 0 && (
              <p className="text-[10px] text-dimension ml-3">・射影不能: {uncalcByReason.projectionFailed} 本</p>
            )}
            {uncalcByReason.heightUndefined > 0 && (
              <p className="text-[10px] text-dimension ml-3">・高さ未設定: {uncalcByReason.heightUndefined} 本</p>
            )}
          </section>
        )}

        <label className="flex items-center gap-2 mb-4 text-xs text-canvas cursor-pointer">
          <input
            type="checkbox"
            checked={areaCalcIncludeInPdf}
            onChange={(e) => setAreaCalcIncludeInPdf(e.target.checked)}
          />
          PDF に出力する
        </label>

        <div className="flex flex-col gap-2">
          <button
            disabled
            className="w-full py-2 bg-accent text-white rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            計算結果を貼り付け
          </button>
          <button
            disabled
            className="w-full py-2 bg-accent text-white rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            計算結果を出力
          </button>
          <button
            onClick={handleClose}
            className="w-full py-2 bg-dark-bg border border-dark-border text-dimension rounded-xl text-sm font-bold hover:text-canvas transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
