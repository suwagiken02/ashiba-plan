import type {
  computeScaffoldAreaSummary,
  computeBuildingFloorAreaSummary,
} from './areaCalcUtils';

/**
 * α オフセット値を表示ラベルに変換 (= 平米計算 Phase E-4a)。
 * AreaCalculationModal.tsx の ALPHA_OPTIONS と同一マッピング。
 */
export function formatAlphaLabel(offsetMm: number): string {
  if (offsetMm === 0) return '建物 = 足場';
  const sign = offsetMm > 0 ? '+' : '';
  return `建物 ${sign}${offsetMm}mm`;
}

/**
 * 平米計算結果テキスト構築 (= 平米計算 Phase E-4a)。
 * AreaCalculationModal の JSX セクション順序と完全同等。
 * memo 貼り付け / PDF 出力で共用する純粋関数、 \n 区切り。
 *
 * セクション出現条件:
 *  - α: !isFloorOnlyMode のみ
 *  - 足場面別: !isFloorOnlyMode && visibleFaces.length > 0 のみ
 *  - 足場合計: !isFloorOnlyMode && scaffoldSummary のみ
 *  - 建物床㎡: 常に
 *  - uncalculable: scaffoldSummary.uncalculable.length > 0 のみ、 reason 別行
 */
export function buildAreaCalcText(args: {
  scaffoldSummary: ReturnType<typeof computeScaffoldAreaSummary> | null;
  buildingSummary: ReturnType<typeof computeBuildingFloorAreaSummary>;
  offsetMm: number;
  isFloorOnlyMode: boolean;
}): string {
  const { scaffoldSummary, buildingSummary, offsetMm, isFloorOnlyMode } = args;
  const lines: string[] = [];

  lines.push('平米計算結果');
  lines.push('─────────');

  if (!isFloorOnlyMode) {
    lines.push(`[α: ${formatAlphaLabel(offsetMm)}]`);
  }

  // 足場面別 (= AreaCalculationModal.tsx:138-147 と同等の visibleFaces ソート)
  if (!isFloorOnlyMode && scaffoldSummary) {
    const visibleFaces = Array.from(scaffoldSummary.faceAreas.entries())
      .filter(([, area]) => area > 0)
      .sort(([a], [b]) => {
        const la = scaffoldSummary.faceLabels.get(a) ?? '';
        const lb = scaffoldSummary.faceLabels.get(b) ?? '';
        return la.localeCompare(lb);
      });
    if (visibleFaces.length > 0) {
      lines.push('▼ 足場面別');
      for (const [faceKey, area] of visibleFaces) {
        lines.push(` 面 ${scaffoldSummary.faceLabels.get(faceKey)}: ${area.toFixed(1)} m²`);
      }
    }
  }

  // 足場合計
  if (!isFloorOnlyMode && scaffoldSummary) {
    lines.push('▼ 足場合計');
    lines.push(` 1F: ${scaffoldSummary.byFloor.floor1.toFixed(1)} m²`);
    lines.push(` 2F: ${scaffoldSummary.byFloor.floor2.toFixed(1)} m²`);
    lines.push(` 合計: ${scaffoldSummary.total.toFixed(1)} m²`);
  }

  // 建物床㎡ (= 常時表示)
  lines.push('▼ 建物床㎡');
  lines.push(` 1F: ${buildingSummary.floor1.toFixed(1)} m²`);
  lines.push(` 2F: ${buildingSummary.floor2.toFixed(1)} m²`);
  lines.push(` 合計: ${buildingSummary.total.toFixed(1)} m²`);

  // uncalculable warning (= AreaCalculationModal.tsx:127-135 の uncalcByReason 集計と同等)
  if (scaffoldSummary && scaffoldSummary.uncalculable.length > 0) {
    let pf = 0;
    let hu = 0;
    for (const u of scaffoldSummary.uncalculable) {
      if (u.reason === 'projection-failed') pf++;
      else hu++;
    }
    lines.push(`⚠ 計算不能 ${pf + hu} 本`);
    if (pf > 0) lines.push(` ・射影不能: ${pf} 本`);
    if (hu > 0) lines.push(` ・高さ未設定: ${hu} 本`);
  }

  return lines.join('\n');
}
