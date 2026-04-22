'use client';
import { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

/** アプリ起動時に localStorage からダークモード設定を復元する（副作用のみ、UI は描画しない） */
export default function DarkModeInit() {
  useEffect(() => {
    useCanvasStore.getState().initDarkMode();
  }, []);
  return null;
}
