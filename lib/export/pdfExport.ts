import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import Konva from 'konva';
import { CanvasData, ExportSettings } from '@/types';

const PAPER_DIMENSIONS: Record<string, { width: number; height: number }> = {
  A4_portrait: { width: 595.28, height: 841.89 },
  A4_landscape: { width: 841.89, height: 595.28 },
  A3_portrait: { width: 841.89, height: 1190.55 },
  A3_landscape: { width: 1190.55, height: 841.89 },
};

const SCALE_FACTORS: Record<string, number> = {
  '1/50': 50,
  '1/100': 100,
  '1/200': 200,
};

export const exportToPdf = async (
  canvasData: CanvasData,
  settings: ExportSettings
): Promise<void> => {
  const pdfDoc = await PDFDocument.create();
  const paperDim = PAPER_DIMENSIONS[settings.paperSize] || PAPER_DIMENSIONS.A4_landscape;
  const page = pdfDoc.addPage([paperDim.width, paperDim.height]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Konvaステージの画像を取得
  const stages = Konva.stages;
  if (stages.length > 0) {
    const stage = stages[0];
    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    const imageBytes = await fetch(dataUrl).then((res) => res.arrayBuffer());
    const pngImage = await pdfDoc.embedPng(imageBytes);

    // 図面エリア（表題欄を除く）
    const margin = 30;
    const titleBlockHeight = 80;
    const drawableWidth = paperDim.width - margin * 2;
    const drawableHeight = paperDim.height - margin * 2 - titleBlockHeight;

    // 縮尺に合わせてフィット
    const imgAspect = pngImage.width / pngImage.height;
    const areaAspect = drawableWidth / drawableHeight;
    let imgWidth: number, imgHeight: number;
    if (imgAspect > areaAspect) {
      imgWidth = drawableWidth;
      imgHeight = drawableWidth / imgAspect;
    } else {
      imgHeight = drawableHeight;
      imgWidth = drawableHeight * imgAspect;
    }

    page.drawImage(pngImage, {
      x: margin + (drawableWidth - imgWidth) / 2,
      y: margin + titleBlockHeight + (drawableHeight - imgHeight) / 2,
      width: imgWidth,
      height: imgHeight,
    });
  }

  // 表題欄（右下）
  const tbX = paperDim.width - 230;
  const tbY = 20;
  const tbWidth = 200;
  const tbHeight = 60;

  page.drawRectangle({
    x: tbX,
    y: tbY,
    width: tbWidth,
    height: tbHeight,
    borderColor: rgb(0.5, 0.5, 0.5),
    borderWidth: 0.5,
  });

  page.drawText(settings.siteName || '', {
    x: tbX + 8,
    y: tbY + tbHeight - 16,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawText(settings.companyName || '', {
    x: tbX + 8,
    y: tbY + tbHeight - 32,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  page.drawText(settings.date || '', {
    x: tbX + 8,
    y: tbY + 8,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText(settings.scale !== 'auto' ? `S=${settings.scale}` : '', {
    x: tbX + tbWidth - 50,
    y: tbY + 8,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
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
