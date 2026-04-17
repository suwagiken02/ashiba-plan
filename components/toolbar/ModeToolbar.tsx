'use client';
import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { ModeType } from '@/types';

export default function ModeToolbar() {
  const { mode, setMode, isMeasuring, toggleMeasuring, measureResultMm } = useCanvasStore();

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
    if (id === 'select' || id === 'memo' || id === 'erase') {
      setMode(id as ModeType);
    } else if (id === 'kutai') {
      setMode(mode === 'obstacle' ? 'obstacle' : 'building');
    } else if (id === 'buzai') {
      setMode(mode === 'post' ? 'post' : mode === 'anti' ? 'anti' : 'handrail');
    } else if (id === 'scaffold') {
      useCanvasStore.getState().setShowScaffoldStart(true);
    } else if (id === 'auto') {
      useCanvasStore.getState().setShowAutoLayout(true);
    } else if (id === 'settings') {
      useCanvasStore.getState().setShowSettings(true);
    }
  };

  const isActive = (id: string) => {
    if (id === 'select') return mode === 'select' && !isMeasuring;
    if (id === 'kutai') return isKutaiMode && !isMeasuring;
    if (id === 'buzai') return isBuzaiMode && !isMeasuring;
    if (id === 'memo') return mode === 'memo' && !isMeasuring;
    if (id === 'erase') return mode === 'erase' && !isMeasuring;
    return false;
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-dark-surface border-t border-dark-border safe-area-bottom">
        {/* 躯体サブタブ */}
        {isKutaiMode && (
          <div className="flex border-b border-dark-border px-2 pt-1">
            {[
              { label: '建物1F', action: () => { useCanvasStore.getState().setShowBuildingModal(true); } },
              { label: '建物2F', action: () => { useCanvasStore.getState().setShowBuilding2FModal(true); } },
              { label: '障害物', action: () => setMode('obstacle') },
            ].map((m, i) => (
              <button key={i} onClick={m.action}
                className={`px-4 py-1 text-xs rounded-t-lg mr-1 transition-colors ${
                  m.label === '障害物' && mode === 'obstacle' ? 'bg-accent text-white' : 'text-dimension hover:text-canvas'
                }`}>{m.label}</button>
            ))}
          </div>
        )}

        {/* 部材サブタブ */}
        {isBuzaiMode && (
          <div className="flex border-b border-dark-border px-2 pt-1">
            {([
              { id: 'handrail' as ModeType, label: '手摺' },
              { id: 'post' as ModeType, label: '支柱' },
              { id: 'anti' as ModeType, label: 'アンチ' },
            ]).map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`px-4 py-1 text-xs rounded-t-lg mr-1 transition-colors ${
                  mode === m.id ? 'bg-accent text-white' : 'text-dimension hover:text-canvas'
                }`}>{m.label}</button>
            ))}
          </div>
        )}

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

        {/* 計測結果表示 */}
        {isMeasuring && measureResultMm !== null && (
          <div className="flex justify-center pb-1">
            <span className="text-sm font-mono font-bold text-accent bg-accent/10 px-3 py-0.5 rounded-full">
              {measureResultMm}mm
            </span>
          </div>
        )}
      </div>
    </>
  );
}
