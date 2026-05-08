'use client';

import { useEffect } from 'react';

/**
 * Service Worker 登録用 client component。
 * app/layout.tsx の <body> 内で呼び出し、 PWA installability 要件を満たす。
 *
 * 登録は client mount 後に async で実行 (= SSR 影響なし、 失敗時は silent)。
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 登録失敗時は silent (= localhost http 等の制限環境を想定)
      });
    }
  }, []);
  return null;
}
