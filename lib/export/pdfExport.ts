import { PDFDocument, rgb } from 'pdf-lib';
import Konva from 'konva';
import { CanvasData, ExportSettings } from '@/types';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';

/** 用紙サイズ (pt, 72pt=1inch) */
const PAPER_DIMENSIONS: Record<string, { width: number; height: number }> = {
  A4_portrait: { width: 595.28, height: 841.89 },
  A4_landscape: { width: 841.89, height: 595.28 },
  A3_portrait: { width: 841.89, height: 1190.55 },
  A3_landscape: { width: 1190.55, height: 841.89 },
};

/** 用紙の実寸 (mm) */
const PAPER_MM: Record<string, { width: number; height: number }> = {
  A4_portrait: { width: 210, height: 297 },
  A4_landscape: { width: 297, height: 210 },
  A3_portrait: { width: 297, height: 420 },
  A3_landscape: { width: 420, height: 297 },
};

const SCALE_FACTORS: Record<string, number> = {
  '1/50': 50,
  '1/100': 100,
  '1/200': 200,
  '1/300': 300,
};

/** 印刷範囲をグリッド単位で返す */
export function getPrintAreaGrid(
  paperSize: string,
  scale: string,
): { widthGrid: number; heightGrid: number } | null {
  const paper = PAPER_MM[paperSize];
  const factor = SCALE_FACTORS[scale];
  if (!paper || !factor) return null;
  // 用紙サイズをグリッド単位で返す
  // 用紙mmをそのままグリッド数に変換: 1グリッド = 1mm on paper at this scale
  // A4縦(210×297mm)・1/100 → 210×297グリッド
  // A4横(297×210mm)・1/100 → 297×210グリッド
  return {
    widthGrid: paper.width,
    heightGrid: paper.height,
  };
}

/**
 * 表題欄をCanvas で画像化して PNG ArrayBuffer を返す。
 * 日本語フォントを使うため、ブラウザの Canvas2D で描画する。
 */
