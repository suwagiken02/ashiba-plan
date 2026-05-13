import { PDFDocument } from 'pdf-lib';
import Konva from 'konva';
import type {
  CanvasData,
  BuildingShape,
  Handrail,
  Point,
} from '@/types';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';
import {
  computeScaffoldAreaSummary,
  computeBuildingFloorAreaSummary,
  computeAreaPreviewGeometry,
} from '@/lib/konva/areaCalcUtils';
import { buildAreaCalcText } from '@/lib/konva/areaCalcText';
import { getOutlinePolygon } from '@/lib/konva/heightMarkerUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';
import { renderTitleBlock } from './pdfExport';

/** 平米計算 PDF レイアウト定数 (= 平米計算 Phase E-4b、 A4 縦固定) */
const PAPER_W = 595.28;
const PAPER_H = 841.89;
const MARGIN = 16;
const TITLE_BLOCK_H = 60;
const HEADER_BAND_H = 170;
const HEADER_TEXT_W = 380;
const HEADER_MINI_W = 170;
const HEADER_GAP = 8;

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
 * Konva stage の建物 bbox 範囲を PNG 化 (= 寸法線含む)。
 * 建物 0 個時は stage 全体をフォールバック。
 * 印刷枠 (赤破線) を一時非表示にしてキャプチャ。
 */
async function captureDrawingPng(
  canvasData: CanvasData,
  zoom: number,
  panX: number,
  panY: number,
): Promise<{ buffer: ArrayBuffer; width: number; height: number } | null> {
  const stages = Konva.stages;
  if (stages.length === 0) return null;
  const stage = stages[0];
  const gridPx = INITIAL_GRID_PX * zoom;

  if (canvasData.buildings.length === 0) {
    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    const buffer = await fetch(dataUrl).then((r) => r.arrayBuffer());
    return { buffer, width: stage.width(), height: stage.height() };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of canvasData.buildings) {
    for (const p of b.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  // 寸法線 + 余白用に建物 bbox を 30 grid (= 300mm) 外側へ拡張
  const marginGrid = 30;
  minX -= marginGrid; minY -= marginGrid;
  maxX += marginGrid; maxY += marginGrid;

  const rectX = minX * gridPx + panX;
  const rectY = minY * gridPx + panY;
  const rectW = (maxX - minX) * gridPx;
  const rectH = (maxY - minY) * gridPx;

  // 印刷枠 (赤破線) を一時非表示にしてキャプチャ (= 既存 pdfExport.ts 同パターン)
  const layers = stage.getLayers();
  const hiddenLayers: Konva.Layer[] = [];
  for (const layer of layers) {
    const printRects = layer.find('Rect').filter((node: Konva.Node) => {
      const rect = node as Konva.Rect;
      return rect.stroke() === '#EF4444' && (rect.dash()?.length ?? 0) > 0;
    });
    if (printRects.length > 0) {
      layer.visible(false);
      hiddenLayers.push(layer);
    }
  }
  stage.batchDraw();

  const dataUrl = stage.toDataURL({
    x: rectX,
    y: rectY,
    width: rectW,
    height: rectH,
    pixelRatio: 2,
  });

  for (const layer of hiddenLayers) layer.visible(true);
  stage.batchDraw();

  const buffer = await fetch(dataUrl).then((r) => r.arrayBuffer());
  return { buffer, width: rectW, height: rectH };
}

/**
 * 平米計算結果を A4 縦 1 ページの PDF として出力 (= 平米計算 Phase E-4b)。
 * 上部帯: 計算結果テキスト + mini canvas
 * 中央: 図面 (= 建物 bbox 中心 + auto-fit)
 * 下部: 表題欄 (現場名 + 会社名 + 日付)
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
  zoom: number;
  panX: number;
  panY: number;
}): Promise<void> {
  const {
    canvasData, scaffoldSummary, buildingSummary, offsetMm,
    isFloorOnlyMode,
    siteName, companyName, date,
    zoom, panX, panY,
  } = args;

  if (Konva.stages.length === 0) {
    throw new Error('Konva stage が初期化されていません');
  }

  const areaCalcText = buildAreaCalcText({
    scaffoldSummary, buildingSummary, offsetMm, isFloorOnlyMode,
  });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAPER_W, PAPER_H]);

  // ── 1. 上部帯 (= テキスト + mini canvas) ──
  const headerY = PAPER_H - MARGIN - HEADER_BAND_H;
  const textPngBytes = renderAreaCalcTextPng(areaCalcText, HEADER_TEXT_W, HEADER_BAND_H);
  const textPng = await pdfDoc.embedPng(textPngBytes);
  page.drawImage(textPng, {
    x: MARGIN,
    y: headerY,
    width: HEADER_TEXT_W,
    height: HEADER_BAND_H,
  });

  if (!isFloorOnlyMode && scaffoldSummary) {
    const miniPngBytes = renderMiniCanvasPng(
      canvasData.buildings,
      canvasData.handrails,
      scaffoldSummary.faceLabels,
      HEADER_MINI_W,
      HEADER_BAND_H,
    );
    const miniPng = await pdfDoc.embedPng(miniPngBytes);
    page.drawImage(miniPng, {
      x: MARGIN + HEADER_TEXT_W + HEADER_GAP,
      y: headerY,
      width: HEADER_MINI_W,
      height: HEADER_BAND_H,
    });
  }

  // ── 2. 中央 (= 図面 + 寸法、 auto-fit) ──
  const drawingTop = headerY - 4;
  const drawingBottom = MARGIN + TITLE_BLOCK_H + 8;
  const drawingW = PAPER_W - 2 * MARGIN;
  const drawingH = drawingTop - drawingBottom;

  const capture = await captureDrawingPng(canvasData, zoom, panX, panY);
  if (capture) {
    const png = await pdfDoc.embedPng(capture.buffer);
    const imgAspect = capture.width / capture.height;
    const areaAspect = drawingW / drawingH;
    let imgW: number, imgH: number;
    if (imgAspect > areaAspect) {
      imgW = drawingW;
      imgH = drawingW / imgAspect;
    } else {
      imgH = drawingH;
      imgW = drawingH * imgAspect;
    }
    page.drawImage(png, {
      x: MARGIN + (drawingW - imgW) / 2,
      y: drawingBottom + (drawingH - imgH) / 2,
      width: imgW,
      height: imgH,
    });
  }

  // ── 3. 下部表題欄 ──
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
