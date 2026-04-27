'use client';
import { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

/**
 * 開発時のみ window.useCanvasStore に store を公開する。
 * 本番ビルドでは何もしない。M-2 のピン手動追加テスト用。
 * 後続 Phase で配置 UI が完成したら削除可。
 */
export function DevToolsExposer() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      (window as unknown as { useCanvasStore: typeof useCanvasStore }).useCanvasStore = useCanvasStore;
    }
  }, []);
  return null;
}
