'use client';
import React, { useState, useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import NumInput from '@/components/ui/NumInput';
import { CanvasData } from '@/types';

const STEP_OPTIONS: (1 | 10 | 100)[] = [1, 10, 100];

type CategoryKey = 'scaffold' | 'building' | 'obstacle' | 'memo';
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  scaffold: '足場部材',
  building: '建物',
  obstacle: '障害物',
  memo: 'メモ',
};

function getCategoryIdSet(cat: CategoryKey, canvasData: CanvasData): Set<string> {
  switch (cat) {
    case 'scaffold':
      return new Set([
        ...canvasData.handrails.map(h => h.id),
        ...canvasData.posts.map(p => p.id),
        ...canvasData.antis.map(a => a.id),
      ]);
    case 'building':
      return new Set(canvasData.buildings.map(b => b.id));
    case 'obstacle':
      return new Set(canvasData.obstacles.map(o => o.id));
    case 'memo':
      return new Set(canvasData.memos.map(m => m.id));
  }
}

export default function MoveSelectControlPanel() {
  const {
    mode,
    moveSelectMode,
    canvasData,
    scaffoldMoveStep,
    setScaffoldMoveStep,
    setMoveSelectCategories,
    setMoveSelectIds,
    clearMoveSelectIds,
    shiftMoveSelected,
    commitMoveSelectMode,
    cancelMoveSelectMode,
  } = useCanvasStore();

  const [dxInput, setDxInput] = useState(0);
  const [dyInput, setDyInput] = useState(0);

  // Esc でキャンセル
  useEffect(() => {
    if (mode !== 'move-select') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelMoveSelectMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, cancelMoveSelectMode]);

  if (mode !== 'move-select') return null;

  const { categories, selectedIds, dxMm, dyMm } = moveSelectMode;
  const step = scaffoldMoveStep;

  /** カテゴリ切替: OFF 化時は該当カテゴリの selectedIds を除外、シフトを再適用 */
  const handleCategoryToggle = (cat: CategoryKey) => {
    const newValue = !categories[cat];
    const newCategories = { ...categories, [cat]: newValue };
    setMoveSelectCategories(newCategories);
    if (!newValue) {
      const catIds = getCategoryIdSet(cat, canvasData);
      const newIds = selectedIds.filter(id => !catIds.has(id));
      setMoveSelectIds(newIds);
    }
    // 選択条件が変わったので現在の dxMm/dyMm で再シフト（無関係要素は backup に戻る）
    shiftMoveSelected(dxMm, dyMm);
  };

  /** 全選択: チェック済みカテゴリの全要素を selectedIds に入れる */
  const handleSelectAll = () => {
    const ids: string[] = [];
    if (categories.scaffold) {
      ids.push(
        ...canvasData.handrails.map(h => h.id),
        ...canvasData.posts.map(p => p.id),
        ...canvasData.antis.map(a => a.id),
      );
    }
    if (categories.building) ids.push(...canvasData.buildings.map(b => b.id));
    if (categories.obstacle) ids.push(...canvasData.obstacles.map(o => o.id));
    if (categories.memo) ids.push(...canvasData.memos.map(m => m.id));
    setMoveSelectIds(ids);
    shiftMoveSelected(dxMm, dyMm);
  };

  const handleClearSelection = () => {
    clearMoveSelectIds();
    shiftMoveSelected(dxMm, dyMm);
  };

  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-24 z-50 bg-dark-surface/95 backdrop-blur-sm border border-dark-border rounded-2xl shadow-2xl p-4 w-[360px] max-w-[calc(100vw-24px)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-canvas">選択移動</h3>
        <span className="text-[10px] text-dimension">Esc でキャンセル</span>
      </div>

      {/* カテゴリチェックボックス */}
      <div className="mb-3">
        <p className="text-[10px] text-dimension mb-1">対象カテゴリ（複数選択可）</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((k) => (
            <label key={k} className="flex items-center gap-1 text-xs text-canvas cursor-pointer select-none">
              <input
                type="checkbox"
                checked={categories[k]}
                onChange={() => handleCategoryToggle(k)}
                className="w-3.5 h-3.5 accent-accent"
              />
              {CATEGORY_LABELS[k]}
            </label>
          ))}
        </div>
      </div>

      {/* 選択操作 */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={handleSelectAll}
          className="px-3 py-1 rounded-lg bg-dark-bg border border-dark-border text-canvas text-xs"
        >
          全選択
        </button>
        <button
          onClick={handleClearSelection}
          className="px-3 py-1 rounded-lg bg-dark-bg border border-dark-border text-canvas text-xs"
        >
          選択解除
        </button>
        <span className="ml-auto text-[11px] text-dimension">
          選択中: <span className="text-accent font-bold">{selectedIds.length}</span>個
        </span>
      </div>

      {/* 数値入力（X / Y）— 適用で累積加算 */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-dimension w-6">X</span>
          <NumInput
            value={dxInput}
            onChange={setDxInput}
            min={-100000}
            step={1}
            className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-sm font-mono"
          />
          <span className="text-[10px] text-dimension">mm</span>
          <button
            onClick={() => { shiftMoveSelected(dxMm + dxInput, dyMm); setDxInput(0); }}
            className="px-3 py-1.5 rounded-lg bg-accent/15 border border-accent text-accent text-xs font-bold"
          >
            適用
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dimension w-6">Y</span>
          <NumInput
            value={dyInput}
            onChange={setDyInput}
            min={-100000}
            step={1}
            className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-sm font-mono"
          />
          <span className="text-[10px] text-dimension">mm</span>
          <button
            onClick={() => { shiftMoveSelected(dxMm, dyMm + dyInput); setDyInput(0); }}
            className="px-3 py-1.5 rounded-lg bg-accent/15 border border-accent text-accent text-xs font-bold"
          >
            適用
          </button>
        </div>
      </div>

      {/* 累積移動量表示 */}
      <div className="text-center text-[11px] text-dimension mb-2">
        累積移動: X={dxMm}mm / Y={dyMm}mm
      </div>

      {/* ステップ切替 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-dimension shrink-0">ステップ:</span>
        {STEP_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setScaffoldMoveStep(s)}
            className={`flex-1 py-1 rounded-lg text-xs font-mono border transition-colors ${
              step === s ? 'bg-accent text-white border-accent' : 'border-dark-border text-dimension'
            }`}
          >
            {s}mm
          </button>
        ))}
      </div>

      {/* 矢印ボタン */}
      <div className="grid grid-cols-3 gap-1 mb-3 w-40 mx-auto">
        <div />
        <button
          onClick={() => shiftMoveSelected(dxMm, dyMm - step)}
          className="h-10 rounded-lg bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-lg"
          aria-label="上に移動"
        >
          ↑
        </button>
        <div />
        <button
          onClick={() => shiftMoveSelected(dxMm - step, dyMm)}
          className="h-10 rounded-lg bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-lg"
          aria-label="左に移動"
        >
          ←
        </button>
        <div className="h-10 flex items-center justify-center text-[10px] text-dimension font-mono">
          {step}mm
        </div>
        <button
          onClick={() => shiftMoveSelected(dxMm + step, dyMm)}
          className="h-10 rounded-lg bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-lg"
          aria-label="右に移動"
        >
          →
        </button>
        <div />
        <button
          onClick={() => shiftMoveSelected(dxMm, dyMm + step)}
          className="h-10 rounded-lg bg-dark-bg border border-dark-border text-canvas hover:border-accent/50 text-lg"
          aria-label="下に移動"
        >
          ↓
        </button>
        <div />
      </div>

      {/* 確定 / リセット / キャンセル */}
      <div className="flex gap-2">
        <button
          onClick={cancelMoveSelectMode}
          className="flex-1 py-2 rounded-lg bg-dark-bg border border-dark-border text-dimension text-xs font-bold"
        >
          キャンセル
        </button>
        <button
          onClick={() => shiftMoveSelected(0, 0)}
          className="flex-1 py-2 rounded-lg bg-dark-bg border border-dark-border text-dimension text-xs font-bold"
        >
          リセット
        </button>
        <button
          onClick={commitMoveSelectMode}
          className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-bold"
        >
          確定
        </button>
      </div>

      <p className="mt-2 text-[10px] text-dimension text-center">
        キャンバスをタップ/ドラッグで選択
      </p>
    </div>
  );
}
