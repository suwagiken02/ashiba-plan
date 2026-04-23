'use client';
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore } from '@/stores/canvasStore';
import { MemoShape } from '@/types';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';

type Props = { onClose: () => void };

const SHAPES: { id: MemoShape; label: string; path: (w: number, h: number) => string }[] = [
  { id: 'rect', label: '角丸四角', path: (w, h) => `M8 0 H${w-8} Q${w} 0 ${w} 8 V${h-8} Q${w} ${h} ${w-8} ${h} H8 Q0 ${h} 0 ${h-8} V8 Q0 0 8 0 Z` },
  { id: 'cloud', label: '雲形', path: (w, h) => {
    const r = h / 3;
    return `M${r} ${h/2} Q${r} 0 ${w/3} ${r} Q${w/2} 0 ${w*2/3} ${r} Q${w-r} 0 ${w-r} ${h/2} Q${w} ${h} ${w-r} ${h*3/4} Q${w*2/3} ${h} ${w/2} ${h*3/4} Q${w/3} ${h} ${r} ${h*3/4} Q0 ${h} ${r} ${h/2} Z`;
  }},
  { id: 'circle', label: '丸', path: (w, h) => `M${w/2} 0 A${w/2} ${h/2} 0 1 1 ${w/2} ${h} A${w/2} ${h/2} 0 1 1 ${w/2} 0 Z` },
  { id: 'speech', label: '吹き出し', path: (w, h) => `M8 0 H${w-8} Q${w} 0 ${w} 8 V${h-16} Q${w} ${h-8} ${w-8} ${h-8} H${w/2+10} L${w/2} ${h} L${w/2-4} ${h-8} H8 Q0 ${h-8} 0 ${h-16} V8 Q0 0 8 0 Z` },
];

