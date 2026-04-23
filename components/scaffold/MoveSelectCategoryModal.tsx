'use client';
import React, { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

type CategoryKey = 'scaffold' | 'building' | 'obstacle' | 'memo';
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  scaffold: '足場部材',
  building: '建物',
  obstacle: '障害物',
  memo: 'メモ',
};

export default function MoveSelectCategoryModal() {
  const {
    moveSelectMode,
    setMoveSelectCategories,
    confirmCategorySelection,
    cancelMoveSelectMode,
  } = useCanvasStore();

  const show = moveSelectMode.active && moveSelectMode.step === 'category';

  // Esc でキャンセル
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelMoveSelectMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, cancelMoveSelectMode]);

  if (!show) return null;

  const { categories } = moveSelectMode;
  const hasAny = categories.scaffold || categories.building || categories.obstacle || categories.memo;

  const toggle = (key: CategoryKey) => {
    setMoveSelectCategories({ ...categories, [key]: !categories[key] });
  };

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-center justify-center">
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-sm mx-4 w-full shadow-2xl">
        <h3 className="font-bold text-sm text-canvas mb-3">移動対象のカテゴリを選択</h3>

        <div className="space-y-1 mb-3">
          {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((k) => (
            <label
              key={k}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-dark-bg border border-dark-border cursor-pointer select-none hover:border-accent/50 transition-colors"
            >
              <input
                type="checkbox"
                checked={categories[k]}
                onChange={() => toggle(k)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-canvas">{CATEGORY_LABELS[k]}</span>
            </label>
          ))}
        </div>

        <p className="text-[10px] text-dimension text-center mb-3">※ 複数選択可</p>

        <div className="flex gap-2">
          <button
            onClick={cancelMoveSelectMode}
            className="flex-1 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dimension text-sm font-bold"
          >
            キャンセル
          </button>
          <button
            onClick={confirmCategorySelection}
            disabled={!hasAny}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            決定
          </button>
        </div>
      </div>
    </div>
  );
}
