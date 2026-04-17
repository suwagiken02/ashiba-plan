'use client';
import React, { useState } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { ModeType } from '@/types';

export default function ModeToolbar() {
  const { mode, setMode, isMeasuring, toggleMeasuring, showPartSelector } = useCanvasStore();
  const [showKutaiMenu, setShowKutaiMenu] = useState(false);

  // 躯体グループ（建物・障害物）
  const isKutaiMode = mode === 'building' || mode === 'obstacle';
  // 部材グループ（手摺・支柱・アンチ）
  const isBuzaiMode = mode === 'handrail' || mode === 'post' || mode === 'anti';

  const mainButtons = [
    { id: 'select' as const, label: '選択', icon: '↖' },
    { id: 'kutai' as const, label: '躯体', icon: '⌂' },
    { id: 'buzai' as const, label: '部材', icon: '━' },
    { id: 'scaffold' as const, label: '足場開始', icon: '⚑' },
    { id: 'auto' as const, label: '自動割付', icon: '⚡' },
    { id: 'memo' as const, label: 'メモ', icon: 'T' },
    { id: 'erase' as const, label: '消去', icon: '✕' },
    { id: 'settings' as const, label: '設定', icon: '⚙' },
  ];

  const handleMainButton = (id: string) => {
    if (isMeasuring) toggleMeasuring();
    if (id === 'select' || id === 'erase') {
      setMode(id as ModeType);
    } else if (id === 'memo') {
      useCanvasStore.getState().setShowMemoCreateModal(true);
    } else if (id === 'kutai') {
      setShowKutaiMenu(true);
    } else if (id === 'buzai') {
      useCanvasStore.getState().togglePartSelector();
    } else if (id === 'scaffold') {
      useCanvasStore.getState().setShowScaffoldStart(true);
    } else if (id === 'auto') {
      useCanvasStore.getState().setShowAutoLayout(true);
    } else if (id === 'settings') {
      if (window.innerWidth < 640) {
        useCanvasStore.getState().setShowSettings(true);
      } else {
        useCanvasStore.getState().toggleSettingsPanel();
      }
    }
  };

  const isActive = (id: string) => {
    if (id === 'select') return mode === 'select' && !isMeasuring;
    if (id === 'kutai') return isKutaiMode && !isMeasuring;
    if (id === 'buzai') return showPartSelector;
    if (id === 'memo') return mode === 'memo' && !isMeasuring;
    if (id === 'erase') return mode === 'erase' && !isMeasuring;
    return false;
  };

  return (
    <>
      {/* 躯体選択メニュー */}
      {showKutaiMenu && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowKutaiMenu(false)} />
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-dark-surface border border-dark-border rounded-2xl shadow-2xl p-4 flex gap-3">
            <button
              onClick={() => {
                useCanvasStore.getState().setShowBuildingModal(true);
                setShowKutaiMenu(false);
              }}
              className="flex flex-col items-center justify-center w-24 h-24 rounded-xl bg-accent/10 border-2 border-accent text-accent hover:bg-accent/20 transition-colors"
            >
              <span className="text-3xl mb-1">⌂</span>
              <span className="text-sm font-bold">建物1F</span>
            </button>
            <button
              onClick={() => {
                useCanvasStore.getState().setShowBuilding2FModal(true);
                setShowKutaiMenu(false);
              }}
              className="flex flex-col items-center justify-center w-24 h-24 rounded-xl bg-accent/10 border-2 border-accent text-accent hover:bg-accent/20 transition-colors"
            >
              <span className="text-3xl mb-1">⌂</span>
              <span className="text-sm font-bold">建物2F</span>
            </button>
            <button
              onClick={() => {
                setMode('obstacle');
                setShowKutaiMenu(false);
              }}
              className="flex flex-col items-center justify-center w-24 h-24 rounded-xl bg-accent/10 border-2 border-accent text-accent hover:bg-accent/20 transition-colors"
            >
              <span className="text-3xl mb-1">⬒</span>
              <span className="text-sm font-bold">障害物</span>
            </button>
          </div>
        </>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-dark-surface border-t border-dark-border safe-area-bottom">
        {/* メインボタン */}
        <div className="flex justify-around items-center px-0.5 py-1">
          {mainButtons.map((m) => (
            <button key={m.id} onClick={() => handleMainButton(m.id)}
              className={`flex-col items-center justify-center py-2 px-1 rounded-lg min-w-[36px] transition-colors ${
                isActive(m.id) ? 'bg-accent text-white' : 'text-dimension hover:text-canvas'
              } ${'smOnly' in m && m.smOnly ? 'flex sm:hidden' : 'flex'}`}
            >
              <span className="text-base leading-none">{m.icon}</span>
              <span className="text-[9px] mt-0.5">{m.label}</span>
            </button>
          ))}
        </div>

      </div>
    </>
  );
}
