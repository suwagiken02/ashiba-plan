'use client';

import { useEffect, useState } from 'react';

// アプリ内 webview 検知用の user-agent regex。
// LINE / Twitter (X) / Facebook / Instagram / Slack / Discord /
// WeChat / Android WebView 一般 をカバー。
const WEBVIEW_REGEX = /Line\/|Twitter|FBAN|FBAV|FB_IAB|Instagram|Slack|Discord|MicroMessenger|; wv\)/i;

/**
 * アプリ内 webview からのアクセスかを判定する hook。
 * SSR safe (= 初期値 false、 client mount 後に判定)。
 *
 * 用途: Google OAuth は Google "Use secure browsers" ポリシーで
 *       embedded webview からの認証を禁止 (= 2023〜)。
 *       webview 内では Google ログインボタンを非表示にする。
 */
export function useIsWebView(): boolean {
  const [isWebView, setIsWebView] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator?.userAgent) {
      setIsWebView(WEBVIEW_REGEX.test(navigator.userAgent));
    }
  }, []);
  return isWebView;
}
