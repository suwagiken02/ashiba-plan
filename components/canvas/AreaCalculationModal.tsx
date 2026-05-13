'use client';

import React, { useMemo } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import {
  computeScaffoldAreaSummary,
  computeBuildingFloorAreaSummary,
  computeAreaPreviewGeometry,
} from '@/lib/konva/areaCalcUtils';
import { buildAreaCalcText } from '@/lib/konva/areaCalcText';
import { getOutlinePolygon } from '@/lib/konva/heightMarkerUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import type { BuildingShape, Handrail, Point } from '@/types';

const ALPHA_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '建物 = 足場' },
  { value: -900, label: '建物 -900mm' },
  { value: 450, label: '建物 +450mm' },
  { value: 900, label: '建物 +900mm' },
];

/**
 * 面プレビュー mini canvas (= 平米計算 Phase E-3)。
 * 建物 outline + handrail 線 + 面ラベル A/B/C を SVG で描画。
 * インタラクション完全なし、 静的な凡例図。
 */
function PreviewSVG({
  buildings, handrails, faceLabels,
}: {
  buildings: BuildingShape[];
  handrails: Handrail[];
  faceLabels: Map<string, string>;
}) {
  const svgW = 280, svgH = 180, pad = 24;
  const allOutlinePoints: Point[] = buildings.flatMap((b) => getOutlinePolygon(b));
  if (allOutlinePoints.length === 0) return null;

  const geo = computeAreaPreviewGeometry(allOutlinePoints, svgW, svgH, pad);
  const { toSvg } = geo;

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
         className="mx-auto block mb-2 bg-dark-bg rounded-lg border border-dark-border">
      {/* 建物 outline */}
      {buildings.map((b) => {
        const outline = getOutlinePolygon(b);
        if (outline.length < 3) return null;
        const svgPts = outline.map(toSvg);
        const pathD = svgPts.map((p, i) =>
          `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
        ).join(' ') + ' Z';
        return (
          <path key={b.id} d={pathD}
                fill="#3d3d3a" stroke="#1a1a18" strokeWidth={2} />
        );
      })}

      {/* handrail 線 */}
      {handrails.map((h) => {
        const [p1, p2] = getHandrailEndpoints(h);
        const s1 = toSvg(p1);
        const s2 = toSvg(p2);
        return (
          <line key={h.id}
                x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
                stroke="#378ADD" strokeWidth={2} strokeLinecap="round" />
        );
      })}

      {/* 面ラベル A/B/C (= 辺中央配置、 凹角自動回避は省略) */}
      {Array.from(faceLabels.entries()).map(([faceKey, label]) => {
        const lastDash = faceKey.lastIndexOf('-');
        const buildingId = faceKey.slice(0, lastDash);
        const edgeIndex = parseInt(faceKey.slice(lastDash + 1), 10);
        const b = buildings.find((bb) => bb.id === buildingId);
        if (!b) return null;
        const outline = getOutlinePolygon(b);
        if (edgeIndex < 0 || edgeIndex >= outline.length) return null;
        const s1 = toSvg(outline[edgeIndex]);
        const s2 = toSvg(outline[(edgeIndex + 1) % outline.length]);
        const mx = (s1.x + s2.x) / 2;
        const my = (s1.y + s2.y) / 2;
        return (
          <text key={faceKey}
                x={mx} y={my}
                textAnchor="middle" dominantBaseline="central"
                fill="#378ADD" fontWeight="bold"
                fontSize={12} fontFamily="monospace"
                paintOrder="stroke" stroke="#3d3d3a" strokeWidth={3}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}

export default function AreaCalculationModal({ siteName }: { siteName: string }) {
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

  /** 平米計算 Phase E-4a: 計算結果を memo として配置するモードへ遷移 */
  const handlePaste = () => {
    const text = buildAreaCalcText({
      scaffoldSummary,
      buildingSummary,
      offsetMm: areaCalcOffsetMm,
      isFloorOnlyMode,
    });
    const store = useCanvasStore.getState();
    store.setMemoDraft({ shape: 'rect', text, angle: 0, scaleX: 1, scaleY: 1 });
    store.setMemoDraftSource('area-calc');
    store.setMode('memo');
    setShowAreaCalcModal(false);
  };

  /** 平米計算 Phase E-4b: 計算結果 + 図面 を A4 縦 1 ページ PDF に出力 */
  const handleExport = async () => {
    try {
      const { exportAreaCalcPdf } = await import('@/lib/export/areaCalcPdfExport');
      const { useAuthStore } = await import('@/stores/authStore');
      const store = useCanvasStore.getState();
      await exportAreaCalcPdf({
        canvasData,
        scaffoldSummary,
        buildingSummary,
        offsetMm: areaCalcOffsetMm,
        isFloorOnlyMode,
        siteName,
        companyName: useAuthStore.getState().profile?.company_name ?? '',
        date: new Date().toLocaleDateString('ja-JP'),
        zoom: store.zoom,
        panX: store.panX,
        panY: store.panY,
      });
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const deviceMsg = /iPhone|iPad|iPod/.test(ua)
        ? '『ファイル』 アプリの「ダウンロード」 で確認できます。'
        : /Android/i.test(ua)
        ? 'ダウンロードフォルダ または Files アプリで確認できます。'
        : 'ダウンロードフォルダに保存されました。';
      store.setAlertMessage(`平米計算 PDF を保存しました\n\n${deviceMsg}`);
      setShowAreaCalcModal(false);
    } catch (e) {
      alert(`出力エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

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
            <PreviewSVG
              buildings={canvasData.buildings}
              handrails={canvasData.handrails}
              faceLabels={scaffoldSummary.faceLabels}
            />
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
            onClick={handlePaste}
            className="w-full py-2 bg-accent text-white rounded-xl text-sm font-bold"
          >
            計算結果を貼り付け
          </button>
          <button
            onClick={handleExport}
            className="w-full py-2 bg-accent text-white rounded-xl text-sm font-bold"
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
