import { CanvasData } from '@/types';
import { gridToMm } from '@/lib/konva/gridUtils';
import { getHandrailEndpoints } from '@/lib/konva/snapUtils';

export const exportToDxf = (canvasData: CanvasData, siteName: string): void => {
  // DXFファイルを手動構築（dxf-writerのAPIに依存）
  let dxf = '';

  // ヘッダー
  dxf += '0\nSECTION\n2\nHEADER\n0\nENDSEC\n';

  // テーブル（レイヤー定義）
  dxf += '0\nSECTION\n2\nTABLES\n';
  dxf += '0\nTABLE\n2\nLAYER\n';

  const layers = [
    { name: 'BUILDING', color: 7 },
    { name: 'ROOF', color: 8 },
    { name: 'HANDRAIL', color: 5 },
    { name: 'POST', color: 7 },
    { name: 'ANTI', color: 2 },
    { name: 'OBSTACLE', color: 3 },
    { name: 'DIMENSION', color: 8 },
    { name: 'MEMO', color: 7 },
  ];

  layers.forEach((layer) => {
    dxf += `0\nLAYER\n2\n${layer.name}\n70\n0\n62\n${layer.color}\n6\nCONTINUOUS\n`;
  });
  dxf += '0\nENDTAB\n0\nENDSEC\n';

  // エンティティ
  dxf += '0\nSECTION\n2\nENTITIES\n';

  // 建物（ポリライン）
  canvasData.buildings.forEach((b) => {
    dxf += '0\nLWPOLYLINE\n8\nBUILDING\n90\n' + b.points.length + '\n70\n1\n';
    b.points.forEach((p) => {
      dxf += `10\n${gridToMm(p.x)}\n20\n${gridToMm(p.y)}\n`;
    });
  });

  // 手摺（LINE）
  canvasData.handrails.forEach((h) => {
    const [start, end] = getHandrailEndpoints(h);
    dxf += '0\nLINE\n8\nHANDRAIL\n';
    dxf += `10\n${gridToMm(start.x)}\n20\n${gridToMm(start.y)}\n`;
    dxf += `11\n${gridToMm(end.x)}\n21\n${gridToMm(end.y)}\n`;
  });

  // 支柱（CIRCLE）
  canvasData.posts.forEach((p) => {
    dxf += '0\nCIRCLE\n8\nPOST\n';
    dxf += `10\n${gridToMm(p.x)}\n20\n${gridToMm(p.y)}\n40\n24\n`;
  });

  // アンチ（SOLID）
  canvasData.antis.forEach((a) => {
    const w = a.direction === 'horizontal' ? a.lengthMm : a.width;
    const h = a.direction === 'horizontal' ? a.width : a.lengthMm;
    const x = gridToMm(a.x);
    const y = gridToMm(a.y);
    dxf += '0\nSOLID\n8\nANTI\n';
    dxf += `10\n${x}\n20\n${y}\n`;
    dxf += `11\n${x + w}\n21\n${y}\n`;
    dxf += `12\n${x}\n22\n${y + h}\n`;
    dxf += `13\n${x + w}\n23\n${y + h}\n`;
  });

  // 障害物
  canvasData.obstacles.forEach((o) => {
    const x = gridToMm(o.x);
    const y = gridToMm(o.y);
    const w = gridToMm(o.width);
    const h = gridToMm(o.height);
    if (o.type === 'custom_circle') {
      const r = Math.max(w, h) / 2;
      dxf += `0\nCIRCLE\n8\nOBSTACLE\n10\n${x + r}\n20\n${y + r}\n40\n${r}\n`;
    } else {
      dxf += '0\nLWPOLYLINE\n8\nOBSTACLE\n90\n4\n70\n1\n';
      dxf += `10\n${x}\n20\n${y}\n`;
      dxf += `10\n${x + w}\n20\n${y}\n`;
      dxf += `10\n${x + w}\n20\n${y + h}\n`;
      dxf += `10\n${x}\n20\n${y + h}\n`;
    }
  });

  // メモ（TEXT）
  canvasData.memos.forEach((m) => {
    dxf += '0\nTEXT\n8\nMEMO\n';
    dxf += `10\n${gridToMm(m.x)}\n20\n${gridToMm(m.y)}\n40\n30\n1\n${m.text}\n`;
  });

  dxf += '0\nENDSEC\n0\nEOF\n';

  // ダウンロード
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${siteName || '図面'}_平面図.dxf`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
