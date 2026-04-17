'use client';
import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const {
    isDarkMode, toggleDarkMode,
    showKidare, toggleShowKidare,
    showDimensions, toggleShowDimensions,
    showCornerGuide, toggleShowCornerGuide,
    gridStrength, setGridStrength,
  } = useCanvasStore();

  const items = [
    { label: 'ダークモード', value: isDarkMode, toggle: toggleDarkMode, icon: isDarkMode ? '☀️' : '🌙' },
    { label: '離れ表示', value: showKidare, toggle: toggleShowKidare, icon: '↔' },
    { label: '寸法表示', value: showDimensions, toggle: toggleShowDimensions, icon: '⤢' },
    { label: 'コーナーガイド', value: showCornerGuide, toggle: toggleShowCornerGuide, icon: '⌐' },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 sm:hidden" onClick={onClose} />
      <div className="fixed bottom-16 left-0 right-0 z-50 sm:hidden bg-dark-surface border-t border-dark-border rounded-t-2xl p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">設定</h3>
          <button onClick={onClose} className="text-dimension text-lg px-2">✕</button>
        </div>
        {items.map(item => (
          <button key={item.label} onClick={item.toggle}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-dark-bg rounded-xl border border-dark-border">
            <span className="text-sm flex items-center gap-2">
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </span>
            <span className={`w-10 h-6 rounded-full transition-colors flex items-center ${item.value ? 'bg-accent' : 'bg-dark-border'}`}>
              <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${item.value ? 'translate-x-4' : 'translate-x-0'}`} />
            </span>
          </button>
        ))}
        {/* グリッド強弱 */}
        <div className="px-3 py-2.5 bg-dark-bg rounded-xl border border-dark-border">
          <span className="text-sm">グリッド強弱</span>
          <div className="flex gap-2 mt-2">
            {['弱', '中', '強'].map((label, i) => (
              <button key={i} onClick={() => setGridStrength(i)}
                className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${
                  gridStrength === i ? 'bg-accent text-white border-accent' : 'border-dark-border text-dimension'
                }`}>{label}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