export default function MemoCreateModal({ onClose }: Props) {
  const lastSettings = useCanvasStore.getState().lastMemoSettings;
  const [shape, setShape] = useState<MemoShape>(lastSettings?.shape || 'rect');
  const [text, setText] = useState(lastSettings?.text || '');
  const [angle, setAngle] = useState(lastSettings?.angle || 0);
  const [scaleX, setScaleX] = useState(Math.round((lastSettings?.scaleX || 1) * 100));
  const [scaleY, setScaleY] = useState(Math.round((lastSettings?.scaleY || 1) * 100));
  const [lockScale, setLockScale] = useState(true);

  const handleDragStart = () => {
    if (!text.trim()) return;
    const settings = { shape, text, angle, scaleX: scaleX / 100, scaleY: scaleY / 100 };
    useCanvasStore.getState().setMemoDraft(settings);
    useCanvasStore.getState().setLastMemoSettings(settings);
    useCanvasStore.getState().setMode('memo');
    onClose();
  };

  /** スマホ用: キャンバス画面中央へ即配置 */
  const handlePlaceAtCenter = () => {
    if (!text.trim()) return;
    const settings = { shape, text, angle, scaleX: scaleX / 100, scaleY: scaleY / 100 };
    const s = useCanvasStore.getState();
    const gridPx = INITIAL_GRID_PX * s.zoom;
    const cx = Math.round((s.canvasSize.width / 2 - s.panX) / gridPx);
    const cy = Math.round((s.canvasSize.height / 2 - s.panY) / gridPx);
    s.addMemo({
      id: uuidv4(),
      x: cx,
      y: cy,
      text: settings.text,
      style: settings.shape,
      shape: settings.shape,
      angle: settings.angle,
      scaleX: settings.scaleX,
      scaleY: settings.scaleY,
    });
    s.setLastMemoSettings(settings);
    onClose();
  };

  const previewShape = SHAPES.find(s => s.id === shape)!;
  const previewW = 160 * (scaleX / 100);
  const previewH = 80 * (scaleY / 100);
  const lines = (text || 'プレビュー').split('\n');

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-md w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg">メモ作成</h2>

        {/* 吹き出しの形 */}
        <div>
          <label className="text-sm text-dimension mb-2 block">吹き出しの形</label>
          <div className="grid grid-cols-4 gap-2">
            {SHAPES.map(s => (
              <button key={s.id} onClick={() => setShape(s.id)}
                className={`flex flex-col items-center p-2 rounded-lg border transition-colors ${
                  shape === s.id ? 'border-accent bg-accent/10' : 'border-dark-border'
                }`}>
                <svg width={40} height={30} viewBox="0 0 60 40">
                  <path d={s.path(60, 40)} fill="none" stroke="currentColor" strokeWidth={2} className={shape === s.id ? 'text-accent' : 'text-dimension'} />
                </svg>
                <span className="text-[10px] mt-1">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* プレビュー（ドラッグで配置） */}
        <div
          className="flex flex-col items-center justify-center p-4 bg-dark-bg rounded-lg cursor-grab active:cursor-grabbing select-none"
          style={{ minHeight: 140, touchAction: 'none' }}
          onPointerDown={() => handleDragStart()}
        >
          <svg width={previewW + 40} height={previewH + 40}>
            <g transform={`translate(${(previewW + 40) / 2}, ${(previewH + 40) / 2}) rotate(${angle}) translate(${-previewW / 2}, ${-previewH / 2})`}>
              <path d={previewShape.path(previewW, previewH)} fill="rgba(55, 138, 221, 0.2)" stroke="#378ADD" strokeWidth={2} />
              {lines.map((line, i) => (
                <text key={i} x={previewW / 2} y={previewH / 2 + (i - (lines.length - 1) / 2) * 16}
                  textAnchor="middle" dominantBaseline="central" fill="white" fontSize={14}>
                  {line}
                </text>
              ))}
            </g>
          </svg>
          <span className="text-[10px] text-dimension mt-2">{text.trim() ? 'ここからドラッグしてキャンバスに配置' : 'テキストを入力してください'}</span>
        </div>

        {/* テキスト入力 */}
        <div>
          <label className="text-sm text-dimension mb-1 block">テキスト</label>
          <textarea value={text} onChange={e => setText(e.target.value)}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm resize-none"
            placeholder="メモ内容を入力（Enterで改行）"
            rows={3}
            autoFocus />
        </div>

        {/* 角度 */}
        <div>
          <label className="text-sm text-dimension mb-1 block">角度: {angle}°</label>
          <input type="range" min={-180} max={180} value={angle} onChange={e => setAngle(Number(e.target.value))}
            className="w-full" />
        </div>

        {/* 縦横比ロック */}
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input type="checkbox" checked={lockScale} onChange={e => setLockScale(e.target.checked)}
            className="w-4 h-4 rounded border-dark-border accent-accent" />
          <span className="text-xs text-dimension">縦横比ロック</span>
        </label>

        {/* サイズ */}
        {lockScale ? (
          <div>
            <label className="text-sm text-dimension mb-1 block">サイズ: {scaleX}%</label>
            <input type="range" min={50} max={200} value={scaleX} onChange={e => {
              const v = Number(e.target.value);
              setScaleX(v); setScaleY(v);
            }} className="w-full" />
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm text-dimension mb-1 block">横倍率: {scaleX}%</label>
              <input type="range" min={50} max={200} value={scaleX} onChange={e => setScaleX(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-sm text-dimension mb-1 block">縦倍率: {scaleY}%</label>
              <input type="range" min={50} max={200} value={scaleY} onChange={e => setScaleY(Number(e.target.value))} className="w-full" />
            </div>
          </>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-dark-border rounded-xl text-sm text-dimension">
            キャンセル
          </button>
          {/* スマホ: 中央に即配置 */}
          <button onClick={handlePlaceAtCenter} disabled={!text.trim()}
            className="sm:hidden flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-bold disabled:opacity-50">
            中央に配置
          </button>
          {/* PC: 配置モードへ切替 (ドラッグ or クリックで配置) */}
          <button onClick={handleDragStart} disabled={!text.trim()}
            className="hidden sm:block flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-bold disabled:opacity-50">
            配置モードへ
          </button>
        </div>
      </div>
    </div>
  );
}
