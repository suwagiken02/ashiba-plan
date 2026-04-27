'use client';
import React, { useState, useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { ModeType } from '@/types';

export default function ModeToolbar() {
  const { mode, setMode, isMeasuring, toggleMeasuring, showPartSelector, canvasData } = useCanvasStore();
  const [showKutaiMenu, setShowKutaiMenu] = useState(false);
  const [showAshibaMenu, setShowAshibaMenu] = useState(false);
  const [dismissedStage, setDismissedStage] = useState<string | null>(null);

  // 躯体グループ（建物・障害物）
  const isKutaiMode = mode === 'building' || mode === 'obstacle';

  const mainButtons = [
    { id: 'select' as const, label: '選択', icon: '↖', color: '#378ADD' },
    { id: 'kutai' as const, label: '躯体', icon: '⌂', color: '#4ECDC4' },
    { id: 'scaffold' as const, label: '足場開始', icon: '⚑', color: '#FF6B6B' },
    { id: 'ashiba' as const, label: '足場', icon: '▦', color: '#FFD700' },
    { id: 'buzai' as const, label: '部材', icon: '━', color: '#FFA500' },
    { id: 'memo' as const, label: 'メモ', icon: 'T', color: '#DDA0DD' },
    { id: 'erase' as const, label: '消去', icon: '✕', color: '#EF4444' },
    { id: 'settings' as const, label: '設定', icon: '⚙', color: '#96CEB4' },
  ];

  // ガイド点滅
  const hasBuildings = canvasData.buildings.length > 0;
  const hasScaffoldStart = !!(canvasData.scaffoldStart1F || canvasData.scaffoldStart2F || canvasData.scaffoldStart);
  const hasHandrails = canvasData.handrails.length > 0;

  const getCurrentStage = (): string | null => {
    if (!hasBuildings) return 'kutai';
    if (!hasScaffoldStart) return 'scaffold';
    return 'buzai';
  };

  const currentStage = getCurrentStage();
  const highlightId = (currentStage && currentStage !== dismissedStage) ? currentStage : null;

  // ステージが変わったらdismissをリセット
  useEffect(() => {
    setDismissedStage(null);
  }, [hasBuildings, hasScaffoldStart]);

  const handleMainButton = (id: string) => {
    const stage = getCurrentStage();
    if (stage === 'kutai') setDismissedStage('kutai');
    if (stage === 'scaffold') setDismissedStage('scaffold');
    if (stage === 'buzai' && (id === 'buzai' || id === 'ashiba')) setDismissedStage('buzai');
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
      const s = useCanvasStore.getState();
      if (s.canvasData.buildings.length === 0) {
        s.setAlertMessage('建物がありません。先に躯体メニューから建物を作成してください');
        return;
      }
      s.setShowScaffoldStart(true);
    } else if (id === 'ashiba') {
      setShowAshibaMenu(true);
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

      {/* 足場メニュー */}
      {showAshibaMenu && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowAshibaMenu(false)} />
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-dark-surface border border-dark-border rounded-2xl shadow-2xl p-4 flex gap-3 flex-wrap justify-center max-w-[calc(100vw-32px)]">
            {/* 移動（選択移動モードに入る: カテゴリ別＋選択範囲のみ移動） */}
            <button
              onClick={() => {
                useCanvasStore.getState().enterMoveSelectMode();
                setShowAshibaMenu(false);
              }}
              className="flex flex-col items-center justify-center w-24 h-24 rounded-xl bg-accent/10 border-2 border-accent text-accent hover:bg-accent/20 transition-colors"
            >
              <span className="text-3xl mb-1">↔</span>
              <span className="text-xs font-bold">移動</span>
            </button>
            {/* 入れ替え（既存の toggleReorderMode を呼ぶ） */}
            <button
              onClick={() => {
                useCanvasStore.getState().toggleReorderMode();
                setShowAshibaMenu(false);
              }}
              className="flex flex-col items-center justify-center w-24 h-24 rounded-xl bg-accent/10 border-2 border-accent text-accent hover:bg-accent/20 transition-colors"
            >
              <span className="text-3xl mb-1">⇄</span>
              <span className="text-xs font-bold">入れ替え</span>
            </button>
            {/* 自動配置（旧・自動割付） */}
            <button
              onClick={() => {
                const s = useCanvasStore.getState();
                if (s.canvasData.buildings.length === 0) {
                  s.setAlertMessage('建物がありません。先に躯体メニューから建物を作成してください');
                  setShowAshibaMenu(false);
                  return;
                }
                s.setShowAutoLayout(true);
                setShowAshibaMenu(false);
              }}
              className="flex flex-col items-center justify-center w-24 h-24 rounded-xl bg-accent/10 border-2 border-accent text-accent hover:bg-accent/20 transition-colors"
            >
              <span className="text-3xl mb-1">⚡</span>
              <span className="text-xs font-bold">自動配置</span>
            </button>
            {/* 自動内柱配置（旧機能保持） */}
            <button
              onClick={() => {
                useCanvasStore.getState().setShowInnerPost(true);
                setShowAshibaMenu(false);
              }}
              className="flex flex-col items-center justify-center w-24 h-24 rounded-xl bg-accent/10 border-2 border-accent text-accent hover:bg-accent/20 transition-colors"
            >
              <span className="text-3xl mb-1">●</span>
              <span className="text-xs font-bold">自動内柱配置</span>
            </button>
          </div>
        </>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-dark-surface border-t border-dark-border safe-area-bottom">
        {/* メインボタン */}
        <div className="flex justify-around items-center px-0.5 py-1">
          {mainButtons.map((m) => (
            <button key={m.id} onClick={() => handleMainButton(m.id)}
              className={`flex-col items-center justify-center py-2 px-1 rounded-lg min-w-[36px] transition-colors flex ${
                isActive(m.id) ? 'bg-accent text-white' : 'text-dimension hover:text-canvas'
              } ${highlightId === m.id || (highlightId === 'buzai' && m.id === 'ashiba') ? 'animate-highlight' : ''}`}
            >
              <span className="text-base leading-none" style={{ color: isActive(m.id) ? 'white' : m.color }}>{m.icon}</span>
              <span className="text-[9px] mt-0.5">{m.label}</span>
            </button>
          ))}
        </div>

      </div>
    </>
  );
}
