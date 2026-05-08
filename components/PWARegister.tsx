'use client';

import { useEffect } from 'react';

/**
 * Service Worker 登録用 client component。
 * app/layout.tsx の <body> 内で呼び出し、 PWA installability 要件を満たす。
 *
 * 登録は client mount 後に async で実行 (= SSR 影響なし、 失敗時は silent)。
 *
 * Task 3 (= offline cache): 本番のみ SW を有効化
 *   - dev 環境の hot reload と SW cache 衝突を回避
 *   - dev で過去に登録された SW は明示的に unregister + cadpassport-*
 *     cache を削除 (= dev 開発体験保護、 本番から dev へ切り替え時の保険)
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 登録失敗時は silent (= localhost http 等の制限環境を想定)
      });
    } else {
      // dev: 既存 SW を unregister + cadpassport-* cache を明示削除
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((k) => {
            if (k.startsWith('cadpassport-')) caches.delete(k);
          });
        });
      }
    }
  }, []);
  return null;
}
