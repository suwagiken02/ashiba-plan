'use client';
import { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

/** 起動時、viewport が sm 未満（スマホ）なら showDimensions を OFF にする。PC (>=640px) は初期値 true のまま。 */
export default function ShowDimensionsInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 640) {
      useCanvasStore.getState().setShowDimensions(false);
    }
  }, []);
  return null;
}
