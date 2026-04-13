import Konva from 'konva';

export const exportToPng = async (siteName: string): Promise<void> => {
  const stages = Konva.stages;
  if (stages.length === 0) return;

  const stage = stages[0];
  const dataUrl = stage.toDataURL({ pixelRatio: 3 });

  const link = document.createElement('a');
  link.download = `${siteName || '図面'}_平面図.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
