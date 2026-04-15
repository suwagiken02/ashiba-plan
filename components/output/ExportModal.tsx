'use client';

import React, { useState } from 'react';
import { PaperSize, ScaleOption } from '@/types';
import { useCanvasStore } from '@/stores/canvasStore';

type Props = {
  onClose: () => void;
  onExport: (settings: {
    format: 'pdf' | 'png' | 'dxf';
    paperSize: PaperSize;
    scale: ScaleOption;
  }) => void;
  siteName: string;
};

const PAPER_SIZES: { id: PaperSize; label: string }[] = [
  { id: 'A4_portrait', label: 'A4 縦' },
  { id: 'A4_landscape', label: 'A4 横' },
  { id: 'A3_portrait', label: 'A3 縦' },
  { id: 'A3_landscape', label: 'A3 横' },
];

const SCALES: { id: ScaleOption; label: string }[] = [
  { id: '1/50', label: '1/50' },
  { id: '1/100', label: '1/100' },
  { id: '1/200', label: '1/200' },
  { id: '1/300', label: '1/300' },
  { id: 'auto', label: '自動' },
];

export default function ExportModal({ onClose, onExport, siteName }: Props) {
  const { setPrintPaperSize, setPrintScale, printPaperSize, printScale: storeScale } = useCanvasStore();
  const [format, setFormat] = useState<'pdf' | 'png' | 'dxf'>('pdf');
  const [paperSize, setPaperSize] = useState<PaperSize>(printPaperSize);
  const [scale, setScale] = useState<ScaleOption>(storeScale);

  // 用紙・縮尺変更をストアに同期
  const handlePaperChange = (p: PaperSize) => {
    setPaperSize(p);
    setPrintPaperSize(p);
  };
  const handleScaleChange = (s: ScaleOption) => {
    setScale(s);
    setPrintScale(s);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 modal-overlay" onClick={onClose} />
      <div
        className="relative bg-dark-surface border-t sm:border border-dark-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md"
      >
        <div className="px-4 py-3 border-b border-dark-border flex items-center justify-between">
          <h2 className="font-bold text-lg">出力</h2>
          <button onClick={onClose} className="text-dimension hover:text-canvas px-2">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* 形式 */}
          <div>
            <p className="text-xs text-dimension mb-2">出力形式</p>
            <div className="flex gap-2">
              {(['pdf', 'png', 'dxf'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-3 rounded-lg text-sm font-bold uppercase ${
                    format === f ? 'bg-accent text-white' : 'bg-dark-bg text-canvas border border-dark-border'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* 用紙サイズ (PDF only) */}
          {format === 'pdf' && (
            <div>
              <p className="text-xs text-dimension mb-2">用紙サイズ</p>
              <div className="grid grid-cols-2 gap-2">
                {PAPER_SIZES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handlePaperChange(p.id)}
                    className={`py-2 rounded-lg text-sm ${
                      paperSize === p.id ? 'bg-accent text-white' : 'bg-dark-bg text-canvas border border-dark-border'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 縮尺 */}
          {format !== 'png' && (
            <div>
              <p className="text-xs text-dimension mb-2">縮尺</p>
              <div className="flex gap-2">
                {SCALES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleScaleChange(s.id)}
                    className={`flex-1 py-2 rounded-lg text-sm ${
                      scale === s.id ? 'bg-accent text-white' : 'bg-dark-bg text-canvas border border-dark-border'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={async () => {
              try {
                await onExport({ format, paperSize, scale });
              } catch (e) {
                console.error('[Export] error:', e);
                alert(`出力エラー: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            className="w-full py-3 bg-accent text-white font-bold rounded-xl text-lg"
          >
            出力する
          </button>
        </div>
      </div>
    </div>
  );
}
