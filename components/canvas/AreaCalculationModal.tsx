'use client';

import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

export default function AreaCalculationModal() {
  const { showAreaCalcModal, setShowAreaCalcModal } = useCanvasStore();
  if (!showAreaCalcModal) return null;

  const handleClose = () => setShowAreaCalcModal(false);

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-center justify-center">
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-xs mx-4 w-full">
        <h2 className="text-base text-canvas font-bold mb-4">平米計算</h2>
        <p className="text-sm text-dimension mb-5">実装中</p>
        <button
          onClick={handleClose}
          className="w-full py-2 bg-accent text-white rounded-xl text-sm font-bold"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
