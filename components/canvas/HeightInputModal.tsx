'use client';

import React, { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import NumInput from '@/components/ui/NumInput';

export default function HeightInputModal() {
  const {
    canvasData,
    heightInputMarkerId,
    setHeightInputMarkerId,
    updateHeightMarker,
    removeHeightMarker,
  } = useCanvasStore();

  const marker = heightInputMarkerId
    ? (canvasData.heightMarkers ?? []).find((m) => m.id === heightInputMarkerId)
    : null;

  // marker が消えた場合 (= 削除直後の race フォールバック) は閉じる
  useEffect(() => {
    if (heightInputMarkerId && !marker) setHeightInputMarkerId(null);
  }, [heightInputMarkerId, marker, setHeightInputMarkerId]);

  if (!marker) return null;

  const heightM = marker.heightMm / 1000;

  const handleChange = (v: number) => {
    // 範囲: 0..99 m (= NumInput min=0、 max は onChange 側で clamp)
    const clamped = Math.max(0, Math.min(99, v));
    updateHeightMarker(marker.id, { heightMm: Math.round(clamped * 1000) });
  };

  const handleDelete = () => {
    removeHeightMarker(marker.id);
    setHeightInputMarkerId(null);
  };

  const handleClose = () => setHeightInputMarkerId(null);

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-center justify-center">
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-xs mx-4 w-full">
        <h2 className="text-base text-canvas font-bold mb-4">高さ入力</h2>
        <div className="flex items-center gap-2 mb-5">
          <NumInput
            value={heightM}
            onChange={handleChange}
            min={0}
            step={0.1}
          />
          <span className="text-sm text-canvas">m</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-bold"
          >
            削除
          </button>
          <button
            onClick={handleClose}
            className="flex-1 py-2 bg-accent text-white rounded-xl text-sm font-bold"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
