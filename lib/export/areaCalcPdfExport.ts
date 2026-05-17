import { PDFDocument } from 'pdf-lib';
import type {
  CanvasData,
  BuildingShape,
  Handrail,
  Point,
} from '@/types';
import {
  computeScaffoldAreaSummary,
  computeBuildingFloorAreaSummary,
  computeAreaPreviewGeometry,
} from '@/lib/konva/areaCalcUtils';
import { buildAreaCalcText } from '@/lib/konva/areaCalcText';
import { getOutlinePolygon } from '@/lib/konva/heightMarkerUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import { renderTitleBlock } from './pdfExport';

/** 平米計算 PDF レイアウト定数 (= 平米計算 Phase E-4b、 A4 縦固定、 #8 で平面図削除しシンプル化) */
const PAPER_W = 595.28;
const PAPER_H = 841.89;
const MARGIN = 16;
const TITLE_BLOCK_H = 60;
const TEXT_BLOCK_H = 280;
const TEXT_MINI_GAP = 8;
const MINI_TITLE_GAP = 8;

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * 計算結果テキストを白背景 canvas で描画 → PNG ArrayBuffer 化。
 * pdf-lib の drawText は CJK が困難なため、 renderTitleBlock と同方式。
 */
function renderAreaCalcTextPng(text: string, width: number, height: number): ArrayBuffer {
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#CCC';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  ctx.fillStyle = '#000';
  ctx.font = '11px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
  ctx.textBaseline = 'top';
  const lines = text.split('\n');
  const lineHeight = 13;
  const padX = 12;
  const padY = 10;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padX, padY + i * lineHeight);
  }

  return dataUrlToArrayBuffer(canvas.toDataURL('image/png'));
}

/**
 * 面プレビュー mini canvas (= AreaCalculationModal PreviewSVG と同等) を
 * 白背景 canvas に描画 → PNG ArrayBuffer 化。
 * floor-only mode 時は呼び出し側で skip。
 */
function renderMiniCanvasPng(
  buildings: BuildingShape[],
  handrails: Handrail[],
  faceLabels: Map<string, string>,
  width: number,
  height: number,
): ArrayBuffer {
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#CCC';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const pad = 16;
  const allOutlinePoints: Point[] = buildings.flatMap((b) => getOutlinePolygon(b));
  if (allOutlinePoints.length === 0) {
    return dataUrlToArrayBuffer(canvas.toDataURL('image/png'));
  }

  const geo = computeAreaPreviewGeometry(allOutlinePoints, width, height, pad);
  const { toSvg } = geo;

  // 建物 outline
  ctx.fillStyle = '#E5E5E5';
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  for (const b of buildings) {
    const outline = getOutlinePolygon(b);
    if (outline.length < 3) continue;
    ctx.beginPath();
    outline.forEach((p, i) => {
      const sp = toSvg(p);
      if (i === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // handrail
  ctx.strokeStyle = '#1976D2';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (const h of handrails) {
    const [p1, p2] = getHandrailEndpoints(h);
    const s1 = toSvg(p1);
    const s2 = toSvg(p2);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }

  // faceLabel (= A, B, C... の青字、 白縁取り)
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [faceKey, label] of Array.from(faceLabels.entries())) {
    const lastDash = faceKey.lastIndexOf('-');
    const buildingId = faceKey.slice(0, lastDash);
    const edgeIndex = parseInt(faceKey.slice(lastDash + 1), 10);
    const b = buildings.find((bb) => bb.id === buildingId);
    if (!b) continue;
    const outline = getOutlinePolygon(b);
    if (edgeIndex < 0 || edgeIndex >= outline.length) continue;
    const s1 = toSvg(outline[edgeIndex]);
    const s2 = toSvg(outline[(edgeIndex + 1) % outline.length]);
    const mx = (s1.x + s2.x) / 2;
    const my = (s1.y + s2.y) / 2;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeText(label, mx, my);
    ctx.fillStyle = '#1976D2';
    ctx.fillText(label, mx, my);
  }

  return dataUrlToArrayBuffer(canvas.toDataURL('image/png'));
}

/**
 * 平米計算結果を A4 縦 1 ページの PDF として出力 (= 平米計算 Phase E-4b、 #8 でシンプル化)。
 * 上: 計算結果テキスト (= full-width 280pt)
 * 中: 面プレビュー mini canvas (= full-width ~454pt、 面ラベル A,B,C... 確認用)
 * 下: 表題欄 (= 現場名 + 会社名 + 日付、 右下 200×60pt)
 * 平面図 (= 建物 capture) は #8 で削除。 必要なら「貼り付け」 → 既存「出力」 ボタンで対応。
 */
export async function exportAreaCalcPdf(args: {
  canvasData: CanvasData;
  scaffoldSummary: ReturnType<typeof computeScaffoldAreaSummary> | null;
  buildingSummary: ReturnType<typeof computeBuildingFloorAreaSummary>;
  offsetMm: number;
  isFloorOnlyMode: boolean;
  siteName: string;
  companyName: string;
  date: string;
}): Promise<void> {
  const {
    canvasData, scaffoldSummary, buildingSummary, offsetMm,
    isFloorOnlyMode,
    siteName, companyName, date,
  } = args;

  const areaCalcText = buildAreaCalcText({
    scaffoldSummary, buildingSummary, offsetMm, isFloorOnlyMode,
  });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAPER_W, PAPER_H]);

  // ── 1. 上: 計算結果テキスト (= full-width) ──
  const textW = PAPER_W - 2 * MARGIN;
  const textH = TEXT_BLOCK_H;
  const textY = PAPER_H - MARGIN - textH;
  const textPngBytes = renderAreaCalcTextPng(areaCalcText, textW, textH);
  const textPng = await pdfDoc.embedPng(textPngBytes);
  page.drawImage(textPng, {
    x: MARGIN,
    y: textY,
    width: textW,
    height: textH,
  });

  // ── 2. 中: 面プレビュー mini canvas (= full-width、 floor-only mode 時は skip) ──
  if (!isFloorOnlyMode && scaffoldSummary) {
    const miniW = PAPER_W - 2 * MARGIN;
    const miniBottomY = MARGIN + TITLE_BLOCK_H + MINI_TITLE_GAP;
    const miniTopY = textY - TEXT_MINI_GAP;
    const miniH = miniTopY - miniBottomY;
    const miniPngBytes = renderMiniCanvasPng(
      canvasData.buildings,
      canvasData.handrails,
      scaffoldSummary.faceLabels,
      miniW,
      miniH,
    );
    const miniPng = await pdfDoc.embedPng(miniPngBytes);
    page.drawImage(miniPng, {
      x: MARGIN,
      y: miniBottomY,
      width: miniW,
      height: miniH,
    });
  }

  // ── 3. 下: 表題欄 (= 右下、 既存維持) ──
  const tbWidthPx = 250;
  const tbHeightPx = 60;
  const tbImageBytes = renderTitleBlock(
    siteName || '',
    companyName || '',
    date || '',
    '',
    tbWidthPx, tbHeightPx,
  );
  const tbImage = await pdfDoc.embedPng(tbImageBytes);
  const tbPdfW = 200;
  const tbPdfH = tbPdfW * (tbHeightPx / tbWidthPx);
  page.drawImage(tbImage, {
    x: PAPER_W - MARGIN - tbPdfW,
    y: MARGIN,
    width: tbPdfW,
    height: tbPdfH,
  });

  // ── 4. ダウンロード ──
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${siteName || '図面'}_平米計算.pdf`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