function renderTitleBlock(
  siteName: string,
  companyName: string,
  date: string,
  scaleLabel: string,
  width: number,
  height: number,
): ArrayBuffer {
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // 背景
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  // 枠線
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  // 区切り線
  ctx.beginPath();
  ctx.moveTo(0, height * 0.5);
  ctx.lineTo(width, height * 0.5);
  ctx.stroke();

  // テキスト
  ctx.fillStyle = '#000';
  ctx.font = 'bold 14px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
  ctx.fillText(siteName || '', 8, 22);

  ctx.fillStyle = '#555';
  ctx.font = '11px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
  ctx.fillText(companyName || '', 8, 40);

  ctx.fillStyle = '#888';
  ctx.font = '10px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
  ctx.fillText(date || '', 8, height - 8);

  if (scaleLabel) {
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(scaleLabel, width - 8, height - 8);
  }

  // PNG dataURL → ArrayBuffer
  const dataUrl = canvas.toDataURL('image/png');
  const binaryString = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export const exportToPdf = async (
  canvasData: CanvasData,
  settings: ExportSettings
): Promise<void> => {
  const pdfDoc = await PDFDocument.create();
  const paperDim = PAPER_DIMENSIONS[settings.paperSize] || PAPER_DIMENSIONS.A4_landscape;
  const page = pdfDoc.addPage([paperDim.width, paperDim.height]);

  const marginPt = 30;
  const titleBlockPt = 80;
  const drawableWidthPt = paperDim.width - marginPt * 2;
  const drawableHeightPt = paperDim.height - marginPt * 2 - titleBlockPt;
  const drawableX = marginPt;
  const drawableY = marginPt + titleBlockPt;

  // ── グリッド線を描画エリア全体に描画 ──
  // 縮尺からグリッド間隔(pt)を計算
  const paperMm = PAPER_MM[settings.paperSize] || PAPER_MM.A4_landscape;
  const ptPerMm = paperDim.width / paperMm.width;
  const scaleFactor = SCALE_FACTORS[settings.scale] || 100;
  // 1グリッド = 10mm実寸 = (10/scaleFactor)mm on paper = ... pt
  const gridPt = (10 / scaleFactor) * ptPerMm;
  const minorStep = 5;  // 50グリッド=500mm → 5グリッド単位
  const majorStep = 10; // 100グリッド=1000mm → 10グリッド単位
  const minorPt = gridPt * minorStep;
  const majorPt = gridPt * majorStep;

  if (minorPt > 2) { // 線間隔が2pt以上なら描画
    // 紙全体（余白含む）にグリッド線を描画
    const gridAreaX = 0;
    const gridAreaY = 0;
    const gridAreaW = paperDim.width;
    const gridAreaH = paperDim.height;

    // 縦線
    for (let x = minorPt; x < gridAreaW; x += minorPt) {
      const nearMajor = Math.abs(x % majorPt) < 0.5;
      page.drawLine({
        start: { x: gridAreaX + x, y: gridAreaY },
        end: { x: gridAreaX + x, y: gridAreaY + gridAreaH },
        thickness: nearMajor ? 0.4 : 0.15,
        color: rgb(0.8, 0.8, 0.8),
        opacity: nearMajor ? 0.4 : 0.2,
      });
    }
    // 横線
    for (let y = minorPt; y < gridAreaH; y += minorPt) {
      const nearMajor = Math.abs(y % majorPt) < 0.5;
      page.drawLine({
        start: { x: gridAreaX, y: gridAreaY + y },
        end: { x: gridAreaX + gridAreaW, y: gridAreaY + y },
        thickness: nearMajor ? 0.4 : 0.15,
        color: rgb(0.8, 0.8, 0.8),
        opacity: nearMajor ? 0.4 : 0.2,
      });
    }
  }

  // ── Konvaステージの画像を取得 ──
  const stages = Konva.stages;
  if (stages.length > 0) {
    const stage = stages[0];

    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    const imageBytes = await fetch(dataUrl).then((res) => res.arrayBuffer());
    const pngImage = await pdfDoc.embedPng(imageBytes);

    // 画像をフィット
    const imgAspect = pngImage.width / pngImage.height;
    const areaAspect = drawableWidthPt / drawableHeightPt;
    let imgWidth: number, imgHeight: number;
    if (imgAspect > areaAspect) {
      imgWidth = drawableWidthPt;
      imgHeight = drawableWidthPt / imgAspect;
    } else {
      imgHeight = drawableHeightPt;
      imgWidth = drawableHeightPt * imgAspect;
    }

    page.drawImage(pngImage, {
      x: drawableX + (drawableWidthPt - imgWidth) / 2,
      y: drawableY + (drawableHeightPt - imgHeight) / 2,
      width: imgWidth,
      height: imgHeight,
    });
  }

  // 表題欄（右下）— Canvas で画像化して埋め込み（日本語対応）
  const tbWidthPx = 250;
  const tbHeightPx = 60;
  const scaleLabel = settings.scale !== 'auto' ? `S=${settings.scale}` : '';
  const tbImageBytes = renderTitleBlock(
    settings.siteName || '',
    settings.companyName || '',
    settings.date || '',
    scaleLabel,
    tbWidthPx,
    tbHeightPx,
  );
  const tbImage = await pdfDoc.embedPng(tbImageBytes);

  const tbPdfWidth = 200;
  const tbPdfHeight = tbPdfWidth * (tbHeightPx / tbWidthPx);
  // 印刷可能範囲の右下端にぴったり配置
  page.drawImage(tbImage, {
    x: drawableX + drawableWidthPt - tbPdfWidth,
    y: marginPt,
    width: tbPdfWidth,
    height: tbPdfHeight,
  });

  // ダウンロード
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${settings.siteName || '図面'}_平面図.pdf`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
