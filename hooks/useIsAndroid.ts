'use client';

import { useEffect, useState } from 'react';

/**
 * Android デバイスからのアクセスかを判定する hook。
 * SSR safe (= 初期値 false、 client mount 後に判定)。
 *
 * 用途: WebView 警告内の「Chrome で開く」 ボタン (= intent:// URI) を
 *       Android のみ表示するために使用 (= iOS は intent:// 非対応)。
 */
export function useIsAndroid(): boolean {
  const [isAndroid, setIsAndroid] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator?.userAgent) {
      setIsAndroid(/Android/i.test(navigator.userAgent));
    }
  }, []);
  return isAndroid;
}
